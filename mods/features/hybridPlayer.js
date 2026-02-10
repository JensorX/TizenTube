import { configRead } from '../config.js';
import { AVPlayController } from './avplayController.js';
import { createDashManifest } from './dashManifestGenerator.js';

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
        if (!configRead('enableAVPlay')) return;

        // Try AVPlay init
        if (!this.avplay.init()) {
            console.warn('[HybridPlayer] AVPlay init failed, feature disabled');
            return;
        }

        // Wait for player element
        const checkForPlayer = setInterval(() => {
            this.html5Player = document.querySelector('.html5-video-player');
            this.videoElement = document.querySelector('video');
            if (this.html5Player && this.videoElement) {
                clearInterval(checkForPlayer);
                this.attachListeners();
                console.log('[HybridPlayer] Initialized and listeners attached');
            }
        }, 500);
    }

    attachListeners() {
        // Use 'yt-navigate-finish' for video changes
        window.addEventListener('yt-navigate-finish', () => this.handleNavigation());

        // Monitor playback state via existing player API if possible, or video events
        // TizenTube often hooks into 'onStateChange' on the player element
        if (this.html5Player.addEventListener) {
            this.html5Player.addEventListener('onStateChange', (e) => this.handleStateChange(e));
        }

        // Also listen to config changes to enable/disable on the fly
        // (Assuming a way to listen to config changes exists, e.g. custom event)
    }

    handleNavigation() {
        // Check if we are on a watch page
        if (!location.pathname.startsWith('/watch')) {
            this.stopAVPlay();
            return;
        }

        // Check for video ID match
        const videoId = this.getVideoId();
        if (videoId && videoId !== this.currentVideoId) {
            console.log(`[HybridPlayer] Video changed: ${this.currentVideoId} -> ${videoId}`);
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
        if (!configRead('enableAVPlay')) return;

        const streamData = window.__avplayStreamData;
        if (!streamData || !streamData.adaptiveFormats) {
            console.warn('[HybridPlayer] No stream data available for AVPlay yet. Retrying...');
            // Retry logic could be added here
            return;
        }

        console.log('[HybridPlayer] Attempting to start AVPlay...');

        // 1. Select Best Streams (Video + Audio)
        const bestVideo = this.selectBestVideoStream(streamData.adaptiveFormats);
        const bestAudio = this.selectBestAudioStream(streamData.adaptiveFormats);

        if (!bestVideo || !bestAudio) {
            console.error('[HybridPlayer] Could not find suitable streams');
            return;
        }

        console.log(`[HybridPlayer] Selected Streams: Video=${bestVideo.height}p (${bestVideo.mimeType}), Audio=${bestAudio.bitrate}bps`);

        // 2. Generate Local DASH Manifest
        const manifestUrl = createDashManifest(bestVideo, bestAudio);
        if (!manifestUrl) {
            console.error('[HybridPlayer] Manifest generation failed');
            return;
        }

        // 3. Prepare HTML5 Player (Mute & Hide to save resources)
        this.videoElement.muted = true;
        this.videoElement.style.opacity = '0';

        // Make YouTube player container transparent so AVPlay (underneath) is visible
        this.html5Player.style.background = 'transparent';
        const playerApi = document.getElementById('player-api');
        if (playerApi) playerApi.style.background = 'transparent';

        // Also remove black background from video element itself
        this.videoElement.style.background = 'transparent';

        // 4. Start AVPlay
        try {
            await this.avplay.open(manifestUrl);
            this.avplay.play(); // Auto-play
            this.isAVPlayActive = true;

            // Sync initial time
            const startTime = this.videoElement.currentTime * 1000;
            if (startTime > 0) this.avplay.seekTo(startTime);

            // Hide loading spinner if present? 
            // The HTML5 player might be buffering or playing silently.
            // Ideally we want the HTML5 player to *think* it's playing so UI updates (progress bar).
            this.videoElement.play();

            this.startSyncLoop();
        } catch (e) {
            console.error('[HybridPlayer] AVPlay start failed:', e);
            this.restoreHTML5();
        }
    }

    stopAVPlay() {
        if (this.isAVPlayActive) {
            this.avplay.stop();
            this.avplay.close();
            this.isAVPlayActive = false;
            clearInterval(this.syncInterval);
            this.restoreHTML5();
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
        this.syncInterval = setInterval(() => {
            if (!this.isAVPlayActive) return;

            // Simple Sync: Mirror HTML5 seek to AVPlay if diff is large
            // But we actually want AVPlay to drive the master time?
            // Actually, since HTML5 is just "dummy" playing, user interacts with HTML5 UI.
            // User drags scrubber -> HTML5 video time updates -> We verify diff -> Seek AVPlay.

            const html5Time = this.videoElement.currentTime * 1000;
            // We can't easily get AVPlay time synchronously.
            // But strict sync is less important than responding to seeks.

            if (Math.abs(html5Time - this.lastTime) > 2000) {
                // User likely sought
                // console.log('[HybridPlayer] Seek detected, syncing AVPlay');
                this.avplay.seekTo(html5Time);
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
        return this.html5Player?.getVideoData?.()?.video_id;
    }
}

export const hybridPlayer = new HybridPlayer();
hybridPlayer.init();
