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
                value.featureSwitches.enableShortsTransitionFix = true;
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
                // value.featureSwitches.enableOneClickPause = true; // Pause with one click
                // value.featureSwitches.enableNavAsOverlay = true; // Required for nav overlay transitions and scrim behavior
                value.featureSwitches.disableNavAsOverlayScrim = false; // Keep the overlay scrim active for proper fade/transparency under nav
                value.featureSwitches.useModernOverlayListItemStyle = true; // New overlay item styles with better transition support
                value.featureSwitches.enableLeftNavModernization = true; // Modernized left nav pairs better with overlay animation paths
                value.featureSwitches.enableDeferPivotRendering = true; // Reduces abrupt pivot/sidesheet content swaps
                value.featureSwitches.deferInlineFadeOut = true; // Use fade-out path instead of hard hide for inline elements
                value.featureSwitches.useUpdatedImmersiveMastheadScrim = true; // Updated scrim handling improves top-layer transparency blending
                value.featureSwitches.disableStandardImmersiveMastheadGradient = false; // Keep immersive gradient path enabled
                value.featureSwitches.enableCaptionsPersistence = true; // Remember caption settings
                value.featureSwitches.enableDirectEntryToShortsClient = true; // Faster shorts entry

                // Voice Search Support
                value.featureSwitches.enableVoiceSearch = true;
                value.featureSwitches.supportsVoiceSearch = true;
                value.featureSwitches.enableVoiceSearchOnWatch = true;
                value.featureSwitches.useWebSpeechApi = true;
                value.featureSwitches.voiceSearchUseSystemInput = true;
                value.featureSwitches.enableVoiceSearchAutoSubmit = true;
                value.featureSwitches.voiceSearchAutoSubmitDelayMs = 0;
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

    // Add a visible indicator to verify the script is running (bypassing caches)
    setTimeout(() => {
        if (window._yttv) {
            import('../ui/ytUI.js').then(module => {
                module.showToast('TizenTube', 'UA: ' + navigator.userAgent);
            }).catch(() => { });
        }
    }, 5000);
})();
