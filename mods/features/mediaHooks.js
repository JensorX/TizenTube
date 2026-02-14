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
        const performanceMode = configRead('enablePerformanceMode');

        // Normalize type string
        const lowerType = type.toLowerCase();

        if (performanceMode) {
            // In performance mode, we want to AVOID software-decoded or high-CPU codecs.
            // Prioritize avc1 (H.264 / AVC).
            if (lowerType.includes('vp9') || lowerType.includes('av01') || lowerType.includes('av1')) {
                // console.debug('[MediaHooks] Blocking codec support for:', type);
                return false;
            }

            if (lowerType.includes('avc1')) {
                return originalIsTypeSupported.call(window.MediaSource, type);
            }
        }

        return originalIsTypeSupported.call(window.MediaSource, type);
    };

    // Also hook canPlayType on video prototype as a fallback
    const originalCanPlayType = HTMLMediaElement.prototype.canPlayType;
    HTMLMediaElement.prototype.canPlayType = function (type) {
        const performanceMode = configRead('enablePerformanceMode');
        const lowerType = type.toLowerCase();

        if (performanceMode) {
            if (lowerType.includes('vp9') || lowerType.includes('av01') || lowerType.includes('av1')) {
                return '';
            }
        }

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
