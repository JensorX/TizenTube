import { configRead, configChangeEmitter } from '../config.js';
import { AVPlayController } from './avplayController.js';
import { createDashManifest } from './dashManifestGenerator.js';
import { showToast } from '../ui/ytUI.js';

class HybridPlayer {
    constructor() {
        this.avplay = new AVPlayController();
        this.html5Player = null;
        this.videoElement = null;
        this.currentVideoId = null;
        this.isAVPlayActive = false;
        this.syncInterval = null;
        this.lastTime = 0;
    }

    init() {
        // Initial config check
        const enabled = configRead('enableAVPlay');
        console.log('[HybridPlayer] Init. enableAVPlay:', enabled);
        if (enabled) {
            showToast('TizenTube', 'HybridPlayer Initialized');
        }


        // Try AVPlay init (might be async injection)
        const avPlayInitResult = this.avplay.init();
        if (!avPlayInitResult) {
            console.warn('[HybridPlayer] AVPlay init pending (injection?) or failed. Continuing attachment anyway...');
            showToast('TizenTube', 'AVPlay init pending (injection?) or failed. Continuing attachment anyway...');
        }

        // Wait for player element
        const checkForPlayer = setInterval(() => {
            this.html5Player = document.querySelector('.html5-video-player');
            this.videoElement = document.querySelector('video');
            if (this.html5Player && this.videoElement) {
                clearInterval(checkForPlayer);
                this.attachListeners();
                console.log('[HybridPlayer] Initialized and listeners attached');

                // If we are already on a watch page, trigger navigation logic immediately
                if (location.pathname.includes('/watch') || (location.hash && location.hash.includes('/watch')) || (location.hash && location.hash.includes('?v='))) {
                    console.log('[HybridPlayer] Already on watch page, triggering start...');
                    showToast('TizenTube', 'Already on watch page, triggering start...');
                    this.handleNavigation();
                }
            }
        }, 500);
    }

    attachListeners() {
        // Use 'yt-navigate-finish' for video changes
        window.addEventListener('yt-navigate-finish', () => this.handleNavigation());

        // Use 'hashchange' as backup (common in TV UIs / Cobalt)
        window.addEventListener('hashchange', () => this.handleNavigation());

        // Monitor playback state via existing player API if possible, or video events
        // TizenTube often hooks into 'onStateChange' on the player element
        if (this.html5Player.addEventListener) {
            this.html5Player.addEventListener('onStateChange', (e) => this.handleStateChange(e));
        }

        // Listen to config changes
        configChangeEmitter.addEventListener('configChange', (e) => this.handleConfigChange(e));
    }

    handleConfigChange(e) {
        if (e.detail.key === 'enableAVPlay') {
            const enabled = e.detail.value;
            console.log('[HybridPlayer] Config changed. enableAVPlay:', enabled);

            if (enabled) {
                showToast('TizenTube', 'Native Player Enabled');
                // If on watch page, try to start immediately
                // Simple check for "watch" in URL or Hash
                if (location.pathname.includes('/watch') || (location.hash && location.hash.includes('/watch')) || (location.hash && location.hash.includes('?v='))) {
                    this.handleNavigation();
                }
            } else {
                showToast('TizenTube', 'Native Player Disabled');
                this.stopAVPlay();
            }
        }
    }

    handleNavigation() {
        // Check if we are on a watch page (Path or Hash)
        const isWatchPath = location.pathname.startsWith('/watch');
        // Check hash like #/watch?v=... or just plain query mechanism if path is /
        const isWatchHash = location.hash && (location.hash.includes('/watch') || location.hash.includes('?v='));

        console.log(`[HybridPlayer] handleNavigation. Path: ${location.pathname}, Hash: ${location.hash}`);

        if (!isWatchPath && !isWatchHash) {
            this.stopAVPlay();
            return;
        }

        // Check for video ID match
        const videoId = this.getVideoId();
        if (videoId && videoId !== this.currentVideoId) {
            console.log(`[HybridPlayer] Video changed: ${this.currentVideoId} -> ${videoId}`);
            showToast('TizenTube', `Video Detected: ${videoId}`);
            this.currentVideoId = videoId;
            // Stop previous playback
            this.stopAVPlay();
            // Start new playback attempt
            // Slight delay to allow adblock.js to populate window.__avplayStreamData
            setTimeout(() => this.attemptStartAVPlay(), 1000);
        }
    }

    handleStateChange(event) {
        // event.detail is usually the state integer: -1 (unstarted), 0 (ended), 1 (playing), 2 (paused), 3 (buffering), 5 (cued)
        // Adjust for specific implementations if needed.
        if (!this.isAVPlayActive) return;

        const state = event.detail; // OR use player.getPlayerState()

        if (state === 1) { // Playing
            this.avplay.play();
        } else if (state === 2) { // Paused
            this.avplay.pause();
        } else if (state === 0) { // Ended
            this.stopAVPlay();
        }
    }

    async attemptStartAVPlay() {
        try {
            const enabled = configRead('enableAVPlay');
            console.log('[HybridPlayer] attemptStartAVPlay. Enabled:', enabled);
            if (!enabled) {
                // showToast('TizenTube', 'AVPlay Disabled');
                return;
            }

            const streamData = window.__avplayStreamData;
            console.log('[HybridPlayer] StreamData exists:', !!streamData);

            if (!streamData) {
                console.warn('[HybridPlayer] No stream data immediately available. Polling...');
                showToast('TizenTube', 'AVPlay: Waiting for Stream Data...');
                // Poll for up to 5 seconds
                let attempts = 0;
                const pollInterval = setInterval(async () => { // Made async to allow await
                    attempts++;
                    if (window.__avplayStreamData) {
                        clearInterval(pollInterval);
                        console.log(`[HybridPlayer] Stream data found after ${attempts} attempts.`);
                        showToast('TizenTube', 'AVPlay: Stream Data Found');
                        await this.startAVPlayWithData(window.__avplayStreamData);
                    } else if (attempts > 10) { // 5 seconds (500ms * 10)
                        clearInterval(pollInterval);
                        console.warn('[HybridPlayer] Timed out waiting for stream data.');
                        showToast('TizenTube', 'AVPlay: Stream Data Timeout');
                    }
                }, 500);
                return;
            }

            // Immediate start
            showToast('TizenTube', 'AVPlay: Starting player...');
            this.startAVPlayWithData(streamData);
        } catch (err) {
            console.error('[HybridPlayer] attemptStartAVPlay crash:', err);
            showToast('TizenTube', `AVPlay Crash: ${err.message}`);
        }
    }

    async startAVPlayWithData(streamData) {
        try {
            if (!streamData.adaptiveFormats) {
                showToast('TizenTube', 'AVPlay: No stream formats found');
                return;
            }

            console.log('[HybridPlayer] Selection Phase...');
            showToast('TizenTube', 'AVPlay: Selecting Streams...');

            // 1. Select Best Streams (Video + Audio)
            const bestVideo = this.selectBestVideoStream(streamData.adaptiveFormats);
            const bestAudio = this.selectBestAudioStream(streamData.adaptiveFormats);

            if (!bestVideo || !bestAudio) {
                console.error('[HybridPlayer] No suitable streams found');
                showToast('TizenTube', 'AVPlay: No suitable streams found');
                return;
            }

            console.log(`[HybridPlayer] Manifest Phase: Video=${bestVideo.height}p, Audio=${bestAudio.bitrate}`);
            showToast('TizenTube', 'AVPlay: Generating Manifest...');

            // 2. Generate Local DASH Manifest
            const manifestUrl = createDashManifest(bestVideo, bestAudio);
            if (!manifestUrl) {
                console.error('[HybridPlayer] Manifest generation failed');
                showToast('TizenTube', 'AVPlay: Manifest Gen Failed');
                return;
            }

            // 3. Prepare HTML5 Player (Mute & Hide to save resources)
            this.videoElement.muted = true;
            this.videoElement.style.opacity = '0';
            this.videoElement.style.visibility = 'hidden';

            this.html5Player.style.background = 'transparent';
            const playerApi = document.getElementById('player-api');
            if (playerApi) playerApi.style.background = 'transparent';
            this.videoElement.style.background = 'transparent';

            // 4. Start AVPlay
            console.log('[HybridPlayer] Opening AVPlay...');
            showToast('TizenTube', 'AVPlay: Opening Native Player...');

            // Wake up Video Layer
            if (typeof tizen !== 'undefined' && tizen.tvwindow) {
                try {
                    tizen.tvwindow.setSource({ type: 'TV', number: 1 },
                        () => console.log('[HybridPlayer] tvwindow source set'),
                        (e) => console.error('[HybridPlayer] tvwindow error', e));
                } catch (err) { }
            }

            await this.avplay.open(manifestUrl);
            showToast('TizenTube', 'AVPlay: Ready. Syncing...');

            this.avplay.play();
            this.isAVPlayActive = true;

            const startTime = this.videoElement.currentTime * 1000;
            if (startTime > 0) this.avplay.seekTo(startTime);

            showToast('TizenTube', 'Native Player (AVPlay) Active');
            this.videoElement.play();
            this.startSyncLoop();

            if (window.__ttSubtlePlaybackSync) {
                window.__ttSubtlePlaybackSync.stop();
                window.__ttSubtlePlaybackSync.enabled = false;
            }
        } catch (e) {
            console.error('[HybridPlayer] AVPlay start failed:', e);
            showToast('TizenTube', `AVPlay Failed: ${e.message || e}`);
            this.restoreHTML5();
        }
    }

    stopAVPlay() {
        if (this.isAVPlayActive) {
            this.avplay.stop();
            this.avplay.close();
            this.isAVPlayActive = false;
            if (this.syncInterval) clearInterval(this.syncInterval);
            this.restoreHTML5();

            // Re-enable SubtlePlaybackSync
            if (window.__ttSubtlePlaybackSync) {
                // Restore original drift sync
                window.__ttSubtlePlaybackSync.enabled = configRead('enableCpuStressOptimization');
                window.__ttSubtlePlaybackSync.start();
                console.log('[HybridPlayer] Re-enabling SubtlePlaybackSync');
            }
        }
    }

    restoreHTML5() {
        if (this.videoElement) {
            this.videoElement.muted = false;
            this.videoElement.style.opacity = '';
            this.videoElement.style.background = '';
        }
        if (this.html5Player) {
            this.html5Player.style.background = '';
        }
        const playerApi = document.getElementById('player-api');
        if (playerApi) playerApi.style.background = '';
    }

    startSyncLoop() {
        let lastSyncTime = 0;
        const SYNC_COOLDOWN = 2000; // 2s cooldown
        const SYNC_THRESHOLD = 2500; // 2.5s drift triggers sync

        this.syncInterval = setInterval(() => {
            if (!this.isAVPlayActive) return;

            const html5Time = this.videoElement.currentTime * 1000;
            const now = Date.now();

            if (now - lastSyncTime < SYNC_COOLDOWN) {
                this.lastTime = html5Time;
                return;
            }

            const diff = Math.abs(html5Time - this.lastTime);

            // Only sync on large jumps (Seek)
            if (diff > SYNC_THRESHOLD) {
                console.log(`[HybridPlayer] Sync trigger: diff=${diff}ms. Seek AVPlay -> ${html5Time}ms`);
                this.avplay.seekTo(html5Time);
                lastSyncTime = now;
            }
            this.lastTime = html5Time;

        }, 1000);
    }

    selectBestVideoStream(formats) {
        // Implement logic to pick based on configRead('preferredVideoQuality') or max
        // For now, pick max resolution video/mp4 or webm that AVPlay supports
        // Tizen supports VP9 and H264. VP9 (webm) usually higher res.

        const videoFormats = formats.filter(f => f.mimeType.startsWith('video/'));
        // Sort: Height DESC, Bitrate DESC
        videoFormats.sort((a, b) => b.height - a.height || b.bitrate - a.bitrate);

        // TODO: Filter by codec config if needed
        return videoFormats[0];
    }

    selectBestAudioStream(formats) {
        const audioFormats = formats.filter(f => f.mimeType.startsWith('audio/'));
        // Sort: Bitrate DESC
        audioFormats.sort((a, b) => b.bitrate - a.bitrate);
        return audioFormats[0];
    }

    getVideoId() {
        // 1. Try player API
        let vid = this.html5Player?.getVideoData?.()?.video_id;
        if (vid) return vid;

        // 2. Try URL Search Params
        const params = new URLSearchParams(location.search);
        vid = params.get('v');
        if (vid) return vid;

        // 3. Try Hash Params (SponsorBlock style)
        if (location.hash) {
            // covers #/watch?v=VIDEO_ID or #?v=VIDEO_ID
            const hashParts = location.hash.split('?');
            if (hashParts.length > 1) {
                const hashParams = new URLSearchParams(hashParts[1]);
                vid = hashParams.get('v');
                if (vid) return vid;
            }
        }

        return null;
    }
}

export const hybridPlayer = new HybridPlayer();
hybridPlayer.init();
