import { configChangeEmitter, configRead } from '../config.js';
import { disableActiveCaptions } from './forceDisableCaptionsCore.js';

const CONFIG_KEY = 'forceDisableCaptions';
const PLAYER_SELECTOR = '.html5-video-player';
const PLAYER_EVENTS = [
    'onApiChange',
    'onCaptionsModuleAvailable',
    'onCaptionsTrackListChanged',
    'onStateChange',
    'onVideoDataChange'
];

let player = null;
let attachTimeout = null;
let delayedEnforcement = null;

function enforceCaptionPreference() {
    clearTimeout(delayedEnforcement);
    if (!configRead(CONFIG_KEY) || !player) return;

    disableActiveCaptions(player);
    delayedEnforcement = setTimeout(() => {
        if (configRead(CONFIG_KEY)) disableActiveCaptions(player);
    }, 250);
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
        PLAYER_EVENTS.forEach((eventName) => {
            player.addEventListener(eventName, enforceCaptionPreference);
        });
    }

    enforceCaptionPreference();
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