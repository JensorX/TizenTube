// Spoof device tier and memory limits early to trick YouTube into rendering the high-end TV experience
// This gives us the full React DOM with CSS transition animations instead of the broken limited-memory UI.

(function () {
    function forceReducedMotionOff() {
        const originalMatchMedia = window.matchMedia;
        if (typeof originalMatchMedia !== 'function') return;

        window.matchMedia = function (query) {
            const q = String(query || '').toLowerCase();
            if (q.includes('prefers-reduced-motion')) {
                return {
                    matches: false,
                    media: query,
                    onchange: null,
                    addListener() { },
                    removeListener() { },
                    addEventListener() { },
                    removeEventListener() { },
                    dispatchEvent() { return false; }
                };
            }
            return originalMatchMedia.call(this, query);
        };
    }

    function forceMemorySavingOffEverywhere() {
        if (window.environment && window.environment.feature_switches) {
            window.environment.feature_switches.enable_memory_saving_mode = false;
        }

        if (window.tectonicConfig && window.tectonicConfig.feature_switches) {
            window.tectonicConfig.feature_switches.enable_memory_saving_mode = false;
        }

        if (window.tectonicConfig && window.tectonicConfig.featureSwitches) {
            window.tectonicConfig.featureSwitches.isLimitedMemory = false;
        }

        if (window._yttv) {
            for (const val of Object.values(window._yttv)) {
                if (val && typeof val === 'object' && val.feature_switches) {
                    val.feature_switches.enable_memory_saving_mode = false;
                }
            }
        }
    }

    function getRuntimeAnimationSnapshot() {
        const fsCamel = window.tectonicConfig && window.tectonicConfig.featureSwitches;
        const fsSnake = window.tectonicConfig && window.tectonicConfig.feature_switches;
        const envSnake = window.environment && window.environment.feature_switches;

        return {
            reducedMotion: window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
            isLimitedMemory: fsCamel ? fsCamel.isLimitedMemory : undefined,
            enableMemorySavingMode: fsSnake ? fsSnake.enable_memory_saving_mode : undefined,
            environmentMemorySavingMode: envSnake ? envSnake.enable_memory_saving_mode : undefined,
            enableAnimations: fsCamel ? fsCamel.enableAnimations : undefined,
            enableListAnimations: fsCamel ? fsCamel.enableListAnimations : undefined,
            enableVirtualListItemTransition: fsCamel ? fsCamel.enableVirtualListItemTransition : undefined,
            enableModernOverlaySidesheetStacking: fsCamel ? fsCamel.enableModernOverlaySidesheetStacking : undefined,
            enableNavAsOverlay: fsCamel ? fsCamel.enableNavAsOverlay : undefined,
            disableNavAsOverlayScrim: fsCamel ? fsCamel.disableNavAsOverlayScrim : undefined,
            deferInlineFadeOut: fsCamel ? fsCamel.deferInlineFadeOut : undefined,
            enableDeferPivotRendering: fsCamel ? fsCamel.enableDeferPivotRendering : undefined,
            useUpdatedImmersiveMastheadScrim: fsCamel ? fsCamel.useUpdatedImmersiveMastheadScrim : undefined,
            horizontalListDurationMs: fsCamel ? fsCamel.horizontalListDurationMs : undefined,
            verticalListDurationMs: fsCamel ? fsCamel.verticalListDurationMs : undefined
        };
    }

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
                value.featureSwitches.supportsPlayerResizeAnimation = false;
                value.featureSwitches.isSqueezebackAnimatable = false;
                value.featureSwitches.enableOnScrollLinearAnimation = false;
                value.featureSwitches.enableLikeButtonAnimation = false;
                value.featureSwitches.enableSkipButtonSlideInAnimation = false;
                value.featureSwitches.enableCobaltTransitionFix = false;
                value.featureSwitches.disableShortsTransitionAnimation = false;
                value.featureSwitches.enableShortsTransitionFix = false;
                value.featureSwitches.enableStartupSound = true;

                // Browser parity profile for smoother transitions on TV runtimes.
                // The desktop browser config with smooth transitions uses these values.
                value.featureSwitches.enableMountedFocusedTileInlinePlayback = false;
                value.featureSwitches.enableShortsProgressBar = false;
                value.featureSwitches.supportsLongPress = true; // Context menu on long press
                value.featureSwitches.enableModernOverlaySidesheetStacking = false;
                value.featureSwitches.enableBackgroundFadeOnPreview = false;
                value.featureSwitches.enableAudioLottieBg = false;
                value.featureSwitches.isSqueezebackCapable = true; // Required for player shrink animations
                value.featureSwitches.enableSearchBarOnWatch = false;
                value.featureSwitches.enableOneClickPause = false;
                value.featureSwitches.enableNavAsOverlay = false;
                value.featureSwitches.disableNavAsOverlayScrim = false;
                value.featureSwitches.useModernOverlayListItemStyle = true; // New overlay item styles with better transition support
                value.featureSwitches.enableLeftNavModernization = true; // Modernized left nav pairs better with overlay animation paths
                value.featureSwitches.enableDeferPivotRendering = true;
                value.featureSwitches.deferInlineFadeOut = true;
                value.featureSwitches.useUpdatedImmersiveMastheadScrim = true; // Updated scrim handling improves top-layer transparency blending
                value.featureSwitches.disableStandardImmersiveMastheadGradient = false; // Keep immersive gradient path enabled
                value.featureSwitches.enableCaptionsPersistence = false;
                value.featureSwitches.enableDirectEntryToShortsClient = false;
                value.featureSwitches.enableExitOverlay = false;
                value.featureSwitches.mastheadInline = true;

                // Match production animation timing defaults used by richer UI buckets.
                value.featureSwitches.horizontalListDurationMs = 200;
                value.featureSwitches.verticalListDurationMs = 300;

                // Voice Search Support
                value.featureSwitches.enableVoiceSearch = true;
                value.featureSwitches.supportsVoiceSearch = true;
                value.featureSwitches.enableVoiceSearchOnWatch = true;
                value.featureSwitches.useWebSpeechApi = true;
                value.featureSwitches.voiceSearchUseSystemInput = true;
                value.featureSwitches.enableVoiceSearchAutoSubmit = true;
                value.featureSwitches.voiceSearchAutoSubmitDelayMs = 0;
            }

            if (value.feature_switches) {
                value.feature_switches.enable_memory_saving_mode = false;
            }

            if (value.clientData) {
                value.clientData.legacyApplicationQuality = 'full-animation';
                value.clientData.webpSupport = true;
            }
        }
        return value;
    }

    forceReducedMotionOff();
    forceMemorySavingOffEverywhere();

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
        forceMemorySavingOffEverywhere();
        const snapshot = getRuntimeAnimationSnapshot();
        console.info('TizenTube animation snapshot', snapshot);

        if (window._yttv) {
            import('../ui/ytUI.js').then(module => {
                const summary = [
                    'A:' + (snapshot.enableAnimations ? '1' : '0'),
                    'List:' + (snapshot.enableListAnimations ? '1' : '0'),
                    'VList:' + (snapshot.enableVirtualListItemTransition ? '1' : '0'),
                    'MM:' + (snapshot.enableMemorySavingMode ? '1' : '0'),
                    'EnvMM:' + (snapshot.environmentMemorySavingMode ? '1' : '0'),
                    'RMotion:' + (snapshot.reducedMotion ? '1' : '0')
                ].join(' ');
                module.showToast('TizenTube', 'AnimDiag ' + summary);
            }).catch(() => { });
        }
    }, 5000);

    // Some runtimes rewrite feature bags after startup; keep a short bootstrap watchdog
    // and then rely on navigation/lifecycle events.
    const BOOTSTRAP_REAPPLY_INTERVAL_MS = 3000;
    const BOOTSTRAP_REAPPLY_DURATION_MS = 45000;
    const bootstrapReapplyIntervalId = setInterval(() => {
        forceMemorySavingOffEverywhere();
    }, BOOTSTRAP_REAPPLY_INTERVAL_MS);

    setTimeout(() => {
        clearInterval(bootstrapReapplyIntervalId);
    }, BOOTSTRAP_REAPPLY_DURATION_MS);

    // Re-apply when the app navigates or resumes.
    window.addEventListener('hashchange', forceMemorySavingOffEverywhere);
    window.addEventListener('focus', forceMemorySavingOffEverywhere);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            forceMemorySavingOffEverywhere();
        }
    });
})();
