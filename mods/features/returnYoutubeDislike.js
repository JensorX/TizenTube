import { configRead } from '../config.js';
import { t } from 'i18next';
import { findVideoId, injectDislikes } from './returnYoutubeDislikeCore.js';

const dislikeCache = new Map();
const pendingRequests = new Map();
const injectableResponses = new Map();
let currentVideoId = null;
const MAX_RESPONSES_PER_VIDEO = 8;

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

function isInjectableResponse(response) {
    return Boolean(response?.transportControls || response?.engagementPanels);
}

function rememberInjectableResponse(videoId, response) {
    if (!videoId || !isInjectableResponse(response)) return;

    const responses = injectableResponses.get(videoId) || [];
    if (!responses.includes(response)) responses.push(response);
    if (responses.length > MAX_RESPONSES_PER_VIDEO) responses.shift();
    injectableResponses.set(videoId, responses);
}

function injectCachedDislikes(videoId) {
    const votes = dislikeCache.get(videoId);
    if (!votes) return;

    const label = t('general.dislikes') || 'Dislikes';
    (injectableResponses.get(videoId) || []).forEach(response => {
        injectDislikes(response, votes, label);
    });
}

function fetchDislikes(videoId) {
    if (!videoId || dislikeCache.has(videoId) || pendingRequests.has(videoId)) return;

    const request = fetch(`https://returnyoutubedislikeapi.com/Votes?videoId=${videoId}`)
        .then(response => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        })
        .then(data => {
            dislikeCache.set(videoId, data);
            injectCachedDislikes(videoId);
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
function processParsedResponse(response) {
    if (!configRead('enableReturnYoutubeDislike')) return response;

    const responseVideoId = findVideoId(response);
    if (responseVideoId) selectVideo(responseVideoId);

    const videoId = responseVideoId || currentVideoId;
    if (!videoId) return response;

    rememberInjectableResponse(videoId, response);
    injectCachedDislikes(videoId);
    return response;
}

const origParse = JSON.parse;
const patchedParse = function () {
    return processParsedResponse(origParse.apply(this, arguments));
};

function installParserHooks() {
    window.JSON.parse = patchedParse;

    if (window._yttv) {
        for (const key in window._yttv) {
            if (window._yttv[key] && window._yttv[key].JSON && window._yttv[key].JSON.parse !== patchedParse) {
                window._yttv[key].JSON.parse = patchedParse;
            }
        }
    }
}

function handleNavigation() {
    if (!configRead('enableReturnYoutubeDislike')) return;
    selectVideo(videoIdFromLocation());
    installParserHooks();
}

selectVideo(videoIdFromLocation());
installParserHooks();

['hashchange', 'popstate', 'yt-navigate-finish', 'yt-page-data-updated'].forEach(eventName => {
    window.addEventListener(eventName, handleNavigation, false);
});

// YouTube TV may replace its JSON namespace during an in-player navigation.
setInterval(installParserHooks, 1000);
