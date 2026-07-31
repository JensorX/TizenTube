// TizenBrew-style standalone userscript injector using CDP and SDB.

const adbhost = require('adbhost');
const CDP = require('chrome-remote-interface');
const fetch = require('node-fetch');

const STANDALONE_USER_AGENT = 'Mozilla/5.0 (Linux; Shield Android TV) Cobalt/25.lts.30.1034958-gold (unlike Gecko) Starboard/15';
let isConnecting = false;
const isTizen3 = typeof tizen !== 'undefined' &&
	tizen.systeminfo.getCapability('http://tizen.org/feature/platform.version').startsWith('3.0');

function connectToDebugger(host, port, args) {
	fetch(`http://${host}:${port}`).then(() => {
		CDP({ host, port, local: true }, (client) => {
			isConnecting = false;
			client.Runtime.enable();
			client.Page.enable();
			client.Network.enable();
			client.Network.setUserAgentOverride({
				userAgent: STANDALONE_USER_AGENT,
				acceptLanguage: 'en-US,en;q=0.9',
				platform: 'Linux armv7l'
			});
			client.on('Runtime.executionContextCreated', (message) => {
				fetch('http://127.0.0.1:8099/tizentube/userScript.js')
					.then((response) => response.text())
					.then((script) => client.Runtime.evaluate({
						expression: script,
						contextId: message.context.id
					}))
					.catch(() => client.Runtime.evaluate({
						expression: 'alert("Failed to request userscript from TizenTube GitHub.")',
						contextId: message.context.id
					}));
			});
			client.Page.navigate({
				url: `https://youtube.com/tv?additionalDataUrl=http%3A%2F%2Flocalhost%3A8085%2Fdial%2Fapps%2FYouTube${args ? `&${args}` : ''}`
			});
			client.Page.setBypassCSP({ enabled: true });
		});
	}).catch(() => setTimeout(() => connectToDebugger(host, port, args), 100));
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
		return new Promise((resolve) => {
			try {
				const client = adbhost.createConnection({ host: '127.0.0.1', port: 26101 });
				if (client && client._stream) {
					client._stream.on('error', (err) => {
						console.error('SDB daemon connection error:', err && err.message ? err.message : err);
						isConnecting = false;
						resolve(false);
					});
					client._stream.on('connect', () => {
						const packageId = typeof tizen !== 'undefined' ? tizen.application.getAppInfo().packageId : 'xvvl3S1TT1';
						isConnecting = true;
						const shell = client.createStream(`shell:0 debug ${packageId}.TizenTubeStandalone${isTizen3 ? ' 0' : ''}`);
						if (shell) {
							shell.on('error', (err) => {
								console.error('SDB shell error:', err && err.message ? err.message : err);
								isConnecting = false;
								resolve(false);
							});
							shell.on('data', (data) => {
								const output = data.toString();
								if (output.includes('debug')) {
									const port = Number(output.substr(output.indexOf(':') + 1, 6).replace(' ', ''));
									connectToDebugger(state.ip, port, args);
									setTimeout(() => {
										try { client._stream.end(); } catch (_) {}
									}, 1000);
									resolve(true);
								}
							});
						} else {
							resolve(false);
						}
					});
				} else {
					resolve(false);
				}
			} catch (err) {
				console.error('Failed to start SDB debugger:', err);
				isConnecting = false;
				resolve(false);
			}
		});
	});
}

module.exports = { startDebugger, canConnectToDaemon };