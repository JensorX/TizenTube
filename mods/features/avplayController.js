/**
 * Wrapper for Samsung AVPlay API
 * Provides HTML5-like interface for the native player
 */

export class AVPlayController {
    constructor() {
        this.player = null;
        this.state = 'NONE'; // NONE, IDLE, READY, PLAYING, PAUSED
        this.listeners = {};
        this.isSupported = typeof webapis !== 'undefined' && typeof webapis.avplay !== 'undefined';
    }

    init() {
        if (!this.isSupported) {
            console.warn('[AVPlay] Native API not available');
            return false;
        }
        return true;
    }

    async open(url) {
        if (!this.isSupported) return;

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
                webapis.avplay.prepareAsync(() => {
                    this.state = 'READY';
                    resolve();
                }, (err) => {
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
