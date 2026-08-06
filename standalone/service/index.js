"use strict";

// TizenTube Standalone service

const express = require('express');
const app = express();
const PORT = 8099;
const fetch = require('node-fetch');
const URL = require('url');
const injector = require('./injector.js');

const USERSCRIPT_URL = 'https://github.com/JensorX/TizenTube/raw/refs/heads/main/dist/userScript.js';
const STANDALONE_USER_AGENT = 'Mozilla/5.0 (Linux; Shield Android TV) Cobalt/25.lts.30.1034958-gold (unlike Gecko) Starboard/15';
const APP_EXIT_TIMEOUT = 5000;

let debuggerStartPending = false;

function applyStandaloneUserAgent(headers) {
	headers['user-agent'] = STANDALONE_USER_AGENT;
	return headers;
}

app.use((req, res, next) => {
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
	res.setHeader('Access-Control-Allow-Headers', '*');
	if (req.method === 'OPTIONS') return res.status(200).end();
	next();
});

let cachedUserScript = null;
let cachedETag = null;

function fetchAndUpdateUserScriptInBackground() {
	const headers = {};
	if (cachedETag) headers['If-None-Match'] = cachedETag;
	const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
	const timeoutId = controller ? setTimeout(() => controller.abort(), 3000) : null;

	return fetch(USERSCRIPT_URL, {
			headers,
			signal: controller ? controller.signal : undefined
		})
		.then((response) => {
			if (timeoutId) clearTimeout(timeoutId);
			if (response.status === 304) return cachedUserScript;
			if (!response.ok) throw new Error(`Userscript download failed with status ${response.status}`);
			const etag = response.headers.get('etag');
			if (etag) cachedETag = etag;

			return response.text().then((script) => {
				if (script && script.trim().length > 0) cachedUserScript = script;
				return cachedUserScript;
			});
		})
		.catch((error) => {
			if (timeoutId) clearTimeout(timeoutId);
			console.warn(`Background userscript update check skipped: ${error.message}`);
			return cachedUserScript;
		});
}

app.get('/tizentube/userScript.js', (req, res) => {
	res.setHeader('Cache-Control', 'no-cache');
	res.type('application/javascript');

	if (cachedUserScript) {
		res.send(cachedUserScript);
		fetchAndUpdateUserScriptInBackground();
	} else {
		fetchAndUpdateUserScriptInBackground().then((script) => {
			if (script) {
				res.send(script);
			} else {
				res.status(502).type('text/plain').send('TizenTube userscript unavailable');
			}
		});
	}
});

app.get('/tizentube/getState', (req, res) => {
	injector.canConnectToDaemon().then((state) => res.json({
		...state,
		isConnecting: state.isConnecting || debuggerStartPending
	}));
});

app.get('/tizentube/debugger', (req, res) => {
	if (debuggerStartPending) return res.status(202).end();

	debuggerStartPending = true;
	const args = req.originalUrl.split('?')[1] || '';
	const startedAt = Date.now();
	let completed = false;

	function startDebugger() {
		if (completed) return;
		completed = true;
		injector.startDebugger(args).then(() => {
			debuggerStartPending = false;
		}, () => {
			debuggerStartPending = false;
		});
	}

	function waitForAppExit() {
		tizen.application.getAppsContext((appsContext) => {
			const packageId = tizen.application.getAppInfo().packageId;
			const app = appsContext.find(app => app.appId === `${packageId}.TizenTubeStandalone`);
			if (!app || Date.now() - startedAt >= APP_EXIT_TIMEOUT) return startDebugger();
			setTimeout(waitForAppExit, 50);
		}, startDebugger);
	}

	waitForAppExit();
	res.status(202).end();
});

app.all('*', (req, res) => {
	const isCorsBypass = req.path.indexOf('/cors-bypass/') === 0;

	let targetUrl;
	if (isCorsBypass) {
		const rawTarget = req.url.substring('/cors-bypass/'.length);
		targetUrl = rawTarget.indexOf('http') === 0 ? rawTarget : `https://${rawTarget}`;
	} else {
		targetUrl = `https://www.youtube.com${req.url}`;
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
			headers[key] = req.headers[key];
		}
	}

	try {
		const parsedUrl = URL.parse(targetUrl);
		headers.host = parsedUrl.host;
	} catch (e) {
		headers.host = 'www.youtube.com';
	}

	headers.origin = 'https://www.youtube.com';
	if (headers['referer']) headers['referer'] = 'https://www.youtube.com/tv';
	headers['accept-encoding'] = 'gzip, deflate';
	applyStandaloneUserAgent(headers);

	const hasBody = ['POST', 'PUT', 'PATCH'].indexOf(req.method) !== -1;
	const fetchOptions = {
		method: req.method,
		headers,
		body: hasBody ? req : undefined,
		redirect: 'manual'
	};

	fetch(targetUrl, fetchOptions).then((response) => {
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
				if (isCorsBypass) skipHeaders.push('access-control-allow-origin');

				if (skipHeaders.indexOf(lowerKey) !== -1) continue;

				const value = response.headers.get(key);
				if (lowerKey === 'set-cookie') {
					const rawCookies = headerKeys[key];
					if (Array.isArray(rawCookies)) {
						const modifiedCookies = rawCookies.map(cookieString => cookieString
							.replace(/^__Secure-/i, '__LocalSecure-')
							.replace(/^__Host-/i, '__LocalHost-')
							.replace(/Domain=[^;]+/i, 'Domain=localhost')
							.replace(/;\s*Secure/i, '')
							.replace(/;\s*SameSite=None/i, '')
							.replace(/;\s*;/g, ';')
							.replace(/;\s*$/, ''));
						res.setHeader('Set-Cookie', modifiedCookies);
						continue;
					}
				}

				res.setHeader(key, value);
			}
		}
		res.setHeader('Access-Control-Allow-Origin', '*');

		const contentType = response.headers.get('content-type') || '';
		if (contentType.indexOf('text/html') !== -1 || contentType.indexOf('application/json') !== -1 ||
			contentType.indexOf('javascript') !== -1 || contentType.indexOf('text/css') !== -1) {
			return response.text().then((text) => {
				if (req.url.indexOf('/tv') === 0 && req.url.indexOf('/tv_config') === -1 && text.indexOf('dist/userScript.js') === -1) {
					text += `<script src="/tizentube/userScript.js?ver=${Date.now()}"></script>`;
				}

				const proxyPrefix = `http://localhost:${PORT}/cors-bypass/`;
				text = text.replace(/https:\/\/([a-zA-Z0-9-.]+)\.googlevideo\.com/g, `${proxyPrefix}https://$1.googlevideo.com`);
				text = text.replace(/https:\/\/www\.gstatic\.com/g, `${proxyPrefix}https://www.gstatic.com`);
				text = text.replace(/https:\/\/yt3\.ggpht\.com/g, `${proxyPrefix}https://yt3.ggpht.com`);
				text = text.replace(/https:\/\/clients1\.google\.com/g, `${proxyPrefix}https://clients1.google.com`);
				text = text.replace('Set(["www.youtube.com","accounts.google.com"]);', 'Set(["www.youtube.com", "accounts.google.com", "localhost"]);');
				text = text.replace(/:document\.location\.toString\(\)/g, ':document.location.toString().replace("http://localhost:8099", "https://www.youtube.com")');
				text = text.replace(/euri:[^,]+,/g, 'euri:document.location.toString().replace("http://localhost:8099", "https://www.youtube.com"),');
				text = text.replace(/https:\/\/s\.youtube\.com/g, `${proxyPrefix}https://s.youtube.com`);
				text = text.replace(/redirector.googlevideo.com/g, `${proxyPrefix}https://redirector.googlevideo.com`);
				text = text.replace(/this.scheme="https"/, 'this.scheme="http"');
				text = text.replace(/https\:\/\/jnn-pa.googleapis.com/g, `${proxyPrefix}https://jnn-pa.googleapis.com`);
				text = text.replace(/https:\/\/yt3\.googleusercontent\.com/g, `${proxyPrefix}https://yt3.googleusercontent.com`);
				text = text.replace(/"\/\/yt3\.googleusercontent\.com/g, `"${proxyPrefix}https://yt3.googleusercontent.com`);
				text = text.replace(/=window\.location\.href;/, '=window.location.href.replace("http://localhost:8099", "https://www.youtube.com");');
				text = text.replace(/=document\.location\.href/g, '=document.location.href.replace("http://localhost:8099", "https://www.youtube.com")');
				res.send(text);
			});
		}
		if (response.body) response.body.pipe(res);
		else res.end();
	}).catch((error) => {
		console.error(`Proxy Error for [${targetUrl}]: ${error}`);
		console.error(error.stack);
		if (!res.headersSent) res.status(500).send('Proxy Connection Broken');
	});
});

if (process.env.TIZENTUBE_NO_LISTEN !== '1') {
	app.listen(PORT, '127.0.0.1');
	global.isTizenTube = true;
	require('../../dist/service.js');
}

module.exports = {
	STANDALONE_USER_AGENT,
	applyStandaloneUserAgent
};