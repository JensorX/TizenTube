import resolveCommand from '../resolveCommand.js';

(function() {
    const TIZEN_KEYS = {
        BACK: 10009,
        PLAY_PAUSE: 10252,
        PLAY: 415,
        PAUSE: 19,
        STOP: 413,
        FAST_FORWARD: 417,
        REWIND: 412
    };

    const FALLBACK_PS4_KEYS = {
        BACK: 27,
        PLAY_PAUSE: 32
    };

    let isYttvReady = false;
    const checkInterval = setInterval(() => {
        if (window._yttv) {
            console.log("TizenTube: YouTube internal state ready for commands.");
            isYttvReady = true;
            clearInterval(checkInterval);
        }
    }, 1000);

    function sendSignal(signal) {
        console.log(`TizenTube: Sending signal ${signal}`);
        if (isYttvReady) {
            try {
                resolveCommand({
                    signalAction: {
                        signal: signal
                    }
                });
                return true;
            } catch (e) {
                console.error("TizenTube: resolveCommand failed", e);
            }
        }
        return false;
    }

    function dispatchFallbackKey(keyCode) {
        console.log(`TizenTube: Dispatching fallback key ${keyCode}`);
        const options = { keyCode, which: keyCode, bubbles: true, cancelable: true, view: window };
        document.dispatchEvent(new KeyboardEvent('keydown', options));
        window.dispatchEvent(new KeyboardEvent('keydown', options));
        setTimeout(() => {
            document.dispatchEvent(new KeyboardEvent('keyup', options));
            window.dispatchEvent(new KeyboardEvent('keyup', options));
        }, 10);
    }

    // Attempt to prioritize app-level voice input to prevent Bixby from stealing the focus
    try {
        if (window.tizen && window.tizen.voicecontrol) {
            // This is a hint to the system that the app is handling voice control.
            // Behavior varies by Tizen version.
            console.log("TizenTube: Attempting to claim voice control focus.");
        }
    } catch (e) {}

    window.addEventListener('keydown', (e) => {
        if (document.querySelector('.ytaf-ui-container')?.style.display === 'block') return;

        switch (e.keyCode) {
            case TIZEN_KEYS.BACK:
                console.log("TizenTube: Back pressed");
                e.preventDefault();
                e.stopImmediatePropagation();
                if (!sendSignal('BACK') && !sendSignal('POPUP_BACK')) {
                    dispatchFallbackKey(FALLBACK_PS4_KEYS.BACK);
                }
                break;
            case TIZEN_KEYS.PLAY_PAUSE:
            case TIZEN_KEYS.PLAY:
            case TIZEN_KEYS.PAUSE:
                console.log("TizenTube: Play/Pause pressed");
                e.preventDefault();
                e.stopImmediatePropagation();
                if (!sendSignal('TOGGLE_PLAYBACK')) {
                    dispatchFallbackKey(FALLBACK_PS4_KEYS.PLAY_PAUSE);
                }
                break;
        }
    }, true);
})();
