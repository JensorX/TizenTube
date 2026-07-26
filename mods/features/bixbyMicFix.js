// Prevents Bixby from interfering with YouTube TV's voice search.
//
// When the microphone/Bixby button is pressed on a Samsung remote, Bixby activates
// simultaneously with YouTube TV's SpeechRecognition. Bixby then shows "not understood",
// which dismisses the YouTube search result.
//
// Fix: Register the MICROPHONE key via the Tizen TV input device API and intercept
// the keydown event so Bixby's handler never fires. YouTube TV's own SpeechRecognition
// (initiated by the same key) continues to work normally because it is already active
// at the time the event is suppressed.

(function () {
    const micKeyCodes = new Set([65376]);
    const micKeyPattern = /(mic|microphone|voice|bixby)/i;
    const voiceState = window.__ttVoiceSearchState || (window.__ttVoiceSearchState = {
        lastMicKeyAt: 0,
        lastMicKeyCode: null
    });

    function hasSearchContext() {
        const activeElement = document.activeElement;
        if (activeElement && (
            activeElement.isContentEditable ||
            activeElement.tagName === 'INPUT' ||
            activeElement.tagName === 'TEXTAREA'
        )) {
            return true;
        }

        return Boolean(document.querySelector(
            'ytlr-search-box, ytlr-search-text-box, input[type="search"], input[role="searchbox"], [role="search"]'
        ));
    }

    function suppressBixby(event) {
        if (!micKeyCodes.has(event.keyCode) || !hasSearchContext()) return;

        voiceState.lastMicKeyAt = Date.now();
        voiceState.lastMicKeyCode = event.keyCode;

        if (event.type === 'keyup') {
            event.preventDefault();
        }

        event.stopPropagation();
        event.stopImmediatePropagation();
    }

    function registerMicKeys() {
        if (!window.tizen || !tizen.tvinputdevice) {
            return;
        }

        try {
            const supportedKeys = tizen.tvinputdevice.getSupportedKeys();
            for (const key of supportedKeys) {
                if (!micKeyPattern.test(key.name)) continue;

                micKeyCodes.add(key.code);

                try {
                    tizen.tvinputdevice.registerKey(key.name);
                } catch (_) {}
            }
        } catch (_) {}
    }

    registerMicKeys();
    window.addEventListener('keydown', suppressBixby, true);
    window.addEventListener('keyup', suppressBixby, true);
})();
