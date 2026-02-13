/**
 * Wrapper for Samsung AVPlay API
 * Provides HTML5-like interface for the native player
 */

export class AVPlayController {
    constructor() {
        this.player = null;
        this.state = 'NONE'; // NONE, IDLE, READY, PLAYING, PAUSED
        this.listeners = {};
        this.isSupported = false;
        this.injectionPromise = null;
        // Optimization: check immediately but don't finalize isSupported until init/injection
    }

    init() {
        // 1. Check current window
        if (typeof webapis !== 'undefined' && typeof webapis.avplay !== 'undefined') {
            this.isSupported = true;
            console.log('[AVPlay] Native API found in current window.');
            return true;
        }

        // 2. Check parent window (if in iframe/module)
        try {
            if (window.parent && window.parent.webapis && window.parent.webapis.avplay) {
                this.isSupported = true;
                window.webapis = window.parent.webapis; // Alias for easier usage
                console.log('[AVPlay] Native API found in parent window. Aliased.');
                return true;
            }
        } catch (e) {
            console.warn('[AVPlay] Parent window access failed:', e);
        }

        // 3. Not found, try to inject
        console.warn('[AVPlay] webapis not found. Attempting to inject script...');
        this.injectWebAPIs();
        return false;
    }

    injectWebAPIs() {
        if (this.injectionPromise) return;

        this.injectionPromise = new Promise((resolve) => {
            const checkAndResolve = () => {
                if (typeof webapis !== 'undefined' && typeof webapis.avplay !== 'undefined') {
                    this.isSupported = true;
                    console.log('[AVPlay] webapis.avplay detected!');
                    resolve(true);
                    return true;
                }
                return false;
            };

            if (checkAndResolve()) return;

            console.log('[AVPlay] Waiting for webapis injection...');

            // Poll for webapis (in case CDP injection is slow)
            let attempts = 0;
            const maxAttempts = 20; // 10 seconds

            const poll = setInterval(() => {
                attempts++;
                if (checkAndResolve()) {
                    clearInterval(poll);
                    return;
                }

                if (attempts >= maxAttempts) {
                    clearInterval(poll);
                    console.error('[AVPlay] WebAPIs not found after waiting.');

                    // Final fallback: try standard macro injection
                    console.log('[AVPlay] Trying fallback injection...');
                    const d = document.createElement('script');
                    d.src = '$WEBAPIS/webapis/webapis.js';
                    d.onload = () => checkAndResolve() || resolve(false);
                    d.onerror = () => resolve(false);
                    document.head.appendChild(d);
                }
            }, 500);
        });
    }

    async open(url) {
        // Wait for injection if it's in progress
        if (this.injectionPromise) {
            console.log('[AVPlay] Waiting for injection to complete...');
            try {
                // Race injection against a 3s timeout
                const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Injection Timeout')), 3000));
                await Promise.race([this.injectionPromise, timeout]);
            } catch (e) {
                console.error('[AVPlay] Injection failed or timed out:', e);
                showToast('Injection failed or timed out');
                // If it timed out, we might still proceed to check manually if it magically appeared
            }
        }

        // Re-check support
        if (!this.isSupported) {
            if (typeof webapis !== 'undefined' && typeof webapis.avplay !== 'undefined') {
                this.isSupported = true;
            }
        }

        if (!this.isSupported) {
            console.error('[AVPlay] Cannot open: API not supported or not loaded');
            throw new Error('Native API (webapis) missing. Is this a Tizen TV?');
        }

        try {
            if (this.state !== 'NONE') {
                this.close();
            }

            console.log('[AVPlay] Opening URL:', url);
            webapis.avplay.open(url);
            this.state = 'IDLE';

            // Set display area (initially hidden or full screen depending on UI state)
            // We'll update this later based on the YouTube player size
            webapis.avplay.setDisplayRect(0, 0, 1920, 1080);
            webapis.avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX');

            // Prepare async
            await new Promise((resolve, reject) => {
                const listener = {
                    onbufferingstart: () => {
                        console.log('[AVPlay] Buffering start');
                        this._emit('bufferingStart');
                    },
                    onbufferingprogress: (percent) => {
                        // console.log('[AVPlay] Buffering:', percent);
                    },
                    onbufferingcomplete: () => {
                        console.log('[AVPlay] Buffering complete');
                        this._emit('bufferingComplete');
                    },
                    onstreamcompleted: () => {
                        console.log('[AVPlay] Stream complete');
                        this._emit('ended');
                        this.stop();
                    },
                    oncurrentplaytime: (currentTime) => {
                        this._emit('timeupdate', currentTime);
                    },
                    onerror: (error) => {
                        console.error('[AVPlay] Error:', error);
                        this._emit('error', error);
                        reject(error);
                    }
                };

                webapis.avplay.setListener(listener);
                console.log('[AVPlay] Calling prepareAsync...');

                let isFinalized = false;
                const prepareTimeout = setTimeout(() => {
                    if (!isFinalized) {
                        isFinalized = true;
                        console.error('[AVPlay] prepareAsync timed out after 5s');
                        reject(new Error('Prepare Timeout (5s)'));
                    }
                }, 5000);

                webapis.avplay.prepareAsync(() => {
                    if (isFinalized) return;
                    isFinalized = true;
                    clearTimeout(prepareTimeout);
                    console.log('[AVPlay] prepareAsync success');
                    this.state = 'READY';
                    resolve();
                }, (err) => {
                    if (isFinalized) return;
                    isFinalized = true;
                    clearTimeout(prepareTimeout);
                    console.error('[AVPlay] prepareAsync failed:', err);
                    reject(err);
                });
            });

        } catch (e) {
            console.error('[AVPlay] Open failed:', e);
            this.state = 'NONE';
            throw e;
        }
    }

    play() {
        if (this.state === 'READY' || this.state === 'PAUSED') {
            webapis.avplay.play();
            this.state = 'PLAYING';
        }
    }

    pause() {
        if (this.state === 'PLAYING') {
            webapis.avplay.pause();
            this.state = 'PAUSED';
        }
    }

    stop() {
        if (this.state !== 'NONE') {
            try {
                webapis.avplay.stop();
            } catch (e) { }
            this.state = 'IDLE'; // Or NONE? Logic says IDLE after stop usually
        }
    }

    close() {
        if (this.state !== 'NONE') {
            try {
                webapis.avplay.close();
            } catch (e) { }
            this.state = 'NONE';
        }
    }

    seekTo(ms) {
        if (this.state === 'PLAYING' || this.state === 'PAUSED' || this.state === 'READY') {
            webapis.avplay.seekTo(ms);
        }
    }

    setDisplayRect(x, y, w, h) {
        if (this.state !== 'NONE') {
            // Ensure integers
            webapis.avplay.setDisplayRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
        }
    }

    on(event, callback) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    }

    _emit(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(cb => cb(data));
        }
    }
}
