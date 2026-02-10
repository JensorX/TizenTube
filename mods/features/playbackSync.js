import { configRead, configChangeEmitter } from '../config.js';
import { showToast } from '../ui/ytUI.js';

/**
 * PlaybackSync: Subtile Audio-Video-Synchronisierung für Tizen TVs
 * 
 * Problem: Bei hoher Playback-Speed (1.5x+) auf 50/60fps YouTube-Videos werden viele Frames gedroppt
 * → Audio und Video laufen asynchron, Drift kann sehr schnell >5s werden
 * 
 * Lösung: Aktive, frame-drop-aware Synchronisierung:
 * - Monitort DROPPED FRAMES direkt aus getVideoStats() (primär)
 * - Monitort auch Drift zwischen Audio/Video (fallback)
 * - Bei hohem Frame-Drop sofort aggressiv synchen (keine 3s Wartezeit)
 * - Bei niedrigem Frame-Drop subtil und selten synchen
 * - User merkt nichts - sieht nur flüssiges Playback
 */

class SubtlePlaybackSync {
  constructor() {
    this.videoEl = null;
    this.player = null;
    this._running = false;
    this.timerId = null;

    // Baseline tracking für Drift-Berechnung
    this.lastBaselineTime = 0;
    this.lastBaselineCurrentTime = 0;
    this.lastRate = 1;

    // Anpassungs-Tracking
    this.lastAdjustmentTime = 0;
    this.consecutiveHighDrifts = 0;
    this.consecutiveForceSyncs = 0;
    this.lastDrift = 0;

    // Frame-Drop Tracking (Delta-basiert)
    this.lastTotalFrames = 0;
    this.lastDroppedFrames = 0;
    this.recentDroppedRatio = 0;

    // Video-Tracking für Toast
    this.currentVideoId = null;
    this.hasShownToastForVideo = false;

    // Thresholds
    this.warningDriftThreshold = 0.15;   // 150ms - fängt an zu reagieren
    this.aggressiveDriftThreshold = 0.5; // 500ms - reagiert stärker
    this.hardJumpThreshold = 1.5;       // 1.5s - macht einen harten Sprung
    this.resetThreshold = 3.5;           // 3.5s - letzter Ausweg: Pause/Play

    // droppedFrameRate thresholds (Delta)
    this.droppedFrameRateWarning = 0.10;  // 10% dropped in letzter Periode
    this.droppedFrameRateCritical = 0.25; // 25% dropped

    // Anpassungsparameter (Max Korrektur pro Tick)
    this.maxSubtleCorrection = 0.05;     // 50ms (fast unsichtbar)
    this.maxAggressiveCorrection = 0.15; // 150ms (leicht spürbar)

    // Interval-Parameter
    this.minAdjustmentInterval = 2000;           // Normal 2s
    this.minAdjustmentIntervalAggressive = 1000; // 1s bei hohem Stress

    this.intervalMs = 400; // Öfter prüfen für schnellere Reaktion
    this.enabled = true;
  }

  attach(videoEl) {
    if (this.videoEl) this.detach();

    this.videoEl = videoEl;

    try {
      this.player = document.querySelector('.html5-video-player');
    } catch (e) {
      console.warn('[SubtlePlaybackSync] Could not find player element');
    }

    this._onRateChange = () => {
      this.resetTracking();
    };

    this._onSeeked = () => {
      this.resetTracking();
    };

    this._onConfigChange = (ev) => {
      if (ev.detail?.key === 'enableCpuStressOptimization') {
        this.enabled = configRead('enableCpuStressOptimization');
      }
    };

    this.videoEl.addEventListener('ratechange', this._onRateChange);
    this.videoEl.addEventListener('seeked', this._onSeeked);
    this.videoEl.addEventListener('play', this._onSeeked); // Reset on play too
    configChangeEmitter.addEventListener('configChange', this._onConfigChange);

    this.enabled = configRead('enableCpuStressOptimization');
    this.start();

    console.info('[SubtlePlaybackSync] Attached');
  }

  detach() {
    if (this.videoEl) {
      this.videoEl.removeEventListener('ratechange', this._onRateChange);
      this.videoEl.removeEventListener('seeked', this._onSeeked);
      this.videoEl.removeEventListener('play', this._onSeeked);
      configChangeEmitter.removeEventListener('configChange', this._onConfigChange);
    }
    this.stop();
    this.videoEl = null;
    this.player = null;
  }

  resetTracking() {
    if (this.videoEl) {
      this.lastBaselineTime = performance.now();
      this.lastBaselineCurrentTime = this.videoEl.currentTime;
      this.lastRate = this.videoEl.playbackRate || 1;
      this.consecutiveHighDrifts = 0;
      this.consecutiveForceSyncs = 0;
      this.lastDrift = 0;

      const stats = this._getVideoStats();
      if (stats) {
        this.lastTotalFrames = this._getStatValue(stats, ['tvf', 'totalVideoFrames', 'total_video_frames', 'totalFrames']);
        this.lastDroppedFrames = this._getStatValue(stats, ['dvf', 'droppedVideoFrames', 'dropped_video_frames', 'droppedFrames']);
      }
    }
  }

  start() {
    if (!this._running) {
      this._running = true;
      this.resetTracking();
      this._schedule();
    }
  }

  stop() {
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this._running = false;
  }

  _schedule() {
    if (this._running) {
      this.timerId = setTimeout(() => {
        if (this.enabled) {
          this._tick();
        }
        this._schedule();
      }, this.intervalMs);
    }
  }

  _getCurrentVideoId() {
    try {
      return this.player?.getVideoData?.()?.video_id || null;
    } catch (e) { return null; }
  }

  _getVideoStats() {
    try {
      return this.player?.getVideoStats?.();
    } catch (e) { return null; }
  }

  _getStatValue(stats, keys) {
    if (!stats || typeof stats !== 'object') return 0;
    for (const key of keys) {
      const val = stats[key];
      if (val !== undefined && val !== null) {
        const num = parseInt(val, 10);
        if (!isNaN(num)) return num;
      }
    }
    return 0;
  }

  _updateDroppedFrameDelta() {
    const stats = this._getVideoStats();
    if (!stats) return 0;

    const totalFrames = this._getStatValue(stats, ['tvf', 'totalVideoFrames', 'total_video_frames', 'totalFrames']);
    const droppedFrames = this._getStatValue(stats, ['dvf', 'droppedVideoFrames', 'dropped_video_frames', 'droppedFrames']);

    const deltaTotal = totalFrames - this.lastTotalFrames;
    const deltaDropped = droppedFrames - this.lastDroppedFrames;

    this.lastTotalFrames = totalFrames;
    this.lastDroppedFrames = droppedFrames;

    if (deltaTotal > 0) {
      this.recentDroppedRatio = deltaDropped / deltaTotal;
      return this.recentDroppedRatio;
    }
    return 0;
  }

  _tick() {
    if (!this.videoEl || this.videoEl.paused || this.videoEl.ended) return;

    const now = performance.now();
    const elapsedSeconds = (now - this.lastBaselineTime) / 1000;
    const rate = this.videoEl.playbackRate || 1;
    const actualTime = this.videoEl.currentTime;

    // Nur bei hohem Speed (> 1.2x) aktiv werden
    if (rate <= 1.2) return;

    // 0. Absolute Minimum Cooldown Check (e.g. 1s)
    // Don't even calculate stats if we are definitely too fast
    const timeSinceLastAdjustment = now - this.lastAdjustmentTime;
    if (timeSinceLastAdjustment < this.minAdjustmentIntervalAggressive) return;

    // 1. Frame-Drops prüfen & Stress berechnen
    const recentDropRatio = this._updateDroppedFrameDelta();
    const hasStress = recentDropRatio > this.droppedFrameRateWarning;

    // 2. Variable Cooldown Check based on Stress
    const requiredInterval = hasStress ? this.minAdjustmentIntervalAggressive : this.minAdjustmentInterval;
    if (timeSinceLastAdjustment < requiredInterval) return;

    // 3. Critical Drop Rate = Force Sync! (Now subject to cooldown & backoff)
    if (recentDropRatio > this.droppedFrameRateCritical) {
      this.consecutiveForceSyncs++;

      // Exponential Backoff / Give Up
      if (this.consecutiveForceSyncs > 5) {
        console.warn(`[SubtleSync] Giving up on sync. Too many consecutive critical drops (${this.consecutiveForceSyncs}).`);
        showToast('TizenTube', 'Sync gave up (Too many drops). Waiting 8s...');
        // Set a long cooldown (e.g. 10s) before trying again
        this.lastAdjustmentTime = now + 8000;
        this.consecutiveForceSyncs = 0; // Reset to try again later
        return;
      }

      console.warn(`[SubtleSync] CRITICAL DROPPED FAILURE (${(recentDropRatio * 100).toFixed(1)}%). Forcing Resync (${this.consecutiveForceSyncs}).`);
      showToast('TizenTube', `Force Sync (${this.consecutiveForceSyncs}/5): Drops critical`);
      // Force aggressive sync even if drift seems low (trust actual visual lag)
      this._applyCorrection(actualTime + 0.1, 0.5, 'FORCE_DROP_SYNC');
      return;
    } else {
      // Reset counter if we stabilised
      if (this.consecutiveForceSyncs > 0) this.consecutiveForceSyncs--;
    }

    // 4. Drift berechnen
    const expectedTime = this.lastBaselineCurrentTime + (elapsedSeconds * rate);
    const drift = expectedTime - actualTime;
    const absDrift = Math.abs(drift);

    // A: Kritischer Drift (> 3.5s) -> Letzter Ausweg: Kurzer Reset
    if (absDrift > this.resetThreshold) {
      console.warn(`[SubtleSync] CRITICAL DRIFT (${absDrift.toFixed(2)}s). Performing Emergency Reset.`);
      this._performEmergencyReset();
      return;
    }

    // B: Großer Drift (> 1.5s) -> Harter Sprung (nicht mehr subtil, aber nötig)
    if (absDrift > this.hardJumpThreshold) {
      console.warn(`[SubtleSync] LARGE DRIFT (${absDrift.toFixed(2)}s). Performing Hard Sync.`);
      this._applyCorrection(expectedTime, absDrift, 'HARD');
      return;
    }

    // C: Mittlerer Drift oder hoher Stress -> Aggressive Korrektur
    if (absDrift > this.aggressiveDriftThreshold || (absDrift > this.warningDriftThreshold && hasStress)) {
      this._applyCorrection(actualTime + (drift * 0.4), absDrift, 'AGGRESSIVE');
      return;
    }

    // D: Kleiner Drift -> Subtile Korrektur
    if (absDrift > this.warningDriftThreshold) {
      // Sehr kleine Korrektur (nur 20% des Drifts, max 50ms)
      const correction = Math.sign(drift) * Math.min(absDrift * 0.2, this.maxSubtleCorrection);
      this._applyCorrection(actualTime + correction, absDrift, 'SUBTLE');
    }
  }

  _applyCorrection(targetTime, drift, mode) {
    try {
      const start = performance.now();
      this.videoEl.currentTime = targetTime;
      this.lastAdjustmentTime = start;

      // Toast nur einmal pro Video zeigen
      const vid = this._getCurrentVideoId();
      if (vid !== this.currentVideoId) {
        this.currentVideoId = vid;
        this.hasShownToastForVideo = false;
      }
      if (!this.hasShownToastForVideo && vid) {
        showToast('TizenTube', `Optimizing playback for ${this.videoEl.playbackRate}x speed...`);
        this.hasShownToastForVideo = true;
      }

      console.info(`[SubtleSync] [${mode}] Drift: ${drift.toFixed(3)}s. Syncing to: ${targetTime.toFixed(3)}s`);

      // Nach Korrektur Baseline neu setzen
      this.lastBaselineTime = performance.now();
      this.lastBaselineCurrentTime = targetTime;
    } catch (e) {
      console.error('[SubtleSync] Correction failed', e);
    }
  }

  _performEmergencyReset() {
    try {
      this.videoEl.pause();
      // Kleiner Versatz um Puffer zu leeren
      this.videoEl.currentTime += 0.01;

      setTimeout(() => {
        if (this.videoEl) {
          this.videoEl.play();
          this.resetTracking();
          this.lastAdjustmentTime = performance.now() + 2000; // Sperre für 2s
        }
      }, 50);
    } catch (e) {
      console.error('[SubtleSync] Emergency reset failed', e);
    }
  }
}

// Auto-attach to video element
const interval = setInterval(() => {
  const videoEl = document.querySelector('video');
  if (videoEl) {
    if (!window.__ttSubtlePlaybackSync) {
      window.__ttSubtlePlaybackSync = new SubtlePlaybackSync();
    }
    window.__ttSubtlePlaybackSync.attach(videoEl);
    clearInterval(interval);
  }
}, 1000);

export { SubtlePlaybackSync };
