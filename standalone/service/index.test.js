"use strict";

process.env.TIZENTUBE_NO_LISTEN = '1';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { PassThrough } = require('node:stream');
const vm = require('node:vm');
const {
    STANDALONE_USER_AGENT,
    app,
    applyLogicalAuthorization,
    applyStandaloneUserAgent,
    createLogicalAuthorization,
    createUserAgentOverrideScript,
    injectAfterOpeningHead,
    readRequestBody,
    rewriteLogicalLocation,
    toLogicalReferer,
    toProxyUrl
} = require('./index.js');

function requestStatus(server, requestPath) {
    const address = server.address();

    return new Promise((resolve, reject) => {
        http.get({
            hostname: '127.0.0.1',
            path: requestPath,
            port: address.port
        }, (response) => {
            response.resume();
            response.on('end', () => resolve(response.statusCode));
        }).on('error', reject);
    });
}

test('standalone proxy always uses the Nvidia Shield user agent', () => {
    const headers = applyStandaloneUserAgent({ 'user-agent': 'Tizen TV' });

    assert.equal(headers['user-agent'], STANDALONE_USER_AGENT);
    assert.match(headers['user-agent'], /Shield Android TV/);
});

test('startup health check is local and does not fetch YouTube', async () => {
    const server = app.listen(0, '127.0.0.1');

    try {
        await new Promise((resolve) => server.once('listening', resolve));
        assert.equal(await requestStatus(server, '/tizentube/health'), 204);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
});

test('standalone startup screen polls health instead of downloading TV twice', () => {
    const startupHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

    assert.match(startupHtml, /fetch\(healthUrl/);
    assert.doesNotMatch(startupHtml, /fetch\(['"]http:\/\/localhost:8099\/tv/);
    assert.match(startupHtml, /window\.location\.replace\(targetUrl\)/);
    assert.match(startupHtml, /class="startup"/);
});

test('user agent override exposes the Nvidia Shield user agent in the page', () => {
    const navigator = { userAgent: 'Tizen TV' };
    const script = createUserAgentOverrideScript()
        .replace(/^<script>/, '')
        .replace(/<\/script>$/, '');

    vm.runInNewContext(script, { navigator });

    assert.equal(navigator.userAgent, STANDALONE_USER_AGENT);
});

test('readRequestBody preserves chunked binary request bytes', async () => {
    const request = new PassThrough();
    request.method = 'POST';
    const bodyPromise = readRequestBody(request);

    request.write(Buffer.from([0, 1, 2]));
    request.end(Buffer.from([253, 254, 255]));

    assert.deepEqual(await bodyPromise, Buffer.from([0, 1, 2, 253, 254, 255]));
});

test('proxy URL helpers preserve paths, queries, and logical referers', () => {
    assert.equal(
        toProxyUrl('https://www.youtube.com/tv/watch?v=abc'),
        'http://localhost:8099/tv/watch?v=abc'
    );
    assert.equal(
        toProxyUrl('https://jnn-pa.googleapis.com/$rpc/google.internal.waa.v1.Waa/Create'),
        'http://localhost:8099/cors-bypass/https://jnn-pa.googleapis.com/$rpc/google.internal.waa.v1.Waa/Create'
    );
    assert.equal(
        toLogicalReferer('http://localhost:8099/tv/watch?v=abc'),
        'https://www.youtube.com/tv/watch?v=abc'
    );
});

test('logical authorization signs restored secure cookies for the YouTube origin', () => {
    const authorization = createLogicalAuthorization(
        'SAPISID=main-secret; __Secure-1PAPISID=one-secret; __Secure-3PAPISID=three-secret',
        1700000000
    );

    assert.equal(
        authorization,
        'SAPISIDHASH 1700000000_f208f0272283c276bda5c963770d1dbab38378eb '
        + 'SAPISID1PHASH 1700000000_397db4540e1cc12cac0c327dcedaf4753a909496 '
        + 'SAPISID3PHASH 1700000000_1ee47fe23b1e2668ebd33e7c2b8b131603e1dc40'
    );
});

test('logical authorization only replaces Google cookie authentication', () => {
    const googleHeaders = applyLogicalAuthorization({
        authorization: 'APISIDHASH invalid-localhost-hash',
        cookie: '__Secure-3PAPISID=three-secret'
    }, 1700000000);
    const bearerHeaders = applyLogicalAuthorization({
        authorization: 'Bearer token',
        cookie: 'SAPISID=main-secret'
    }, 1700000000);

    assert.equal(
        googleHeaders.authorization,
        'SAPISIDHASH 1700000000_1ee47fe23b1e2668ebd33e7c2b8b131603e1dc40 '
        + 'SAPISID3PHASH 1700000000_1ee47fe23b1e2668ebd33e7c2b8b131603e1dc40'
    );
    assert.equal(googleHeaders['x-origin'], 'https://www.youtube.com');
    assert.equal(bearerHeaders.authorization, 'Bearer token');
    assert.equal(bearerHeaders['x-origin'], undefined);
});

test('preload injection happens directly after the opening head tag', () => {
    assert.equal(
        injectAfterOpeningHead('<html><head data-test="1"><script src="youtube.js"></script></head></html>', '<script src="preload.js"></script>'),
        '<html><head data-test="1"><script src="preload.js"></script><script src="youtube.js"></script></head></html>'
    );
});

test('BotGuard rewrites URL reads without changing navigation assignments', () => {
    const source = [
        'const pageUrl=document.URL;',
        'const origin=window.location.origin;',
        'const hostname=document.location.hostname;',
        'window.location.href="/next";',
        'document.location.hostname="example.com";'
    ].join('');
    const rewritten = rewriteLogicalLocation(source, true);

    assert.match(rewritten, /__tizentubeLogicalUrl/);
    assert.match(rewritten, /__tizentubeLogicalLocation/);
    assert.match(rewritten, /window\.location\.href="\/next"/);
    assert.match(rewritten, /document\.location\.hostname="example\.com"/);
});