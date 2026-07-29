"use strict";

// TizenTube Standalone service

const express = require('express');
const app = express();
const PORT = 8099;
const fetch = require('node-fetch');
const http = require('http');
const https = require('https');
const URL = require('url');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const USERSCRIPT_URL = 'https://github.com/JensorX/TizenTube/raw/refs/heads/main/dist/userScript.js';
const STANDALONE_USER_AGENT = 'Mozilla/5.0 (Linux; Shield Android TV) Cobalt/25.lts.30.1034958-gold (unlike Gecko) Starboard/15';
const LOGICAL_ORIGIN = 'https://www.youtube.com';
const mediaAgent = new https.Agent({
    keepAlive: true,
    maxSockets: 8
});

const requestHeadersToRemove = [
    'connection',
    'content-length',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade'
];

function readRequestBody(req) {
    if (req.method === 'GET' || req.method === 'HEAD') {
        return Promise.resolve(undefined);
    }

    return new Promise((resolve, reject) => {
        const chunks = [];

        req.on('data', (chunk) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        req.on('end', () => {
            resolve(Buffer.concat(chunks));
        });
        req.on('error', reject);
        req.on('aborted', () => {
            reject(new Error('Client aborted the request body'));
        });
    });
}

function injectAfterOpeningHead(text, markup) {
    const openingHead = /<head(?:\s[^>]*)?>/i;
    if (openingHead.test(text)) {
        return text.replace(openingHead, (match) => match + markup);
    }

    return markup + text;
}

function createUserAgentOverrideScript() {
    const userAgent = JSON.stringify(STANDALONE_USER_AGENT);
    return `<script>(function(){var userAgent=${userAgent};Object.defineProperty(navigator,"userAgent",{configurable:true,get:function(){return userAgent;}});}());</script>`;
}

function applyStandaloneUserAgent(headers) {
    headers['user-agent'] = STANDALONE_USER_AGENT;
    return headers;
}

function isHostOrSubdomain(hostname, domain) {
    const normalizedHostname = String(hostname || '').toLowerCase();
    return normalizedHostname === domain || normalizedHostname.endsWith(`.${domain}`);
}

function isProxyableCrossOriginHost(hostname) {
    return [
        'googlevideo.com',
        'youtube.com',
        'gstatic.com',
        'google.com',
        'googleapis.com',
        'googleusercontent.com',
        'ggpht.com'
    ].some((domain) => isHostOrSubdomain(hostname, domain));
}

function isMediaUrl(targetUrl) {
    try {
        return isHostOrSubdomain(URL.parse(targetUrl).hostname, 'googlevideo.com');
    } catch (e) {
        return false;
    }
}

function isSessionCookieHost(targetUrl) {
    try {
        const hostname = URL.parse(targetUrl).hostname;
        return hostname === 'youtube.com' || hostname === 'www.youtube.com'
            || hostname === 's.youtube.com' || hostname === 'accounts.google.com';
    } catch (e) {
        return false;
    }
}

function isYouTubeSessionApiRequest(targetUrl) {
    try {
        const parsed = URL.parse(targetUrl);
        const pathname = parsed.pathname || '';
        if (parsed.hostname === 's.youtube.com') {
            return /^\/api\/stats\/watchtime(?:\/|$)/.test(pathname);
        }

        if (parsed.hostname !== 'youtube.com' && parsed.hostname !== 'www.youtube.com') {
            return false;
        }

        return /^\/(?:youtubei\/|api\/stats\/|log_event(?:\/|$))/.test(pathname);
    } catch (e) {
        return false;
    }
}

function rewriteLogicalLocation(text, isBotGuardResponse) {
    const logicalUrl = '(window.__tizentubeLogicalUrl || document.location.toString())';
    const logicalLocation = '(window.__tizentubeLogicalLocation || document.location)';

    text = text.replace(/document\.location\.toString\(\)/g, logicalUrl);
    text = text.replace(/euri:[^,]+,/g, `euri:${logicalUrl},`);

    if (!isBotGuardResponse) {
        return text;
    }

    text = text.replace(/document\.URL/g, `(${logicalUrl})`);
    text = text.replace(/document\.documentURI/g, `(${logicalUrl})`);
    text = text.replace(/window\.location\.(href|origin|protocol|hostname|host|pathname|search|hash)\b(?!\s*(?:=|\+=|-=|\*=|\/=))/g, `${logicalLocation}.$1`);
    text = text.replace(/document\.location\.(href|origin|protocol|hostname|host|pathname|search|hash)\b(?!\s*(?:=|\+=|-=|\*=|\/=))/g, `${logicalLocation}.$1`);

    return text;
}

function toProxyUrl(originalUrl) {
    if (!originalUrl) return originalUrl;

    try {
        const parsed = URL.parse(originalUrl);
        const hostname = parsed.hostname;

        if (hostname === 'youtube.com' || hostname === 'www.youtube.com') {
            return `http://localhost:${PORT}${parsed.path}`;
        }

        if (isMediaUrl(originalUrl)) {
            return `http://localhost:${PORT}/media/${originalUrl}`;
        }

        if (isProxyableCrossOriginHost(hostname)) {
            return `http://localhost:${PORT}/cors-bypass/${originalUrl}`;
        }
    } catch (e) {
        return originalUrl;
    }

    return originalUrl;
}

function toLogicalReferer(referer) {
    if (!referer) return referer;
    return referer.replace(`http://localhost:${PORT}`, LOGICAL_ORIGIN);
}

function parseCookieHeader(cookieHeader) {
    const cookies = {};

    String(cookieHeader || '').split(';').forEach((cookie) => {
        const separator = cookie.indexOf('=');
        if (separator === -1) return;

        const name = cookie.substring(0, separator).trim();
        if (!name || Object.prototype.hasOwnProperty.call(cookies, name)) return;
        cookies[name] = cookie.substring(separator + 1).trim();
    });

    return cookies;
}

function createSapisidHash(cookieValue, scheme, timestamp) {
    const input = `${timestamp} ${cookieValue} ${LOGICAL_ORIGIN}`;
    const digest = crypto.createHash('sha1').update(input).digest('hex');
    return `${scheme} ${timestamp}_${digest}`;
}

function createLogicalAuthorization(cookieHeader, timestamp) {
    const cookies = parseCookieHeader(cookieHeader);
    const primaryCookie = cookies.SAPISID || cookies['__Secure-3PAPISID'];
    const authorization = [];

    if (primaryCookie) {
        authorization.push(createSapisidHash(primaryCookie, 'SAPISIDHASH', timestamp));
    }
    if (cookies['__Secure-1PAPISID']) {
        authorization.push(createSapisidHash(cookies['__Secure-1PAPISID'], 'SAPISID1PHASH', timestamp));
    }
    if (cookies['__Secure-3PAPISID']) {
        authorization.push(createSapisidHash(cookies['__Secure-3PAPISID'], 'SAPISID3PHASH', timestamp));
    }

    return authorization.join(' ');
}

function applyLogicalAuthorization(headers, timestamp, forceSessionAuthorization) {
    const incomingAuthorization = headers.authorization || '';
    const hasGoogleCookieAuthorization = /(?:^|\s)(?:APISIDHASH|SAPISID(?:1P|3P)?HASH)\s/.test(incomingAuthorization);
    if (!hasGoogleCookieAuthorization && !forceSessionAuthorization) {
        return headers;
    }
    if (incomingAuthorization && !hasGoogleCookieAuthorization) {
        return headers;
    }

    const logicalAuthorization = createLogicalAuthorization(
        headers.cookie,
        timestamp === undefined ? Math.floor(Date.now() / 1000) : timestamp
    );
    if (logicalAuthorization) {
        headers.authorization = logicalAuthorization;
        headers['x-origin'] = LOGICAL_ORIGIN;
    }

    return headers;
}

function removeMediaSessionHeaders(headers) {
    [
        'authorization',
        'cookie',
        'x-origin',
        'x-goog-authuser',
        'x-youtube-bootstrap-logged-in',
        'sec-fetch-dest',
        'sec-fetch-mode',
        'sec-fetch-site',
        'sec-fetch-user'
    ].forEach((header) => delete headers[header]);

    headers['accept-encoding'] = 'identity';
    return headers;
}

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    next();
});

app.get('/tizentube/standalonePreload.js', (req, res) => {
    const bundledPath = path.join(__dirname, 'standalonePreload.js');
    const developmentPath = path.join(__dirname, 'dist', 'standalonePreload.js');
    const preloadPath = fs.existsSync(bundledPath) ? bundledPath : developmentPath;

    res.type('application/javascript');
    res.sendFile(preloadPath);
});

app.get('/tizentube/health', (req, res) => {
    res.status(204).end();
});

app.get('/tizentube/userScript.js', (req, res) => {
    fetch(USERSCRIPT_URL)
        .then((response) => {
            if (!response.ok) {
                throw new Error(`Userscript download failed with status ${response.status}`);
            }

            return response.text();
        })
        .then((script) => {
            res.setHeader('Cache-Control', 'no-store');
            res.type('application/javascript');
            res.send(script);
        })
        .catch((error) => {
            console.error(`Userscript download failed: ${error.message}`);
            res.status(502).type('text/plain').send('TizenTube userscript unavailable');
        });
});

app.all('*', (req, res) => {
    const isCorsBypass = req.path.indexOf('/cors-bypass/') === 0;
    const isMediaProxy = req.path.indexOf('/media/') === 0;
    const isCrossOriginProxy = isCorsBypass || isMediaProxy;

    let targetUrl;
    if (isCrossOriginProxy) {
        const proxyPath = isMediaProxy ? '/media/' : '/cors-bypass/';
        const rawTarget = req.url.substring(proxyPath.length);
        targetUrl = rawTarget.indexOf('http') === 0 ? rawTarget : `https://${rawTarget}`;
    } else {
        targetUrl = `https://www.youtube.com${req.url}`;
    }

    let parsedUrl;
    try {
        parsedUrl = URL.parse(targetUrl);
    } catch (e) {
        return res.status(400).send('Invalid proxy target');
    }

    if (isCrossOriginProxy && !isProxyableCrossOriginHost(parsedUrl.hostname)) {
        return res.status(403).send('Unsupported proxy target');
    }
    if (isMediaProxy && !isMediaUrl(targetUrl)) {
        return res.status(403).send('Unsupported media target');
    }

    const headers = {};
    for (const key in req.headers) {
        if (Object.prototype.hasOwnProperty.call(req.headers, key)) {
            if (key === 'cookie') {
                headers[key] = req.headers[key]
                    .replace(/__LocalSecure-/g, '__Secure-')
                    .replace(/__LocalHost-/g, '__Host-');
                continue;
            }
            headers[key] = req.headers[key]
        }
    }

    headers['host'] = parsedUrl.host;

    headers['origin'] = LOGICAL_ORIGIN;
    if (headers['referer']) {
        headers['referer'] = toLogicalReferer(headers['referer']);
    }

    if (isMediaProxy) {
        removeMediaSessionHeaders(headers);
    } else {
        if (!isSessionCookieHost(targetUrl)) {
            delete headers.cookie;
        }
        applyLogicalAuthorization(headers, undefined, isYouTubeSessionApiRequest(targetUrl));
        headers['accept-encoding'] = 'gzip, deflate';
    }

    requestHeadersToRemove.forEach((header) => {
        delete headers[header];
    });
    applyStandaloneUserAgent(headers);

    readRequestBody(req)
        .then((body) => {
            if (body !== undefined) {
                headers['content-length'] = String(body.length);
            }

            return fetch(targetUrl, {
                method: req.method,
                headers: headers,
                body: body,
                redirect: 'manual',
                agent: isMediaProxy ? mediaAgent : undefined
            });
        })
        .then((response) => {
            if (isMediaProxy && response.status >= 400) {
                console.warn(`Media proxy returned ${response.status} for ${targetUrl}`);
            }
            if (req.method === 'OPTIONS') {
                res.status(200);
            } else {
                res.status(response.status);
            }

            const headerKeys = response.headers.raw();
            for (const key in headerKeys) {
                if (Object.prototype.hasOwnProperty.call(headerKeys, key)) {
                    const lowerKey = key.toLowerCase();
                    const skipHeaders = ['content-encoding', 'content-length', 'transfer-encoding', 'content-security-policy', 'alt-svc'];
                    if (isCrossOriginProxy) skipHeaders.push('access-control-allow-origin');

                    if (skipHeaders.indexOf(lowerKey) !== -1) continue;

                    const value = response.headers.get(key);
                    if (lowerKey === 'location') {
                        const resolvedLocation = URL.resolve(targetUrl, value);
                        res.setHeader(key, toProxyUrl(resolvedLocation));
                        continue;
                    }

                    if (lowerKey === 'set-cookie') {
                        if (!isSessionCookieHost(targetUrl)) continue;
                        const rawCookies = headerKeys[key];
                        if (Array.isArray(rawCookies)) {
                            const modifiedCookies = rawCookies.map(cookieStr => {
                                return cookieStr
                                    .replace(/^__Secure-/i, '__LocalSecure-')
                                    .replace(/^__Host-/i, '__LocalHost-')
                                    .replace(/Domain=[^;]+/i, 'Domain=localhost')
                                    .replace(/;\s*Secure/i, '')
                                    .replace(/;\s*SameSite=None/i, '')
                                    .replace(/;\s*;/g, ';')
                                    .replace(/;\s*$/, '');
                            });
                            res.setHeader('Set-Cookie', modifiedCookies);
                            continue;
                        }
                    }

                    res.setHeader(key, value);
                }
            }

            res.setHeader('Access-Control-Allow-Origin', '*');

            const contentType = response.headers.get('content-type') || '';
            const isBotGuardResponse = parsedUrl && parsedUrl.hostname === 'jnn-pa.googleapis.com';

            if (contentType.indexOf('text/html') !== -1 ||
                contentType.indexOf('application/json') !== -1 ||
                contentType.indexOf('javascript') !== -1 ||
                contentType.indexOf('text/css') !== -1) {

                return response.text().then((text) => {
                    if (req.url.indexOf('/tv') === 0) {
                        const preload = createUserAgentOverrideScript()
                            + `<script src="/tizentube/standalonePreload.js?ver=${Date.now()}"></script>`;
                        text = injectAfterOpeningHead(text, preload);
                        text += `<script src="/tizentube/userScript.js?ver=${Date.now()}"></script>`;
                    }

                    const proxyPrefix = `http://localhost:${PORT}/cors-bypass/`;

                    // Rewrite rules for replacing URLs so CORS and presumably YT is happy.
                    const mediaProxyPrefix = `http://localhost:${PORT}/media/`;
                    text = text.replace(/https:\/\/([a-zA-Z0-9-.]+)\.googlevideo\.com/g, `${mediaProxyPrefix}https://$1.googlevideo.com`);
                    text = text.replace(/https:\\\/\\\/([a-zA-Z0-9-.]+)\.googlevideo\.com/g, `http:\\\/\\\/localhost:${PORT}\\\/media\\\/https:\\\/\\\/$1.googlevideo.com`);
                    text = text.replace(/"\/\/([a-zA-Z0-9-.]+)\.googlevideo\.com/g, `"${mediaProxyPrefix}https://$1.googlevideo.com`);

                    text = text.replace(/https:\/\/www\.gstatic\.com/g, `${proxyPrefix}https://www.gstatic.com`);
                    text = text.replace(/http:\/\/www\.gstatic\.com/g, `${proxyPrefix}https://www.gstatic.com`);
                    text = text.replace(/"\/\/www\.gstatic\.com/g, `"${proxyPrefix}https://www.gstatic.com`);
                    text = text.replace(/\(\/\/www\.gstatic\.com/g, `(${proxyPrefix}https://www.gstatic.com`);

                    text = text.replace(/https:\/\/yt3\.ggpht\.com/g, `${proxyPrefix}https://yt3.ggpht.com`);

                    text = text.replace(/https:\/\/clients1\.google\.com/g, `${proxyPrefix}https://clients1.google.com`);
                    text = text.replace(/http:\/\/clients1\.google\.com/g, `${proxyPrefix}https://clients1.google.com`);
                    text = text.replace(/"\/\/clients1\.google\.com/g, `"${proxyPrefix}https://clients1.google.com`);

                    text = text.replace('Set(["www.youtube.com","accounts.google.com"]);', 'Set(["www.youtube.com", "accounts.google.com", "localhost"]);');
                    text = rewriteLogicalLocation(text, isBotGuardResponse);
                    text = text.replace(/https:\/\/s\.youtube\.com/g, `${proxyPrefix}https://s.youtube.com`);
                    text = text.replace(/this.scheme="https"/, 'this.scheme="http"');
                    text = text.replace(/https\:\/\/jnn-pa.googleapis.com/g, `${proxyPrefix}https://jnn-pa.googleapis.com`);
                    text = text.replace(/https:\/\/yt3\.googleusercontent\.com/g, `${proxyPrefix}https://yt3.googleusercontent.com`);
                    text = text.replace(/"\/\/yt3\.googleusercontent\.com/g, `"${proxyPrefix}https://yt3.googleusercontent.com`);

                    res.send(text);
                });
            } else {
                if (response.body) {
                    response.body.on('error', (error) => {
                        console.error(`Proxy stream error for [${targetUrl}]: ${error.message}`);
                        if (!res.writableEnded) res.destroy(error);
                    });
                    response.body.pipe(res);
                } else {
                    res.end();
                }
            }
        })
        .catch((error) => {
            console.error(`Proxy Error for [${targetUrl}]: ${error}`);
            console.error(error.stack)
            if (!res.headersSent) {
                res.status(500).send('Proxy Connection Broken');
            }
        });
});

if (process.env.TIZENTUBE_NO_LISTEN !== '1') {
    app.listen(PORT, "127.0.0.1");
}

module.exports = {
    STANDALONE_USER_AGENT,
    app,
    applyLogicalAuthorization,
    applyStandaloneUserAgent,
    createLogicalAuthorization,
    createUserAgentOverrideScript,
    injectAfterOpeningHead,
    isMediaUrl,
    isProxyableCrossOriginHost,
    isSessionCookieHost,
    isYouTubeSessionApiRequest,
    removeMediaSessionHeaders,
    readRequestBody,
    rewriteLogicalLocation,
    toLogicalReferer,
    toProxyUrl
};
