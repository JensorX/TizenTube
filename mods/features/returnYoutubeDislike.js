import { configRead } from '../config.js';
import { t } from 'i18next';
import { findVideoId, injectDislikes } from './returnYoutubeDislikeCore.js';

const dislikeCache = new Map();
const pendingRequests = new Map();
let currentVideoId = null;

function videoIdFromLocation() {
    try {
        const route = location.hash ? location.hash.substring(1) : location.href;
        return new URL(route, location.href).searchParams.get('v');
    } catch (error) {
        return null;
    }
}

function selectVideo(videoId) {
    if (!videoId) return;
    currentVideoId = videoId;
    fetchDislikes(videoId);
}

// Fetch dislikes when the video changes
window.addEventListener('hashchange', () => {
    if (!configRead('enableReturnYoutubeDislike')) return;
    selectVideo(videoIdFromLocation());
}, false);

function fetchDislikes(videoId) {
    if (!videoId || dislikeCache.has(videoId) || pendingRequests.has(videoId)) return;

    const request = fetch(`https://returnyoutubedislikeapi.com/Votes?videoId=${videoId}`)
        .then(response => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        })
        .then(data => {
            dislikeCache.set(videoId, data);
        })
        .catch(error => {
            console.error(`[RYD] Fetching dislikes for ${videoId} failed`, error);
        })
        .then(() => {
            pendingRequests.delete(videoId);
        });

    pendingRequests.set(videoId, request);
}

// Initial check if we are already on a video page
selectVideo(videoIdFromLocation());

const origParse = JSON.parse;
JSON.parse = function () {
    const r = origParse.apply(this, arguments);
    
    if (!configRead('enableReturnYoutubeDislike')) return r;

    selectVideo(findVideoId(r));

    const votes = currentVideoId && dislikeCache.get(currentVideoId);
    if (votes) injectDislikes(r, votes, t('general.dislikes') || 'Dislikes');

    return r;
};

// Also patch _yttv if available (similar to adblock.js)
if (window._yttv) {
    for (const key in window._yttv) {
        if (window._yttv[key] && window._yttv[key].JSON && window._yttv[key].JSON.parse) {
            window._yttv[key].JSON.parse = JSON.parse;
        }
    }
}
