(function () {
    const BRIDGED_KEYS = {
        10009: { keyCode: 27, key: 'Escape', code: 'Escape' },
        415: { keyCode: 179, key: 'MediaPlayPause', code: 'MediaPlayPause' },
        19: { keyCode: 179, key: 'MediaPlayPause', code: 'MediaPlayPause' },
        10252: { keyCode: 179, key: 'MediaPlayPause', code: 'MediaPlayPause' },
        412: { keyCode: 178, key: 'MediaStop', code: 'MediaStop' },
        413: { keyCode: 176, key: 'MediaTrackNext', code: 'MediaTrackNext' },
        417: { keyCode: 177, key: 'MediaTrackPrevious', code: 'MediaTrackPrevious' },
        10232: { keyCode: 227, key: 'MediaRewind', code: 'MediaRewind' },
        10233: { keyCode: 228, key: 'MediaFastForward', code: 'MediaFastForward' }
    };

    const TIZEN_KEY_NAMES = {
        MediaPlayPause: { keyCode: 179, key: 'MediaPlayPause', code: 'MediaPlayPause' },
        MediaPlay: { keyCode: 126, key: 'MediaPlay', code: 'MediaPlay' },
        MediaPause: { keyCode: 127, key: 'MediaPause', code: 'MediaPause' },
        MediaStop: { keyCode: 178, key: 'MediaStop', code: 'MediaStop' },
        MediaFastForward: { keyCode: 228, key: 'MediaFastForward', code: 'MediaFastForward' },
        MediaRewind: { keyCode: 227, key: 'MediaRewind', code: 'MediaRewind' },
        MediaTrackNext: { keyCode: 176, key: 'MediaTrackNext', code: 'MediaTrackNext' },
        MediaTrackPrevious: { keyCode: 177, key: 'MediaTrackPrevious', code: 'MediaTrackPrevious' }
    };

    function defineLegacyKeyProps(event, mapped) {
        try {
            Object.defineProperty(event, 'keyCode', { get: () => mapped.keyCode });
            Object.defineProperty(event, 'which', { get: () => mapped.keyCode });
            Object.defineProperty(event, 'charCode', { get: () => 0 });
        } catch (_) {}
    }

    function dispatchMappedEvent(originalEvent, mapped) {
        const target = document.activeElement || document.body || document.documentElement || document;
        const event = new KeyboardEvent(originalEvent.type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            key: mapped.key,
            code: mapped.code,
            repeat: originalEvent.repeat
        });

        defineLegacyKeyProps(event, mapped);

        try {
            Object.defineProperty(event, '__tizentubeBridged', { value: true });
        } catch (_) {}

        target.dispatchEvent(event);
    }

    function registerKnownMediaKeys() {
        if (!window.tizen || !tizen.tvinputdevice) return;

        for (const keyName of Object.keys(TIZEN_KEY_NAMES)) {
            try {
                tizen.tvinputdevice.registerKey(keyName);
            } catch (_) {}

            try {
                const key = tizen.tvinputdevice.getKey(keyName);
                if (key && typeof key.code === 'number') {
                    BRIDGED_KEYS[key.code] = TIZEN_KEY_NAMES[keyName];
                }
            } catch (_) {}
        }
    }

    function bridgeRemoteKey(event) {
        if (event.__tizentubeBridged) return;

        const mapped = BRIDGED_KEYS[event.keyCode];
        if (!mapped) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        dispatchMappedEvent(event, mapped);
    }

    registerKnownMediaKeys();
    window.addEventListener('keydown', bridgeRemoteKey, true);
    window.addEventListener('keyup', bridgeRemoteKey, true);
})();