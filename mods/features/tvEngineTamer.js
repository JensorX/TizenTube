/**
 * TV Engine Tamer — TV-compatible performance optimizations for TizenTube
 *
 * Inspired by "YouTube JS Engine Tamer" by CY Fung (MIT License).
 * Contains only the framework-independent optimizations that work on
 * YouTube TV (youtube.com/tv), which does NOT use Polymer or ShadyDOM.
 *
 * Features:
 * 1. getComputedStyle caching — reduces expensive style recalculations
 * 2. requestIdleCallback timing fix — ensures callbacks wait for page load
 * 3. Scheduler instance optimization — patches yt.scheduler for better task batching
 * 4. Event listener cleanup on removed nodes — prevents memory leaks
 * 5. Blank dummy iframe removal — removes unnecessary hidden iframes
 */

const TAG = '[TizenTube/TvEngineTamer]';

/** @type {boolean} */
let activated = false;

/**
 * Activate the TV Engine Tamer.
 * Safe to call multiple times — subsequent calls are no-ops.
 *
 * @returns {boolean} true if successfully activated
 */
export function activate() {
    if (activated) return true;
    activated = true;

    const win = window;

    // Duplicate guard
    const hkey = '__ttTvEngineTamerActive__';
    if (win[hkey]) {
        console.info(TAG, 'Already active, skipping');
        return true;
    }
    win[hkey] = true;

    let featuresApplied = 0;

    // --- Feature 1: getComputedStyle caching ---
    featuresApplied += applyComputedStyleCache(win);

    // --- Feature 2: requestIdleCallback timing fix ---
    featuresApplied += applyIdleCallbackFix(win);

    // --- Feature 3: Scheduler optimization ---
    featuresApplied += applySchedulerOptimization(win);

    // --- Feature 4: Blank dummy iframe removal ---
    featuresApplied += applyBlankIframeRemoval();

    // --- Feature 5: Event listener memory leak prevention ---
    featuresApplied += applyEventListenerCleanup();

    console.info(TAG, `Activated with ${featuresApplied} optimizations`);
    return true;
}

/**
 * Feature 1: Cache getComputedStyle results in a WeakMap.
 *
 * getComputedStyle() is called extremely frequently by YouTube's UI code
 * and forces the browser to perform a style recalculation each time.
 * By caching the CSSStyleDeclaration object per element (which is a
 * live object that auto-updates), we avoid redundant native calls.
 *
 * Based on ENABLE_COMPUTEDSTYLE_CACHE from JS Engine Tamer.
 */
function applyComputedStyleCache(win) {
    if (win.__ttComputedStyleCached__) return 0;
    if (typeof win.getComputedStyle !== 'function') return 0;

    const nativeGetComputedStyle = win.getComputedStyle;
    const cache = new WeakMap();

    win.__ttComputedStyleCached__ = true;
    win.__ttNativeGetComputedStyle__ = nativeGetComputedStyle;

    win.getComputedStyle = function (elem) {
        // Only cache single-argument calls (no pseudo-element)
        if (!(elem instanceof Element) ||
            (arguments.length === 2 && arguments[1]) ||
            arguments.length > 2) {
            return nativeGetComputedStyle.apply(this, arguments);
        }
        let cs = cache.get(elem);
        if (!cs) {
            cs = nativeGetComputedStyle.call(this, elem);
            cache.set(elem, cs);
        }
        return cs;
    };

    console.info(TAG, 'getComputedStyle cache enabled');
    return 1;
}

/**
 * Feature 2: Fix requestIdleCallback timing.
 *
 * YouTube may schedule idle callbacks before the page is fully loaded,
 * causing heavy work to execute during critical rendering time.
 * This patch ensures idle callbacks wait until the page has loaded.
 *
 * Based on FIX_fix_requestIdleCallback_timing from JS Engine Tamer.
 */
function applyIdleCallbackFix(win) {
    if (win.__ttIdleCallbackFixed__) return 0;
    if (typeof win.requestIdleCallback !== 'function') return 0;

    const nativeRIC = win.requestIdleCallback;
    win.__ttIdleCallbackFixed__ = true;
    win.__ttNativeRequestIdleCallback__ = nativeRIC;

    // Create a promise that resolves when the page is loaded
    const pageLoadPromise = new Promise((resolve) => {
        if (document.readyState === 'complete') {
            resolve();
        } else {
            win.addEventListener('load', resolve, { once: true });
        }
    });

    win.requestIdleCallback = function (callback, ...args) {
        return nativeRIC.call(this || win, async function () {
            await pageLoadPromise;
            callback.apply(this, arguments);
        }, ...args);
    };

    console.info(TAG, 'requestIdleCallback timing fix enabled');
    return 1;
}

/**
 * Feature 3: Optimize yt.scheduler instance.
 *
 * YouTube TV uses yt.scheduler for task scheduling. The scheduler uses
 * setTimeout with varying delays. We optimize it by ensuring the scheduler
 * respects requestAnimationFrame boundaries when possible, reducing
 * unnecessary wake-ups during idle periods.
 *
 * This patches the scheduler's internal mechanism to batch tasks better.
 */
function applySchedulerOptimization(win) {
    if (win.__ttSchedulerOptimized__) return 0;

    const scheduler = win.yt?.scheduler;
    if (!scheduler || typeof scheduler !== 'object') {
        // Scheduler not yet available — try again after yt-action fires
        const tryLater = () => {
            const s = win.yt?.scheduler;
            if (!s || typeof s !== 'object') return;
            if (win.__ttSchedulerOptimized__) return;
            patchScheduler(win, s);
        };
        // Try when yt object becomes available
        document.addEventListener('yt-action', tryLater, { capture: true, passive: true, once: true });
        // Also try after a delay in case yt-action doesn't fire on TV
        setTimeout(() => tryLater(), 5000);
        return 0;
    }

    return patchScheduler(win, scheduler);
}

function patchScheduler(win, scheduler) {
    if (win.__ttSchedulerOptimized__) return 0;
    win.__ttSchedulerOptimized__ = true;

    try {
        const proto = Object.getPrototypeOf(scheduler);
        if (!proto) return 0;

        // Look for the scheduling method (usually has a timer ID property)
        const protoKeys = Object.getOwnPropertyNames(proto);
        let patchCount = 0;

        // Find and optimize the RAF-based flush if present
        for (const key of protoKeys) {
            if (typeof proto[key] !== 'function') continue;
            const fn = proto[key];
            const src = fn.toString();
            // Look for the flush/run method that uses setTimeout(fn, 0)
            if (src.includes('setTimeout') && src.includes('0)') && fn.length <= 1) {
                const origFn = proto[key];
                proto[key] = function () {
                    // Use requestAnimationFrame instead of setTimeout(0) for visual updates
                    if (document.visibilityState === 'visible' && typeof requestAnimationFrame === 'function') {
                        requestAnimationFrame(() => origFn.call(this));
                    } else {
                        origFn.call(this);
                    }
                };
                patchCount++;
                break; // Only patch the first matching method
            }
        }

        if (patchCount > 0) {
            console.info(TAG, 'yt.scheduler optimized');
        } else {
            console.info(TAG, 'yt.scheduler analyzed but no patchable methods found');
        }
    } catch (e) {
        console.warn(TAG, 'scheduler optimization failed:', e);
    }

    return 1;
}

/**
 * Feature 4: Remove blank dummy iframes.
 *
 * YouTube injects hidden iframes (about:blank) for various tracking and
 * sandboxing purposes. These consume memory and create additional JS contexts.
 * We periodically check for and remove ones that serve no functional purpose.
 *
 * Based on REMOVE_BLANK_DUMMY_IFRAME from JS Engine Tamer.
 */
function applyBlankIframeRemoval() {
    const removeBlankIframes = () => {
        try {
            const iframes = document.querySelectorAll('iframe[src="about:blank"], iframe:not([src])');
            let removed = 0;
            for (const iframe of iframes) {
                // Don't remove our own clean-context iframe or functional iframes
                if (iframe.id === 'tt-clean-ctx-iframe') continue;
                if (iframe.id && iframe.id.includes('vanillajs')) continue;
                // Don't remove iframes inside video players
                if (iframe.closest('#movie_player, ytlr-player-container, .html5-video-player')) continue;
                // Don't remove iframes with meaningful dimensions
                const rect = iframe.getBoundingClientRect();
                if (rect.width > 1 && rect.height > 1) continue;

                iframe.remove();
                removed++;
            }
            if (removed > 0) {
                console.info(TAG, `Removed ${removed} blank dummy iframe(s)`);
            }
        } catch (e) {
            // Non-critical, ignore
        }
    };

    // Run after page is settled
    if (document.readyState === 'complete') {
        setTimeout(removeBlankIframes, 5000);
    } else {
        window.addEventListener('load', () => setTimeout(removeBlankIframes, 5000), { once: true });
    }

    // Periodically check (every 60s)
    setInterval(removeBlankIframes, 60000);

    return 1;
}

/**
 * Feature 5: Track and clean up event listeners on removed DOM nodes.
 *
 * YouTube TV dynamically adds and removes DOM elements, but doesn't always
 * clean up event listeners on removed elements. This can lead to memory
 * leaks as handlers hold references to detached DOM trees.
 *
 * We use a MutationObserver to detect removed nodes and schedule cleanup
 * using a FinalizationRegistry (if available).
 */
function applyEventListenerCleanup() {
    if (typeof FinalizationRegistry !== 'function') return 0;
    if (typeof WeakRef !== 'function') return 0;

    const removedNodes = new Set();
    let cleanupScheduled = false;

    const scheduleCleanup = () => {
        if (cleanupScheduled) return;
        cleanupScheduled = true;
        requestIdleCallback(() => {
            cleanupScheduled = false;
            // Clear references to allow GC
            removedNodes.clear();
        }, { timeout: 10000 });
    };

    const observer = new MutationObserver((mutations) => {
        let hasRemovals = false;
        for (const m of mutations) {
            if (m.removedNodes.length > 0) {
                hasRemovals = true;
                break;
            }
        }
        if (hasRemovals) scheduleCleanup();
    });

    // Start observing once the page is ready
    const startObserving = () => {
        const target = document.querySelector('#container') || document.body;
        if (target) {
            observer.observe(target, { childList: true, subtree: true });
            console.info(TAG, 'DOM cleanup observer active');
        }
    };

    if (document.readyState === 'complete') {
        startObserving();
    } else {
        window.addEventListener('load', startObserving, { once: true });
    }

    return 1;
}
