/**
 * CPU Tamer for YouTube TV — adapted for TizenTube
 *
 * Based on "YouTube CPU Tamer by AnimationFrame" by CY Fung
 * Original: https://greasyfork.org/scripts/431573
 * License: MIT
 *
 * Reduces CPU usage during YouTube video playback by throttling
 * setTimeout / setInterval calls through requestAnimationFrame batching.
 * When a video is actively playing, rapid timer callbacks are grouped
 * together so they only fire once per animation frame, significantly
 * reducing CPU wake-ups.
 *
 * TV-specific adaptations:
 * - GPU acceleration check removed (irrelevant for timer throttling)
 * - Robust iframe fallback for Tizen WebView environments
 * - No top-frame access (Tizen security restrictions)
 * - Trusted Types compatible (no innerHTML usage)
 */

const TAG = '[TizenTube/CpuTamer]';

/** @type {boolean} */
let activated = false;

/**
 * Activate the CPU Tamer.
 * Safe to call multiple times — subsequent calls are no-ops.
 *
 * @returns {Promise<boolean>} true if successfully activated
 */
export async function activate() {
    if (activated) return true;
    activated = true;

    const win = window;

    // Duplicate guard — another instance may have patched already
    const hkey = '__ttCpuTamerActive__';
    if (win[hkey]) {
        console.info(TAG, 'Already active, skipping');
        return true;
    }
    win[hkey] = true;

    // --- Promise helper (safe against YouTube's Promise hacks) ---
    /** @type {PromiseConstructor} */
    const NativePromise = (async () => {})().constructor;
    const PromiseExternal = (() => {
        let resolve_, reject_;
        const h = (resolve, reject) => { resolve_ = resolve; reject_ = reject; };
        return class PromiseExternal extends NativePromise {
            constructor(cb = h) {
                super(cb);
                if (cb === h) {
                    this.resolve = resolve_;
                    this.reject = reject_;
                }
            }
        };
    })();

    // --- Video playback tracker ---
    // Tracks when the last <video> timeupdate event fired.
    // Used to determine whether a video is actively playing.
    win.__ttCpuTamerLastTimeupdate__ = 1;
    document.addEventListener('timeupdate', () => {
        win.__ttCpuTamerLastTimeupdate__ = Date.now();
    }, true);
    const timeupdateDT = () => win.__ttCpuTamerLastTimeupdate__;

    // --- Obtain clean (unpatched) timer functions ---
    const nativeTimers = await obtainCleanTimers(win, NativePromise);
    if (!nativeTimers) {
        console.warn(TAG, 'Failed to obtain clean timers, using current window timers as fallback');
        activated = false;
        win[hkey] = false;
        return false;
    }

    const { requestAnimationFrame, setTimeout, setInterval, clearTimeout, clearInterval } = nativeTimers;

    // --- rAF helper ---
    // Uses CSS animation iteration as a frame tick if available,
    // falls back to requestAnimationFrame directly.
    let afInterupter = null;

    const rafPN = (() => {
        const asc = document.createElement('a-f');
        if (!('onanimationiteration' in asc)) {
            return (resolve) => requestAnimationFrame(afInterupter = resolve);
        }
        asc.id = 'tt-a-f';
        let qr = null;
        asc.onanimationiteration = function () {
            if (qr !== null) qr = (qr(), null);
        };
        if (!document.getElementById('tt-afscript')) {
            const style = document.createElement('style');
            style.id = 'tt-afscript';
            style.textContent = [
                '@keyframes ttAF1{0%{order:0}100%{order:1}}',
                '#tt-a-f[id]{visibility:collapse!important;position:fixed!important;',
                'display:block!important;top:-100px!important;left:-100px!important;',
                'margin:0!important;padding:0!important;outline:0!important;border:0!important;',
                'z-index:-1!important;width:0!important;height:0!important;',
                'contain:strict!important;pointer-events:none!important;',
                'animation:1ms steps(2,jump-none) 0ms infinite alternate forwards running ttAF1!important}'
            ].join('');
            (document.head || document.documentElement).appendChild(style);
        }
        document.documentElement.insertBefore(asc, document.documentElement.firstChild);
        return (resolve) => (qr = afInterupter = resolve);
    })();

    // --- Core timer patching logic ---
    (() => {
        let afPromiseP, afPromiseQ;
        afPromiseP = afPromiseQ = { resolved: true };
        let afix = 0;

        const afResolve = async (rX) => {
            await new NativePromise(rafPN);
            rX.resolved = true;
            const t = afix = (afix & 1073741823) + 1;
            return rX.resolve(t), t;
        };

        const eFunc = async () => {
            const uP = !afPromiseP.resolved ? afPromiseP : null;
            const uQ = !afPromiseQ.resolved ? afPromiseQ : null;
            let t = 0;
            if (uP && uQ) {
                const t1 = await uP;
                const t2 = await uQ;
                t = ((t1 - t2) & 536870912) === 0 ? t1 : t2;
            } else {
                const vP = !uP ? (afPromiseP = new PromiseExternal()) : null;
                const vQ = !uQ ? (afPromiseQ = new PromiseExternal()) : null;
                if (uQ) await uQ; else if (uP) await uP;
                if (vP) t = await afResolve(vP);
                if (vQ) t = await afResolve(vQ);
            }
            return t;
        };

        const inExec = new Set();

        const wFunc = async (handler, wStore) => {
            try {
                const ct = Date.now();
                // Throttle only when video is playing (timeupdate within 800ms)
                // AND timer was set recently (within 800ms of a previous call)
                if (ct - timeupdateDT() < 800 && ct - wStore.dt < 800) {
                    const cid = wStore.cid;
                    inExec.add(cid);
                    const t = await eFunc();
                    const didNotRemove = inExec.delete(cid);
                    if (!didNotRemove || t === wStore.lastExecution) return;
                    wStore.lastExecution = t;
                }
                wStore.dt = ct;
                handler();
            } catch (e) {
                console.error(TAG, e);
                throw e;
            }
        };

        const sFunc = (propFunc) => {
            return (func, ms = 0, ...args) => {
                if (typeof func === 'function') {
                    const wStore = { dt: Date.now() };
                    return (wStore.cid = propFunc(
                        wFunc, ms,
                        (args.length > 0 ? func.bind(null, ...args) : func),
                        wStore
                    ));
                } else {
                    return propFunc(func, ms, ...args);
                }
            };
        };

        win.setTimeout = sFunc(setTimeout);
        win.setInterval = sFunc(setInterval);

        const dFunc = (propFunc) => {
            return (cid) => {
                if (cid) inExec.delete(cid) || propFunc(cid);
            };
        };

        win.clearTimeout = dFunc(clearTimeout);
        win.clearInterval = dFunc(clearInterval);

        // Preserve native toString representations
        try {
            win.setTimeout.toString = setTimeout.toString.bind(setTimeout);
            win.setInterval.toString = setInterval.toString.bind(setInterval);
            win.clearTimeout.toString = clearTimeout.toString.bind(clearTimeout);
            win.clearInterval.toString = clearInterval.toString.bind(clearInterval);
        } catch (e) { /* non-critical */ }
    })();

    // --- Safety interrupter ---
    // Ensures rAF callbacks don't get stuck if the page becomes hidden
    let mInterupter = null;
    setInterval(() => {
        if (mInterupter === afInterupter) {
            if (mInterupter !== null) afInterupter = mInterupter = (mInterupter(), null);
        } else {
            mInterupter = afInterupter;
        }
    }, 125);

    console.info(TAG, 'Activated successfully');
    return true;
}

/**
 * Attempt to obtain clean (unpatched) browser timer functions
 * by extracting them from a sandboxed iframe's contentWindow.
 * Falls back to the current window's timers if iframe creation fails.
 */
async function obtainCleanTimers(win, NativePromise) {
    const waitFn = requestAnimationFrame;
    try {
        let mx = 16;
        const frameId = 'tt-clean-ctx-iframe';
        let frame = document.getElementById(frameId);
        let removeIframeFn = null;

        if (!frame) {
            frame = document.createElement('iframe');
            frame.id = frameId;
            frame.sandbox = 'allow-same-origin';
            // Wrap in <noscript> to avoid layout reflow
            const n = document.createElement('noscript');
            n.appendChild(frame);

            while (!document.documentElement && mx-- > 0) {
                await new NativePromise(waitFn);
            }
            const root = document.documentElement;
            if (!root) throw new Error('documentElement not available');
            root.appendChild(n);

            removeIframeFn = (st) => {
                const doRemove = () => {
                    try { n.remove(); } catch (_) {}
                };
                if (!st || document.readyState !== 'loading') {
                    doRemove();
                } else {
                    st(() => doRemove(), 200);
                }
            };
        }

        while (!frame.contentWindow && mx-- > 0) {
            await new NativePromise(waitFn);
        }

        const fc = frame.contentWindow;
        if (!fc) throw new Error('iframe contentWindow not accessible');

        try {
            const res = {
                requestAnimationFrame: fc.requestAnimationFrame.bind(win),
                setInterval: fc.setInterval.bind(win),
                setTimeout: fc.setTimeout.bind(win),
                clearInterval: fc.clearInterval.bind(win),
                clearTimeout: fc.clearTimeout.bind(win)
            };
            if (removeIframeFn) {
                NativePromise.resolve(res.setTimeout).then(removeIframeFn);
            }
            console.info(TAG, 'Obtained clean timers from iframe');
            return res;
        } catch (e) {
            if (removeIframeFn) removeIframeFn();
            throw e;
        }
    } catch (e) {
        console.warn(TAG, 'iframe method failed, using fallback timers:', e.message || e);
        // Fallback: use the current window's timers directly.
        // This still works — the throttling logic itself provides the benefit,
        // the iframe is just an extra safety measure to get unmodified timers.
        return {
            requestAnimationFrame: requestAnimationFrame.bind(win),
            setInterval: setInterval.bind(win),
            setTimeout: setTimeout.bind(win),
            clearInterval: clearInterval.bind(win),
            clearTimeout: clearTimeout.bind(win)
        };
    }
}
