// TizenBrew-style standalone userscript injector using CDP and SDB.

const adbhost = require('adbhost');
const CDP = require('chrome-remote-interface');
const fetch = require('node-fetch');

let isConnecting = false;
const isTizen3 = typeof tizen !== 'undefined' &&
	tizen.systeminfo.getCapability('http://tizen.org/feature/platform.version').startsWith('3.0');

function connectToDebugger(host, port, args) {
	fetch(`http://${host}:${port}`).then(() => {
		CDP({ host, port, local: true }, (client) => {
			isConnecting = false;
			client.Runtime.enable();
			client.Page.enable();
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
	return fetch('http://127.0.0.1:8001/api/v2/').then((response) => response.json())
		.then((json) => ({
			canConnectToDaemon: (json.device.developerIP === '127.0.0.1' || json.device.developerIP === '1.0.0.127') &&
				json.device.developerMode === '1',
			ip: json.device.ip,
			isConnecting
		}))
		.catch(() => canConnectToDaemon());
}

function startDebugger(args) {
	return canConnectToDaemon().then((state) => {
		if (!state.canConnectToDaemon) return false;
		const client = adbhost.createConnection({ host: '127.0.0.1', port: 26101 });
		client._stream.on('connect', () => {
			const packageId = tizen.application.getAppInfo().packageId;
			isConnecting = true;
			const shell = client.createStream(`shell:0 debug ${packageId}.TizenTubeStandalone${isTizen3 ? ' 0' : ''}`);
			shell.on('data', (data) => {
				const output = data.toString();
				if (output.includes('debug')) {
					const port = Number(output.substr(output.indexOf(':') + 1, 6).replace(' ', ''));
					connectToDebugger(state.ip, port, args);
					setTimeout(() => client._stream.end(), 1000);
				}
			});
		});
		return true;
	});
}

module.exports = { startDebugger, canConnectToDaemon };