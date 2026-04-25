import { configRead, configChangeEmitter } from '../config.js';

function applyLowMemoryMode() {
    if (!configRead('enableLowMemoryMode')) return;

    if (!window._yttv) {
        return setTimeout(applyLowMemoryMode, 250);
    }

    const yttvValues = Object.values(window._yttv);

    // Look for feature switches in window.environment or window._yttv instances
    for (const val of yttvValues) {
        if (val && typeof val === 'object') {
            // Check for feature_switches or experiments
            if (val.feature_switches) {
                val.feature_switches.enable_memory_saving_mode = true;
            }
        }
    }

    if (window.environment && window.environment.feature_switches) {
        window.environment.feature_switches.enable_memory_saving_mode = true;
    }
    
    if (window.tectonicConfig && window.tectonicConfig.feature_switches) {
        window.tectonicConfig.feature_switches.enable_memory_saving_mode = true;
    }
}

configChangeEmitter.addEventListener('configChange', (event) => {
    if (event.detail.key === 'enableLowMemoryMode') {
        applyLowMemoryMode();
    }
});

if (document.readyState === 'complete') {
    applyLowMemoryMode();
} else {
    window.addEventListener('load', applyLowMemoryMode);
}
