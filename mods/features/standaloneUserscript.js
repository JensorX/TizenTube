export function redirectUrl(originalUrl) {
    if (!originalUrl) return originalUrl;

    try {
        const url = new URL(originalUrl, window.location.origin);
        const hostname = url.hostname;

        if (hostname === 'youtube.com' || hostname === 'www.youtube.com') {
            url.protocol = 'http:';
            url.host = 'localhost:8099';
            return url.toString();
        }

        if (hostname.endsWith('googlevideo.com') || hostname.endsWith('youtube.com')
            || hostname.endsWith('gstatic.com') || hostname.endsWith('.google.com')
            || hostname.endsWith('.googleapis.com') || hostname.endsWith('googleusercontent.com')
            || hostname.endsWith('.ggpht.com')) {
            return 'http://localhost:8099/cors-bypass/' + url.toString();
        }
    } catch (e) {
        console.error('Failed to parse URL during interception:', e);
    }

    return originalUrl;
}

const requestOptionKeys = [
    'method',
    'mode',
    'credentials',
    'cache',
    'redirect',
    'referrer',
    'referrerPolicy',
    'integrity',
    'keepalive',
    'signal'
];

export function copyRequestOptions(input, init) {
    const options = {
        headers: new Headers(input.headers)
    };

    requestOptionKeys.forEach(function (key) {
        if (input[key] !== undefined) {
            options[key] = input[key];
        }
    });

    if (init) {
        Object.keys(init).forEach(function (key) {
            options[key] = init[key];
        });
    }

    return options;
}

export function fetchRedirectedRequest(originalFetch, input, targetUrl, init) {
    const options = copyRequestOptions(input, init);
    const method = (options.method || input.method || 'GET').toUpperCase();
    const hasExplicitBody = init && Object.prototype.hasOwnProperty.call(init, 'body');

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

export default function () {
    if (window.__tizentubeStandalonePatchesInstalled) {
        return;
    }
    window.__tizentubeStandalonePatchesInstalled = true;

    const originalFetch = window.fetch;
    if (originalFetch) {
        window.fetch = function (input, init) {
            let targetUrl = '';
            let isRequestObject = false;

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

    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url, async, user, password) {
        const redirectedUrl = redirectUrl(url);
        if (redirectedUrl !== url) {
            async = true;
        }

        if (async === undefined) {
            async = true;
        }

        return originalOpen.apply(this, [method, redirectedUrl, async, user, password]);
    };

    if (navigator.sendBeacon) {
        const originalSendBeacon = navigator.sendBeacon;
        navigator.sendBeacon = function (url, data) {
            return originalSendBeacon.apply(this, [redirectUrl(url), data]);
        };
    }

    Object.defineProperty(HTMLImageElement.prototype, 'src', {
        set: function(value) {
            const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'setAttribute');
            descriptor.value.call(this, 'src', redirectUrl(value));
        }
    });
    Object.defineProperty(HTMLScriptElement.prototype, 'src', {
        set: function(value) {
            const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'setAttribute');
            descriptor.value.call(this, 'src', redirectUrl(value));
        }
    });
}