import { configChangeEmitter, configRead } from '../config.js';
import { disableActiveCaptions } from './forceDisableCaptionsCore.js';

const CONFIG_KEY = 'forceDisableCaptions';
const PLAYER_SELECTOR = '.html5-video-player';
const PLAYER_EVENTS = [
    'onApiChange',
    'onCaptionsModuleAvailable',
    'onCaptionsTrackListChanged',
    'onVideoDataChange'
];

let player = null;
let attachTimeout = null;
let videoEnforcementTimeout = null;
let lastVideoId = null;

function enforceCaptionPreference() {
    if (!configRead(CONFIG_KEY) || !player) return;

    disableActiveCaptions(player);
}

function enforceForCurrentVideo() {
    const videoId = player?.getVideoData?.().video_id;
    if (!videoId || videoId === lastVideoId) return;

    lastVideoId = videoId;
    clearTimeout(videoEnforcementTimeout);
    videoEnforcementTimeout = setTimeout(enforceCaptionPreference, 250);
}

function attachToPlayer() {
    clearTimeout(attachTimeout);

    const currentPlayer = document.querySelector(PLAYER_SELECTOR);
    if (!currentPlayer) {
        attachTimeout = setTimeout(attachToPlayer, 100);
        return;
    }

    if (player !== currentPlayer) {
        player = currentPlayer;
        lastVideoId = null;
        PLAYER_EVENTS.forEach((eventName) => {
            player.addEventListener(eventName, enforceForCurrentVideo);
        });
    }

    enforceForCurrentVideo();
}

configChangeEmitter.addEventListener('configChange', (event) => {
    if (event.detail?.key === CONFIG_KEY) enforceCaptionPreference();
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachToPlayer);
} else {
    attachToPlayer();
}

window.addEventListener('hashchange', attachToPlayer);
