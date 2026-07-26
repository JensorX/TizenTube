import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchRedirectedRequest, redirectUrl } from './standaloneUserscript.js';

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