export function formatDislikes(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '0';

    const units = [
        { value: 1000000000, suffix: 'B' },
        { value: 1000000, suffix: 'M' },
        { value: 1000, suffix: 'K' }
    ];
    const unit = units.find(item => number >= item.value);

    if (!unit) return String(Math.round(number));

    const compact = Math.round(number / unit.value * 10) / 10;
    return `${compact}${unit.suffix}`;
}

export function findVideoId(response) {
    return response?.videoDetails?.videoId ||
        response?.playerResponse?.videoDetails?.videoId ||
        response?.currentVideoEndpoint?.watchEndpoint?.videoId ||
        response?.contents?.singleColumnWatchNextResults?.results?.results?.contents?.[0]?.itemSectionRenderer?.contents?.[0]?.videoMetadataRenderer?.videoId ||
        null;
}

export function injectDislikes(response, votes, label) {
    if (!response || !votes) return response;

    const abbreviatedDislikes = formatDislikes(votes.dislikes);
    const panels = response.engagementPanels || [];
    const descriptionPanel = panels.find(panel => panel.engagementPanelSectionListRenderer?.panelIdentifier === 'video-description-ep-identifier');

    if (descriptionPanel) {
        const items = descriptionPanel.engagementPanelSectionListRenderer.content?.structuredDescriptionContentRenderer?.items || [];
        const header = items.find(item => item.videoDescriptionHeaderRenderer)?.videoDescriptionHeaderRenderer;

        if (header?.factoid && !header.factoid.find(factoid => factoid.factoidRenderer?.label?.simpleText === label)) {
            header.factoid.push({
                factoidRenderer: {
                    value: { simpleText: abbreviatedDislikes },
                    label: { simpleText: label }
                }
            });
        }
    }

    const transportControls = response.transportControls?.transportControlsRenderer;
    const engagementActions = transportControls?.buttons || transportControls?.engagementActions || [];
    const likesEngagement = engagementActions.find(action =>
        action.type === 'TRANSPORT_CONTROLS_BUTTON_TYPE_LIKE_BUTTON' ||
        action.button?.likeButtonRenderer
    );

    if (likesEngagement?.button?.likeButtonRenderer) {
        likesEngagement.button.likeButtonRenderer.dislikeCountText = { simpleText: abbreviatedDislikes };
        likesEngagement.button.likeButtonRenderer.dislikeCountWithDislikeText = { simpleText: abbreviatedDislikes };
        likesEngagement.button.likeButtonRenderer.dislikeCountWithUndislikeText = { simpleText: abbreviatedDislikes };
    }

    return response;
}