/**
 * YouTube Tamers — TizenTube integration module
 *
 * Manages activation of CPU Tamer and TV Engine Tamer based on user config.
 * Scripts are bundled directly into the rollup build (no external loading).
 */

import { configRead, configChangeEmitter } from '../config.js';
import { activate as activateCpuTamer } from './cpuTamerTV.js';
import { activate as activateTvEngineTamer } from './tvEngineTamer.js';

const TAG = '[TizenTube/Tamers]';

const CONFIG_KEYS = {
    CPU_TAMER: 'enableYoutubeCpuTamer',
    JS_ENGINE_TAMER: 'enableYoutubeJsEngineTamer'
};

const SCRIPT_LABELS = {
    [CONFIG_KEYS.CPU_TAMER]: 'CPU Tamer',
    [CONFIG_KEYS.JS_ENGINE_TAMER]: 'TV Engine Tamer'
};

const tamerState = {
    [CONFIG_KEYS.CPU_TAMER]: 'disabled',
    [CONFIG_KEYS.JS_ENGINE_TAMER]: 'disabled'
};

let startupToastShown = false;

// Expose state for debugging via showToast
window.__ttYoutubeTamers = {
    loadedAt: Date.now(),
    states: tamerState,
};

// --- Activation logic ---

function activateTamers() {
    const cpuEnabled = configRead(CONFIG_KEYS.CPU_TAMER);
    const engineEnabled = configRead(CONFIG_KEYS.JS_ENGINE_TAMER);

    if (!cpuEnabled && !engineEnabled) return;

    const results = [];

    if (cpuEnabled) {
        tamerState[CONFIG_KEYS.CPU_TAMER] = 'pending';
        try {
            // CPU Tamer is async (obtains clean timers via iframe)
            activateCpuTamer().then((success) => {
                tamerState[CONFIG_KEYS.CPU_TAMER] = success ? 'loaded' : 'failed';
                console.info(TAG, `CPU Tamer: ${tamerState[CONFIG_KEYS.CPU_TAMER]}`);
                tryShowToast();
            }).catch((err) => {
                tamerState[CONFIG_KEYS.CPU_TAMER] = 'failed';
                console.warn(TAG, 'CPU Tamer failed:', err);
                tryShowToast();
            });
            results.push('CPU Tamer: activating');
        } catch (err) {
            tamerState[CONFIG_KEYS.CPU_TAMER] = 'failed';
            console.warn(TAG, 'CPU Tamer failed:', err);
        }
    }

    if (engineEnabled) {
        tamerState[CONFIG_KEYS.JS_ENGINE_TAMER] = 'pending';
        try {
            const success = activateTvEngineTamer();
            tamerState[CONFIG_KEYS.JS_ENGINE_TAMER] = success ? 'loaded' : 'failed';
            console.info(TAG, `TV Engine Tamer: ${tamerState[CONFIG_KEYS.JS_ENGINE_TAMER]}`);
        } catch (err) {
            tamerState[CONFIG_KEYS.JS_ENGINE_TAMER] = 'failed';
            console.warn(TAG, 'TV Engine Tamer failed:', err);
        }
    }

    // Show a toast after a delay to allow _yttv.resolveCommand to become available
    scheduleToast();
}

// --- Toast display ---

function isResolveCommandReady() {
    if (!window._yttv || typeof window._yttv !== 'object') return false;
    for (const key in window._yttv) {
        if (
            window._yttv[key] &&
            window._yttv[key].instance &&
            typeof window._yttv[key].instance.resolveCommand === 'function'
        ) {
            return true;
        }
    }
    return false;
}

function tryShowToast() {
    if (startupToastShown) return;

    const enabledKeys = Object.values(CONFIG_KEYS).filter((key) => configRead(key));
    if (!enabledKeys.length) return;

    const loaded = enabledKeys
        .filter((key) => tamerState[key] === 'loaded')
        .map((key) => SCRIPT_LABELS[key]);
    const failed = enabledKeys
        .filter((key) => tamerState[key] === 'failed')
        .map((key) => SCRIPT_LABELS[key]);
    const pending = enabledKeys
        .filter((key) => tamerState[key] === 'pending')
        .map((key) => SCRIPT_LABELS[key]);

    // Don't show toast if everything is still pending
    if (pending.length === enabledKeys.length) return;

    if (!isResolveCommandReady()) return;

    const parts = [];
    if (loaded.length) parts.push(`✓ ${loaded.join(', ')}`);
    if (failed.length) parts.push(`✗ ${failed.join(', ')}`);
    if (pending.length) parts.push(`… ${pending.join(', ')}`);

    if (!parts.length) return;

    import('../ui/ytUI.js')
        .then((module) => {
            module.showToast('TizenTube Tamers', parts.join(' | '));
            startupToastShown = true;
        })
        .catch(() => {
            // ytUI not ready yet, will retry via scheduleToast
        });
}

function scheduleToast() {
    let attempts = 0;
    const maxAttempts = 30;

    const tryToast = () => {
        if (startupToastShown) return;
        attempts++;

        if (isResolveCommandReady()) {
            tryShowToast();
            if (startupToastShown) return;
        }

        if (attempts < maxAttempts) {
            setTimeout(tryToast, 1000);
        }
    };

    // First attempt after a reasonable delay
    setTimeout(tryToast, 3000);

    // Also try on first video play
    const onFirstPlay = () => {
        if (!startupToastShown) tryShowToast();
        document.removeEventListener('play', onFirstPlay, true);
    };
    document.addEventListener('play', onFirstPlay, true);
}

// --- Startup ---

function scheduleStartup() {
    const run = () => {
        // Delay injection so TizenTube core patches initialize first
        setTimeout(activateTamers, 3000);
    };

    if (document.readyState === 'complete') {
        run();
    } else {
        window.addEventListener('load', run, { once: true });
    }
}

// --- Config change listener ---

configChangeEmitter.addEventListener('configChange', (event) => {
    const key = event?.detail?.key;
    if (key !== CONFIG_KEYS.CPU_TAMER && key !== CONFIG_KEYS.JS_ENGINE_TAMER) return;

    if (configRead(key)) {
        // Activate the requested tamer
        if (key === CONFIG_KEYS.CPU_TAMER && tamerState[key] !== 'loaded') {
            tamerState[key] = 'pending';
            activateCpuTamer().then((success) => {
                tamerState[key] = success ? 'loaded' : 'failed';
                startupToastShown = false;
                tryShowToast();
                scheduleToast();
            });
        } else if (key === CONFIG_KEYS.JS_ENGINE_TAMER && tamerState[key] !== 'loaded') {
            tamerState[key] = 'pending';
            const success = activateTvEngineTamer();
            tamerState[key] = success ? 'loaded' : 'failed';
            startupToastShown = false;
            tryShowToast();
            scheduleToast();
        }
    } else {
        tamerState[key] = 'disabled';
        console.warn(TAG, `${SCRIPT_LABELS[key]} disabled. Reload required to fully remove runtime patches.`);
    }
});

// Start
scheduleStartup();
