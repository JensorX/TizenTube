import { configRead } from '../config.js';

/**
 * Low-level Media Hooks for TizenTube
 * 
 * This module intercepts browser media APIs to:
 * 1. Force hardware-accelerated codecs (avc1) by reporting others as unsupported.
 * 2. Monitor DRM (EME) activity.
 * 3. Optimize MSE behavior.
 */

export function initMediaHooks() {
    hookMediaSource();
    hookEME();
}

function hookMediaSource() {
    if (typeof window.MediaSource === 'undefined') return;

    const originalIsTypeSupported = window.MediaSource.isTypeSupported;

    window.MediaSource.isTypeSupported = function (type) {
        const lowerType = type.toLowerCase();
        const performanceMode = configRead('enablePerformanceMode');

        // Individual blocks
        const disableAV1 = configRead('disableAV1') || performanceMode;
        const disableVP9 = configRead('disableVP9');
        const disableAVC = configRead('disableAVC');
        const disableVP8 = configRead('disableVP8') || performanceMode;
        const disableHEVC = configRead('disableHEVC') || performanceMode;
        const disable60fps = configRead('disable60fps') || performanceMode;

        // Codec filtering
        if (disableAV1 && (lowerType.includes('av1') || lowerType.includes('av01'))) return false;
        if (disableVP9 && (lowerType.includes('vp9') || lowerType.includes('vp09'))) return false;
        if (disableAVC && (lowerType.includes('avc') || lowerType.includes('avc1'))) return false;
        if (disableVP8 && (lowerType.includes('vp8') || lowerType.includes('vp08'))) return false;
        if (disableHEVC && (lowerType.includes('hev') || lowerType.includes('hvc'))) return false;

        // Frame rate filtering (match YourCodecs)
        const fpsMatch = /framerate=(\d+)/.exec(lowerType) || /fps=(\d+)/.exec(lowerType);
        if (disable60fps && fpsMatch && parseInt(fpsMatch[1]) > 30) {
            // console.debug('[MediaHooks] Blocking high frame rate:', type);
            return false;
        }

        return originalIsTypeSupported.call(window.MediaSource, type);
    };

    // Also hook canPlayType on video prototype as a fallback
    const originalCanPlayType = HTMLMediaElement.prototype.canPlayType;
    HTMLMediaElement.prototype.canPlayType = function (type) {
        const lowerType = type.toLowerCase();
        const performanceMode = configRead('enablePerformanceMode');

        // Individual blocks (same as above)
        const disableAV1 = configRead('disableAV1') || performanceMode;
        const disableVP9 = configRead('disableVP9');
        const disableAVC = configRead('disableAVC');
        const disableVP8 = configRead('disableVP8') || performanceMode;
        const disableHEVC = configRead('disableHEVC') || performanceMode;
        const disable60fps = configRead('disable60fps') || performanceMode;

        if (disableAV1 && (lowerType.includes('av1') || lowerType.includes('av01'))) return '';
        if (disableVP9 && (lowerType.includes('vp9') || lowerType.includes('vp09'))) return '';
        if (disableAVC && (lowerType.includes('avc') || lowerType.includes('avc1'))) return '';
        if (disableVP8 && (lowerType.includes('vp8') || lowerType.includes('vp08'))) return '';
        if (disableHEVC && (lowerType.includes('hev') || lowerType.includes('hvc'))) return '';

        const fpsMatch = /framerate=(\d+)/.exec(lowerType) || /fps=(\d+)/.exec(lowerType);
        if (disable60fps && fpsMatch && parseInt(fpsMatch[1]) > 30) return '';

        return originalCanPlayType.call(this, type);
    };

    console.info('[MediaHooks] MSE hooks initialized');
}

function hookEME() {
    if (!navigator.requestMediaKeySystemAccess) return;

    const originalRequestAccess = navigator.requestMediaKeySystemAccess;

    navigator.requestMediaKeySystemAccess = function (keySystem, configurations) {
        // console.debug('[MediaHooks] EME Request:', keySystem, configurations);

        // Potential optimization: If performance mode is extreme, we could disable DRM
        // but that would break many commercial videos. For now, we just monitor.

        return originalRequestAccess.call(navigator, keySystem, configurations);
    };

    console.info('[MediaHooks] EME hooks initialized');
}
