// TizenBrew-style standalone userscript injector using CDP and SDB.

const adbhost = require('adbhost');
const CDP = require('chrome-remote-interface');
const fetch = require('node-fetch');

const STANDALONE_USER_AGENT = 'Mozilla/5.0 (Linux; Shield Android TV) Cobalt/25.lts.30.1034958-gold (unlike Gecko) Starboard/15';
const DEBUGGER_CONNECT_TIMEOUT = 10000;
const DEBUGGER_RETRY_DELAY = 200;
const MAX_DEBUGGER_CONNECTION_ATTEMPTS = 25;
let isConnecting = false;
const isTizen3 = typeof tizen !== 'undefined' &&
	tizen.systeminfo.getCapability('http://tizen.org/feature/platform.version').startsWith('3.0');

function fetchDebuggerEndpoint(host, port) {
	const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
	const timeoutId = controller ? setTimeout(() => controller.abort(), DEBUGGER_CONNECT_TIMEOUT) : null;

	return fetch(`http://${host}:${port}`, {
		signal: controller ? controller.signal : undefined
	}).then((response) => {
		if (timeoutId) clearTimeout(timeoutId);
		if (!response.ok) throw new Error(`Debugger endpoint returned ${response.status}`);
	}).catch((error) => {
		if (timeoutId) clearTimeout(timeoutId);
		throw error;
	});
}

function fetchUserScript() {
	return fetch('http://127.0.0.1:8099/tizentube/userScript.js')
		.then((response) => {
			if (!response.ok) throw new Error(`Userscript request returned ${response.status}`);
			return response.text();
		})
		.then((script) => {
			if (!script || !script.trim()) throw new Error('Userscript is empty');
			return script;
		});
}

function navigateWithUserScript(client, script, args) {
	let completed = false;
	const timeoutId = setTimeout(() => complete(new Error('Document-start injection timed out')), DEBUGGER_CONNECT_TIMEOUT);

	function complete(error) {
		if (completed) return;
		completed = true;
		clearTimeout(timeoutId);

		if (error) {
			console.warn('Document-start injection unavailable, using execution context fallback:', error.message || error);
			client.on('Runtime.executionContextCreated', (message) => {
				client.Runtime.evaluate({
					expression: script,
					contextId: message.context.id
				}, () => {});
			});
		}

		isConnecting = false;
		client.Page.navigate({
			url: `https://youtube.com/tv?additionalDataUrl=http%3A%2F%2Flocalhost%3A8085%2Fdial%2Fapps%2FYouTube${args ? `&${args}` : ''}`
		});
	}

	client.Page.addScriptToEvaluateOnNewDocument({ source: script }, complete);
}

function connectToDebugger(host, port, args, attempt = 0) {
	function retry(error) {
		if (attempt >= MAX_DEBUGGER_CONNECTION_ATTEMPTS) {
			console.error('Failed to connect to the Tizen debugger:', error && error.message ? error.message : error);
			isConnecting = false;
			return;
		}
		setTimeout(() => connectToDebugger(host, port, args, attempt + 1), DEBUGGER_RETRY_DELAY);
	}

	fetchDebuggerEndpoint(host, port)
		.then(fetchUserScript)
		.then((script) => {
			let timedOut = false;
			const timeoutId = setTimeout(() => {
				timedOut = true;
				retry(new Error('Debugger connection timed out'));
			}, DEBUGGER_CONNECT_TIMEOUT);

			CDP({ host, port, local: true }, (client) => {
				clearTimeout(timeoutId);
				if (timedOut) {
					try { client.close(); } catch (_) {}
					return;
				}
				if (!client) return retry(new Error('Debugger client unavailable'));
				client.Runtime.enable();
				client.Page.enable();
				client.Network.enable();
				client.Network.setUserAgentOverride({
					userAgent: STANDALONE_USER_AGENT,
					acceptLanguage: 'en-US,en;q=0.9',
					platform: 'Linux armv7l'
				});
				client.Page.setBypassCSP({ enabled: true });
				navigateWithUserScript(client, script, args);
			});
		})
		.catch(retry);
}

function canConnectToDaemon() {
	const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
	const timeoutId = controller ? setTimeout(() => controller.abort(), 2000) : null;

	return fetch('http://127.0.0.1:8001/api/v2/', {
			signal: controller ? controller.signal : undefined
		})
		.then((response) => response.json())
		.then((json) => {
			if (timeoutId) clearTimeout(timeoutId);
			return {
				canConnectToDaemon: (json.device.developerIP === '127.0.0.1' || json.device.developerIP === '1.0.0.127') &&
					json.device.developerMode === '1',
				ip: json.device.ip,
				isConnecting
			};
		})
		.catch(() => {
			if (timeoutId) clearTimeout(timeoutId);
			return {
				canConnectToDaemon: false,
				ip: null,
				isConnecting: false
			};
		});
}

function startDebugger(args) {
	return canConnectToDaemon().then((state) => {
		if (!state.canConnectToDaemon || isConnecting) return false;
		isConnecting = true;
		return new Promise((resolve) => {
			let completed = false;
			const timeoutId = setTimeout(() => finish(false), DEBUGGER_CONNECT_TIMEOUT);

			function finish(result) {
				if (completed) return;
				completed = true;
				clearTimeout(timeoutId);
				if (!result) isConnecting = false;
				resolve(result);
			}

			try {
				const client = adbhost.createConnection({ host: '127.0.0.1', port: 26101 });
				if (client && client._stream) {
					client._stream.on('error', (err) => {
						console.error('SDB daemon connection error:', err && err.message ? err.message : err);
						finish(false);
					});
					client._stream.on('connect', () => {
						if (completed) return;
						const packageId = typeof tizen !== 'undefined' ? tizen.application.getAppInfo().packageId : 'xvvl3S1TT1';
						const shell = client.createStream(`shell:0 debug ${packageId}.TizenTubeStandalone${isTizen3 ? ' 0' : ''}`);
						if (shell) {
							shell.on('error', (err) => {
								console.error('SDB shell error:', err && err.message ? err.message : err);
								finish(false);
							});
							shell.on('data', (data) => {
								if (completed) return;
								const output = data.toString();
								const portMatch = output.match(/debug[\s\S]*?:\s*(\d+)/i);
								if (portMatch) {
									const port = Number(portMatch[1]);
									connectToDebugger(state.ip, port, args);
									setTimeout(() => {
										try { client._stream.end(); } catch (_) {}
									}, 1000);
									finish(true);
								}
							});
						} else {
							finish(false);
						}
					});
				} else {
					finish(false);
				}
			} catch (err) {
				console.error('Failed to start SDB debugger:', err);
				finish(false);
			}
		});
	});
}

module.exports = { startDebugger, canConnectToDaemon };