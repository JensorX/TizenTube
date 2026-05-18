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
    const MIC_KEY_NAME = 'MICROPHONE';
    // Fallback keyCode used by Samsung Tizen remotes for the microphone/Bixby button.
    const MIC_KEY_CODE = 65376;

    function suppressBixby(e) {
        if (e.keyCode === MIC_KEY_CODE) {
            e.stopImmediatePropagation();
            // Do NOT preventDefault() – that would also cancel YouTube's own voice handler.
            // Stopping propagation is enough to prevent Bixby's system listener from firing.
        }
    }

    function registerMicKey() {
        try {
            if (window.tizen && tizen.tvinputdevice) {
                const supported = tizen.tvinputdevice.getSupportedKeys();
                const hasMic = supported.some(k => k.name === MIC_KEY_NAME);
                if (hasMic) {
                    tizen.tvinputdevice.registerKey(MIC_KEY_NAME);
                }
            }
        } catch (err) {
            // Not a Tizen environment or key not available – silently ignore.
        }
        // Capture phase so we get the event before any other listener.
        window.addEventListener('keydown', suppressBixby, true);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', registerMicKey);
    } else {
        registerMicKey();
    }
})();
