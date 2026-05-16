import { configRead } from '../config.js';
import { t } from 'i18next';

const dislikeCache = new Map();

// Fetch dislikes when the video changes
window.addEventListener('hashchange', () => {
    if (!configRead('enableReturnYoutubeDislike')) return;

    const newURL = new URL(location.hash.substring(1), location.href);
    const videoId = newURL.searchParams.get('v');
    
    if (videoId && !dislikeCache.has(videoId)) {
        fetchDislikes(videoId);
    }
}, false);

async function fetchDislikes(videoId) {
    try {
        const res = await fetch(`https://returnyoutubedislikeapi.com/Votes?videoId=${videoId}`);
        if (!res.ok) return;
        const data = await res.json();
        dislikeCache.set(videoId, data);
    } catch (err) {
        console.error(`[RYD] Fetching dislikes for ${videoId} failed`, err);
    }
}

// Initial check if we are already on a video page
const initialVideoId = new URL(location.hash.substring(1), location.href).searchParams.get('v');
if (initialVideoId) fetchDislikes(initialVideoId);

const origParse = JSON.parse;
JSON.parse = function () {
    const r = origParse.apply(this, arguments);
    
    if (!configRead('enableReturnYoutubeDislike')) return r;

    // Detect if this is a response containing video details (watch next)
    const videoId = r?.currentVideoEndpoint?.watchEndpoint?.videoId || 
                    r?.contents?.singleColumnWatchNextResults?.results?.results?.contents?.[0]?.itemSectionRenderer?.contents?.[0]?.videoMetadataRenderer?.videoId;

    if (videoId && dislikeCache.has(videoId)) {
        const votes = dislikeCache.get(videoId);
        const abbreviatedDislikes = Intl.NumberFormat(undefined, {
            notation: 'compact',
            maximumFractionDigits: 1
        }).format(votes.dislikes);

        // Inject into description panel factoids
        const panels = r.engagementPanels || [];
        const descriptionPanel = panels.find(p => p.engagementPanelSectionListRenderer?.panelIdentifier === 'video-description-ep-identifier');
        
        if (descriptionPanel) {
            const items = descriptionPanel.engagementPanelSectionListRenderer.content?.structuredDescriptionContentRenderer?.items || [];
            const header = items.find(i => i.videoDescriptionHeaderRenderer)?.videoDescriptionHeaderRenderer;
            
            if (header && header.factoid) {
                // Avoid duplicate injection
                if (!header.factoid.find(f => f.factoidRenderer?.label?.simpleText === t('general.dislikes'))) {
                    header.factoid.push({
                        factoidRenderer: {
                            value: {
                                simpleText: abbreviatedDislikes
                            },
                            label: {
                                simpleText: t('general.dislikes') || 'Dislikes'
                            }
                        }
                    });
                }
            }
        }

        // Inject into like/dislike buttons
        const engagementActions = r.transportControls?.transportControlsRenderer?.engagementActions;
        const likesEngagement = engagementActions?.find(a => a.type === 'TRANSPORT_CONTROLS_BUTTON_TYPE_LIKE_BUTTON');

        if (likesEngagement?.button?.likeButtonRenderer) {
            likesEngagement.button.likeButtonRenderer.dislikeCountText = { simpleText: abbreviatedDislikes };
            likesEngagement.button.likeButtonRenderer.dislikeCountWithUndislikeText = { simpleText: abbreviatedDislikes };
        }
    }

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
