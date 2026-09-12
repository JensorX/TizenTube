const STANDALONE_PORT = 8100;
const STANDALONE_DIAL_PORT = 8095;
const STANDALONE_USER_AGENT = 'Mozilla/5.0 (Linux; Shield Android TV) Cobalt/25.lts.30.1034958-gold (unlike Gecko) Starboard/15';
const USERSCRIPT_URL = 'https://github.com/JensorX/TizenTube/raw/refs/heads/main/dist/userScript.js';
const LOCAL_USERSCRIPT_URL = `http://127.0.0.1:${STANDALONE_PORT}/tizentube/userScript.js`;

module.exports = {
	LOCAL_USERSCRIPT_URL,
	STANDALONE_DIAL_PORT,
	STANDALONE_PORT,
	STANDALONE_USER_AGENT,
	USERSCRIPT_URL
};