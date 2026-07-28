!function () {
    "use strict";

    function isHostOrSubdomain(hostname, domain) {
        return hostname === domain || hostname.endsWith('.' + domain);
    }

    function redirectUrl(originalUrl) {
        if (!originalUrl) return originalUrl;

        try {
            var url = new URL(originalUrl, window.location.origin);
            var hostname = url.hostname;

            if (hostname === 'youtube.com' || hostname === 'www.youtube.com') {
                url.protocol = 'http:';
                url.host = 'localhost:8099';
                return url.toString();
            }

            if (isHostOrSubdomain(hostname, 'googlevideo.com')) {
                return 'http://localhost:8099/media/' + url.toString();
            }

            if (isHostOrSubdomain(hostname, 'youtube.com') || isHostOrSubdomain(hostname, 'gstatic.com')
                || isHostOrSubdomain(hostname, 'google.com') || isHostOrSubdomain(hostname, 'googleapis.com')
                || isHostOrSubdomain(hostname, 'googleusercontent.com') || isHostOrSubdomain(hostname, 'ggpht.com')) {
                return 'http://localhost:8099/cors-bypass/' + url.toString();
            }
        } catch (error) {
            console.error('Failed to parse URL during interception:', error);
        }

        return originalUrl;
    }

    function toLogicalCookieString(cookieString) {
        return cookieString
            .replace(/(^|;\s*)__LocalSecure-/gi, '$1__Secure-')
            .replace(/(^|;\s*)__LocalHost-/gi, '$1__Host-');
    }

    function toLocalCookieAssignment(cookieString) {
        return cookieString
            .replace(/^(\s*)__Secure-/i, '$1__LocalSecure-')
            .replace(/^(\s*)__Host-/i, '$1__LocalHost-')
            .replace(/;\s*Domain=[^;]*/gi, '')
            .replace(/;\s*Secure\b/gi, '')
            .replace(/;\s*SameSite=None\b/gi, '');
    }

    function findPropertyDescriptor(object, propertyName) {
        var currentObject = object;

        while (currentObject) {
            var descriptor = Object.getOwnPropertyDescriptor(currentObject, propertyName);
            if (descriptor) return descriptor;
            currentObject = Object.getPrototypeOf(currentObject);
        }

        return null;
    }

    function installCookieNameCompatibility(documentObject) {
        if (documentObject.__tizentubeCookieNamesInstalled) return true;

        var descriptor = findPropertyDescriptor(documentObject, 'cookie');
        if (!descriptor || !descriptor.get || !descriptor.set) return false;

        Object.defineProperty(documentObject, 'cookie', {
            configurable: true,
            enumerable: descriptor.enumerable,
            get: function () {
                return toLogicalCookieString(descriptor.get.call(documentObject));
            },
            set: function (value) {
                descriptor.set.call(documentObject, toLocalCookieAssignment(String(value)));
            }
        });
        Object.defineProperty(documentObject, '__tizentubeCookieNamesInstalled', {
            configurable: false,
            enumerable: false,
            writable: false,
            value: true
        });

        return true;
    }

    var requestOptionKeys = [
        'method', 'mode', 'credentials', 'cache', 'redirect', 'referrer',
        'referrerPolicy', 'integrity', 'keepalive', 'signal'
    ];

    function copyRequestOptions(input, init) {
        var options = { headers: new Headers(input.headers) };

        requestOptionKeys.forEach(function (key) {
            if (input[key] !== undefined) options[key] = input[key];
        });

        if (init) {
            Object.keys(init).forEach(function (key) {
                options[key] = init[key];
            });
        }

        return options;
    }

    function fetchRedirectedRequest(originalFetch, input, targetUrl, init) {
        var options = copyRequestOptions(input, init);
        var method = (options.method || input.method || 'GET').toUpperCase();
        var hasExplicitBody = init && Object.prototype.hasOwnProperty.call(init, 'body');

        if (hasExplicitBody || method === 'GET' || method === 'HEAD') {
            return originalFetch(targetUrl, options);
        }
        if (input.bodyUsed) {
            return Promise.reject(new TypeError('Cannot redirect a Request whose body has already been consumed'));
        }

        return input.clone().blob().then(function (blob) {
            options.body = blob;
            return originalFetch(targetUrl, options);
        });
    }

    function initPatches() {
        if (window.__tizentubeStandalonePatchesInstalled) return;
        window.__tizentubeStandalonePatchesInstalled = true;

        installCookieNameCompatibility(document);

        var originalFetch = window.fetch;
        if (originalFetch) {
            window.fetch = function (input, init) {
                var targetUrl = '';
                var isRequestObject = false;

                if (typeof input === 'string') {
                    targetUrl = redirectUrl(input);
                } else if (input instanceof URL) {
                    targetUrl = redirectUrl(input.toString());
                    input = new URL(targetUrl);
                } else if (input instanceof Request) {
                    isRequestObject = true;
                    targetUrl = redirectUrl(input.url);
                }

                if (isRequestObject) {
                    if (targetUrl !== input.url) {
                        return fetchRedirectedRequest(originalFetch, input, targetUrl, init);
                    }
                    return originalFetch.apply(this, [input, init]);
                }

                return originalFetch.apply(this, [input, init]);
            };
        }

        var originalOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function (method, url, async, user, password) {
            var redirectedUrl = redirectUrl(url);
            if (redirectedUrl !== url) async = true;
            if (async === undefined) async = true;
            return originalOpen.apply(this, [method, redirectedUrl, async, user, password]);
        };

        if (navigator.sendBeacon) {
            var originalSendBeacon = navigator.sendBeacon;
            navigator.sendBeacon = function (url, data) {
                return originalSendBeacon.apply(this, [redirectUrl(url), data]);
            };
        }

        Object.defineProperty(HTMLImageElement.prototype, 'src', {
            set: function (value) {
                Object.getOwnPropertyDescriptor(Element.prototype, 'setAttribute').value.call(this, 'src', redirectUrl(value));
            }
        });
        Object.defineProperty(HTMLScriptElement.prototype, 'src', {
            set: function (value) {
                Object.getOwnPropertyDescriptor(Element.prototype, 'setAttribute').value.call(this, 'src', redirectUrl(value));
            }
        });
    }

    if (window.location.hostname === 'localhost') {
        var logicalUrl = window.location.href.replace('http://localhost:8099', 'https://www.youtube.com');
        var logicalLocation = new URL(logicalUrl);

        Object.defineProperty(window, '__tizentubeLogicalUrl', {
            configurable: false,
            enumerable: false,
            writable: false,
            value: logicalUrl
        });
        Object.defineProperty(window, '__tizentubeLogicalLocation', {
            configurable: false,
            enumerable: false,
            writable: false,
            value: logicalLocation
        });

        initPatches();
    }
}();
