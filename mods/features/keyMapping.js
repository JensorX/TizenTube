/**
 * Key Mapping Feature
 * 
 * When spoofing a PlayStation 4 User Agent, YouTube TV expects PS4-specific key codes.
 * This script intercepts Tizen remote control events and re-dispatches them as the 
 * key codes that YouTube's PS4 client understands.
 */

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

    const PS4_KEYS = {
        BACK: 27,        // Escape (mapped to Circle on PS4)
        PLAY_PAUSE: 32,  // Space (often used for Play/Pause)
    };

    function dispatchKey(keyCode) {
        console.log(`TizenTube: Remapping key to ${keyCode}`);
        const event = new KeyboardEvent('keydown', {
            keyCode: keyCode,
            which: keyCode,
            bubbles: true,
            cancelable: true,
            view: window
        });
        document.dispatchEvent(event);
    }

    window.addEventListener('keydown', (e) => {
        // Only remap if we are on the YouTube app (not our own settings UI)
        if (document.querySelector('.ytaf-ui-container')?.style.display === 'block') return;

        switch (e.keyCode) {
            case TIZEN_KEYS.BACK:
                e.preventDefault();
                e.stopImmediatePropagation();
                dispatchKey(PS4_KEYS.BACK);
                break;
            case TIZEN_KEYS.PLAY_PAUSE:
            case TIZEN_KEYS.PLAY:
            case TIZEN_KEYS.PAUSE:
                e.preventDefault();
                e.stopImmediatePropagation();
                dispatchKey(PS4_KEYS.PLAY_PAUSE);
                break;
        }
    }, true); // Use capture phase to intercept before YouTube's own listeners
})();
