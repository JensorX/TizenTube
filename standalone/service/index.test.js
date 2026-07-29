"use strict";

process.env.TIZENTUBE_NO_LISTEN = '1';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');
const {
	STANDALONE_USER_AGENT,
	applyStandaloneUserAgent,
	isProxyableHost,
	readRequestBody
} = require('./index.js');

test('standalone service uses the Nvidia Shield user agent', () => {
	const headers = applyStandaloneUserAgent({ 'user-agent': 'Tizen TV' });
	assert.equal(headers['user-agent'], STANDALONE_USER_AGENT);
	assert.match(headers['user-agent'], /Shield Android TV/);
});

test('request body preserves binary bytes', async () => {
	const request = new PassThrough();
	request.method = 'POST';
	const bodyPromise = readRequestBody(request);
	request.write(Buffer.from([0, 1, 2]));
	request.end(Buffer.from([253, 254, 255]));
	assert.deepEqual(await bodyPromise, Buffer.from([0, 1, 2, 253, 254, 255]));
});

test('proxy target matching requires a real Google subdomain boundary', () => {
	assert.equal(isProxyableHost('r1.googlevideo.com'), true);
	assert.equal(isProxyableHost('notgooglevideo.com'), false);
	assert.equal(isProxyableHost('notyoutube.com'), false);
});