import { configRead, configChangeEmitter } from '../config.js';

const CONFIG_KEYS = {
    CPU_TAMER: 'enableYoutubeCpuTamer',
    JS_ENGINE_TAMER: 'enableYoutubeJsEngineTamer'
};

const SCRIPT_URLS = {
    [CONFIG_KEYS.CPU_TAMER]: 'https://update.greasyfork.org/scripts/431573/YouTube%20CPU%20Tamer%20by%20AnimationFrame.user.js',
    [CONFIG_KEYS.JS_ENGINE_TAMER]: 'https://update.greasyfork.org/scripts/473972/YouTube%20JS%20Engine%20Tamer.user.js'
};

const SCRIPT_IDS = {
    [CONFIG_KEYS.CPU_TAMER]: 'tt-youtube-cpu-tamer',
    [CONFIG_KEYS.JS_ENGINE_TAMER]: 'tt-youtube-js-engine-tamer'
};

const SCRIPT_LABELS = {
    [CONFIG_KEYS.CPU_TAMER]: 'CPU Tamer',
    [CONFIG_KEYS.JS_ENGINE_TAMER]: 'JS Engine Tamer'
};

const tamerState = {
    [CONFIG_KEYS.CPU_TAMER]: 'disabled',
    [CONFIG_KEYS.JS_ENGINE_TAMER]: 'disabled'
};

let startupToastShown = false;
let startupApplyScheduled = false;
let toastRetryTimer = null;
let playbackToastHooked = false;

window.__ttYoutubeTamers = {
    loadedAt: Date.now(),
    lastToastAttemptAt: 0,
    states: tamerState,
};

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

function queueToastRetry(delayMs = 1500) {
    if (toastRetryTimer) return;
    toastRetryTimer = setTimeout(() => {
        toastRetryTimer = null;
        showTamerStatusToast();
    }, delayMs);
}

function showTamerStatusToast() {
    if (startupToastShown) return;

    window.__ttYoutubeTamers.lastToastAttemptAt = Date.now();

    const enabledKeys = Object.keys(CONFIG_KEYS)
        .map((key) => CONFIG_KEYS[key])
        .filter((key) => configRead(key));

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

    const parts = [];
    if (loaded.length) parts.push(`loaded: ${loaded.join(', ')}`);
    if (failed.length) parts.push(`failed: ${failed.join(', ')}`);
    if (pending.length) parts.push(`pending: ${pending.join(', ')}`);

    if (!parts.length) return;

    if (!isResolveCommandReady()) {
        queueToastRetry(1200);
        return;
    }

    import('../ui/ytUI.js')
        .then((module) => {
            module.showToast('TizenTube', `Tamers ${parts.join(' | ')}`);
            startupToastShown = true;
            if (toastRetryTimer) {
                clearTimeout(toastRetryTimer);
                toastRetryTimer = null;
            }
        })
        .catch(() => {
            if (startupToastShown) return;
            queueToastRetry(1500);
        });
}

function scheduleStartupToast() {
    const trigger = () => {
        setTimeout(showTamerStatusToast, 1800);
    };

    if (document.readyState === 'complete') {
        trigger();
        return;
    }

    window.addEventListener('load', trigger, { once: true });
}

function setupPlaybackToastFallback() {
    if (playbackToastHooked) return;
    playbackToastHooked = true;

    const onFirstPlay = () => {
        if (!startupToastShown) {
            showTamerStatusToast();
        }
        document.removeEventListener('play', onFirstPlay, true);
    };

    document.addEventListener('play', onFirstPlay, true);
}

function injectScript(configKey) {
    const scriptId = SCRIPT_IDS[configKey];
    const scriptUrl = SCRIPT_URLS[configKey];

    if (!scriptId || !scriptUrl) return;
    if (document.getElementById(scriptId)) {
        if (tamerState[configKey] === 'disabled') {
            tamerState[configKey] = 'loaded';
        }
        return;
    }

    tamerState[configKey] = 'pending';

    const script = document.createElement('script');
    script.id = scriptId;
    script.src = scriptUrl;
    script.async = false;
    script.crossOrigin = 'anonymous';
    script.referrerPolicy = 'no-referrer';

    script.onload = () => {
        tamerState[configKey] = 'loaded';
        console.info(`[TizenTube] Loaded external tamer script: ${scriptId}`);
    };

    script.onerror = (error) => {
        tamerState[configKey] = 'failed';
        console.warn(`[TizenTube] Failed to load external tamer script: ${scriptId}`, error);
    };

    (document.documentElement || document.head || document.body).appendChild(script);
}

function applyConfiguredTamers() {
    tamerState[CONFIG_KEYS.CPU_TAMER] = configRead(CONFIG_KEYS.CPU_TAMER) ? 'pending' : 'disabled';
    tamerState[CONFIG_KEYS.JS_ENGINE_TAMER] = configRead(CONFIG_KEYS.JS_ENGINE_TAMER) ? 'pending' : 'disabled';

    if (configRead(CONFIG_KEYS.CPU_TAMER)) {
        injectScript(CONFIG_KEYS.CPU_TAMER);
    }

    if (configRead(CONFIG_KEYS.JS_ENGINE_TAMER)) {
        injectScript(CONFIG_KEYS.JS_ENGINE_TAMER);
    }

    scheduleStartupToast();
    setupPlaybackToastFallback();
}

function scheduleApplyConfiguredTamers() {
    if (startupApplyScheduled) return;
    startupApplyScheduled = true;

    const run = () => {
        // Delay injection so TizenTube core patches initialize first.
        setTimeout(applyConfiguredTamers, 3000);
    };

    if (document.readyState === 'complete') {
        run();
        return;
    }

    window.addEventListener('load', run, { once: true });
}

configChangeEmitter.addEventListener('configChange', (event) => {
    const key = event?.detail?.key;
    if (key !== CONFIG_KEYS.CPU_TAMER && key !== CONFIG_KEYS.JS_ENGINE_TAMER) return;

    if (configRead(key)) {
        injectScript(key);
        startupToastShown = false;
        scheduleStartupToast();
        setupPlaybackToastFallback();
    } else {
        tamerState[key] = 'disabled';
        console.warn(`[TizenTube] ${key} disabled. Reload required to fully remove already applied runtime patches.`);
    }
});

scheduleApplyConfiguredTamers();
