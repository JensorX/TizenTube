"use strict";

process.env.TIZENTUBE_NO_LISTEN = '1';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');
const {
    injectAfterOpeningHead,
    readRequestBody,
    rewriteLogicalLocation,
    toLogicalReferer,
    toProxyUrl
} = require('./index.js');

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