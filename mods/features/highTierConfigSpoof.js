// Spoof device tier and memory limits early to trick YouTube into rendering the high-end TV experience
// This gives us the full React DOM with CSS transition animations instead of the broken limited-memory UI.

(function () {
    function applySpoof(value) {
        if (value) {
            if (value.featureSwitches) {
                // Tier and Performance
                value.featureSwitches.isLimitedMemory = false;
                value.featureSwitches.receiverTier = 1;

                // Core Animations
                value.featureSwitches.enableAnimations = true;
                value.featureSwitches.enableListAnimations = true;
                value.featureSwitches.enableVirtualListItemTransition = true;
                value.featureSwitches.supportsLottieAnimations = true;
                value.featureSwitches.supportsPlayerResizeAnimation = true;
                value.featureSwitches.isSqueezebackAnimatable = true;
                value.featureSwitches.enableOnScrollLinearAnimation = true;
                value.featureSwitches.enableLikeButtonAnimation = true;
                value.featureSwitches.enableSkipButtonSlideInAnimation = true;
                value.featureSwitches.enableCobaltTransitionFix = true;
                value.featureSwitches.disableShortsTransitionAnimation = false;
                value.featureSwitches.enableStartupSound = true;

                // Modern Native App Features
                value.featureSwitches.enableMountedFocusedTileInlinePlayback = true; // Video previews on home
                value.featureSwitches.enableShortsProgressBar = true; // Progress bar for Shorts
                value.featureSwitches.supportsLongPress = true; // Context menu on long press
                value.featureSwitches.enableModernOverlaySidesheetStacking = true; // Improved menu stacking
                value.featureSwitches.enableBackgroundFadeOnPreview = true; // Smooth preview transitions
                value.featureSwitches.enableAudioLottieBg = true; // Lottie animations for audio content
                value.featureSwitches.isSqueezebackCapable = true; // Required for player shrink animations
                value.featureSwitches.enableSearchBarOnWatch = true; // Search while watching
                value.featureSwitches.enableOneClickPause = true; // Pause with one click
                value.featureSwitches.enableNavAsOverlay = true; // Navigation menu as overlay
                value.featureSwitches.enableCaptionsPersistence = true; // Remember caption settings
                value.featureSwitches.enableDirectEntryToShortsClient = true; // Faster shorts entry
            }

            if (value.clientData) {
                value.clientData.legacyApplicationQuality = 'full-animation';
                value.clientData.webpSupport = true;
            }
        }
        return value;
    }

    let originalTectonicConfig = window.tectonicConfig;

    // If it's already defined before this script runs, apply the spoof immediately!
    if (originalTectonicConfig) {
        applySpoof(originalTectonicConfig);
    }

    try {
        Object.defineProperty(window, 'tectonicConfig', {
            get() {
                return originalTectonicConfig;
            },
            set(value) {
                originalTectonicConfig = applySpoof(value);
            },
            configurable: true
        });
    } catch (e) {
        console.error("Failed to redefine tectonicConfig", e);
    }

    // Fallback: YouTube often mirrors these settings in ytcfg.
    // We aggressively patch ytcfg as well to ensure React components picking up config late also get the high-tier flags.
    let ytcfgInterval = setInterval(() => {
        if (!window.ytcfg || !window.ytcfg.set) return;

        let data = window.ytcfg.data_ || (window.ytcfg.get ? window.ytcfg.get() : null);
        if (data) {
            let changed = false;
            if (data.clientData && data.clientData.legacyApplicationQuality !== 'full-animation') {
                data.clientData.legacyApplicationQuality = 'full-animation';
                data.clientData.webpSupport = true;
                changed = true;
            }
            if (data.featureSwitches && data.featureSwitches.isLimitedMemory !== false) {
                applySpoof(data);
                changed = true;
            }
            
            if (changed) {
                window.ytcfg.set(data);
            }
        }
    }, 100);

    // Stop checking aggressively after 10 seconds (boot is done)
    setTimeout(() => clearInterval(ytcfgInterval), 10000);

    // Add a visible indicator to verify the script is running (bypassing caches)
    setTimeout(() => {
        if (window._yttv) {
            import('../ui/ytUI.js').then(module => {
                module.showToast('TizenTube', 'HighTier Spoof Active! (Cache cleared)');
            }).catch(() => {});
        }
    }, 5000);
})();
