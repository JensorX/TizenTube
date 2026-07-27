import test from 'node:test';
import assert from 'node:assert/strict';
import {
    fetchRedirectedRequest,
    installCookieNameCompatibility,
    redirectUrl,
    toLocalCookieAssignment,
    toLogicalCookieString
} from './standaloneUserscript.js';

test('redirectUrl maps YouTube and Google media URLs to the standalone proxy', () => {
    globalThis.window = { location: { origin: 'http://localhost:8099' } };

    assert.equal(
        redirectUrl('https://www.youtube.com/youtubei/v1/player?key=value'),
        'http://localhost:8099/youtubei/v1/player?key=value'
    );
    assert.equal(
        redirectUrl('https://r1---sn.example.googlevideo.com/videoplayback?id=1'),
        'http://localhost:8099/cors-bypass/https://r1---sn.example.googlevideo.com/videoplayback?id=1'
    );
});

test('fetchRedirectedRequest preserves a body without reading Request.body', async () => {
    const payload = new Blob(['history-payload'], { type: 'application/json' });
    const input = {
        bodyUsed: false,
        clone() {
            return { blob: () => Promise.resolve(payload) };
        },
        credentials: 'include',
        headers: new Headers({ 'content-type': 'application/json' }),
        method: 'POST',
        mode: 'cors'
    };
    let forwarded;

    await fetchRedirectedRequest((url, options) => {
        forwarded = { url, options };
        return Promise.resolve();
    }, input, 'http://localhost:8099/youtubei/v1/player');

    assert.equal(forwarded.url, 'http://localhost:8099/youtubei/v1/player');
    assert.equal(forwarded.options.credentials, 'include');
    assert.equal(await forwarded.options.body.text(), 'history-payload');
});

test('fetchRedirectedRequest rejects an already consumed body', async () => {
    const input = {
        bodyUsed: true,
        clone() {
            throw new Error('clone must not be called');
        },
        headers: new Headers(),
        method: 'POST'
    };

    await assert.rejects(
        fetchRedirectedRequest(() => Promise.resolve(), input, 'http://localhost:8099/youtubei/v1/player'),
        /already been consumed/
    );
});

test('cookie compatibility exposes secure authentication cookie names to YouTube', () => {
    let storedCookie = '__LocalSecure-3PAPISID=three; __LocalSecure-1PAPISID=one; SAPISID=main';
    const prototype = {};
    Object.defineProperty(prototype, 'cookie', {
        configurable: true,
        get() {
            return storedCookie;
        },
        set(value) {
            storedCookie = value;
        }
    });
    const documentObject = Object.create(prototype);

    assert.equal(installCookieNameCompatibility(documentObject), true);
    assert.equal(
        documentObject.cookie,
        '__Secure-3PAPISID=three; __Secure-1PAPISID=one; SAPISID=main'
    );

    documentObject.cookie = '__Secure-3PAPISID=updated; Domain=.youtube.com; Path=/; Secure; SameSite=None';
    assert.equal(storedCookie, '__LocalSecure-3PAPISID=updated; Path=/');
});

test('cookie name translation only changes cookie names and attributes', () => {
    assert.equal(
        toLogicalCookieString('VALUE=__LocalSecure-unchanged; __LocalHost-session=value'),
        'VALUE=__LocalSecure-unchanged; __Host-session=value'
    );
    assert.equal(
        toLocalCookieAssignment('__Host-session=value; Path=/; Secure'),
        '__LocalHost-session=value; Path=/'
    );
});