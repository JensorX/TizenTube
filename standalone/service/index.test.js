"use strict";

process.env.TIZENTUBE_NO_LISTEN = '1';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
	STANDALONE_USER_AGENT,
	applyStandaloneUserAgent
} = require('./index.js');

test('standalone service uses the Nvidia Shield user agent', () => {
	const headers = applyStandaloneUserAgent({ 'user-agent': 'Tizen TV' });
	assert.equal(headers['user-agent'], STANDALONE_USER_AGENT);
	assert.match(headers['user-agent'], /Shield Android TV/);
});