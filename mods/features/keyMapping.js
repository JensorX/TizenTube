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

    function sendSignal(signal) {
        console.log(`TizenTube: Sending signal ${signal}`);
        try {
            resolveCommand({
                signalAction: {
                    signal: signal
                }
            });
        } catch (e) {
            console.error("TizenTube: Failed to send signal", e);
        }
    }

    window.addEventListener('keydown', (e) => {
        // Only remap if we are on the YouTube app (not our own settings UI)
        if (document.querySelector('.ytaf-ui-container')?.style.display === 'block') return;

        switch (e.keyCode) {
            case TIZEN_KEYS.BACK:
                console.log("TizenTube: Back pressed, resolving command...");
                e.preventDefault();
                e.stopImmediatePropagation();
                // We send both BACK and POPUP_BACK to cover all cases
                sendSignal('BACK');
                sendSignal('POPUP_BACK');
                break;
            case TIZEN_KEYS.PLAY_PAUSE:
            case TIZEN_KEYS.PLAY:
            case TIZEN_KEYS.PAUSE:
                console.log("TizenTube: Play/Pause pressed, resolving command...");
                e.preventDefault();
                e.stopImmediatePropagation();
                sendSignal('TOGGLE_PLAYBACK');
                break;
        }
    }, true);
})();
