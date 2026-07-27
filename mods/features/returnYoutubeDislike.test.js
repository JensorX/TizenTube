import test from 'node:test';
import assert from 'node:assert/strict';
import { findVideoId, formatDislikes, injectDislikes } from './returnYoutubeDislikeCore.js';

test('formatDislikes supports compact counts without modern Intl notation', () => {
    assert.equal(formatDislikes(999), '999');
    assert.equal(formatDislikes(1500), '1.5K');
    assert.equal(formatDislikes(515878), '515.9K');
    assert.equal(formatDislikes(1200000), '1.2M');
});

test('findVideoId supports player and watch response shapes', () => {
    assert.equal(findVideoId({ videoDetails: { videoId: 'player-id' } }), 'player-id');
    assert.equal(findVideoId({ playerResponse: { videoDetails: { videoId: 'nested-player-id' } } }), 'nested-player-id');
    assert.equal(findVideoId({ currentVideoEndpoint: { watchEndpoint: { videoId: 'endpoint-id' } } }), 'endpoint-id');
});

test('injectDislikes updates a later controls response without a video ID', () => {
    const response = {
        transportControls: {
            transportControlsRenderer: {
                buttons: [{
                    button: { likeButtonRenderer: {} }
                }]
            }
        }
    };

    injectDislikes(response, { dislikes: 515878 }, 'Dislikes');

    const renderer = response.transportControls.transportControlsRenderer.buttons[0].button.likeButtonRenderer;
    assert.deepEqual(renderer.dislikeCountText, { simpleText: '515.9K' });
    assert.deepEqual(renderer.dislikeCountWithDislikeText, { simpleText: '515.9K' });
    assert.deepEqual(renderer.dislikeCountWithUndislikeText, { simpleText: '515.9K' });
});

test('injectDislikes still supports legacy engagement actions', () => {
    const response = {
        transportControls: {
            transportControlsRenderer: {
                engagementActions: [{
                    type: 'TRANSPORT_CONTROLS_BUTTON_TYPE_LIKE_BUTTON',
                    button: { likeButtonRenderer: {} }
                }]
            }
        }
    };

    injectDislikes(response, { dislikes: 2500 }, 'Dislikes');

    const renderer = response.transportControls.transportControlsRenderer.engagementActions[0].button.likeButtonRenderer;
    assert.equal(renderer.dislikeCountText.simpleText, '2.5K');
});

test('injectDislikes adds the description factoid only once', () => {
    const response = {
        engagementPanels: [{
            engagementPanelSectionListRenderer: {
                panelIdentifier: 'video-description-ep-identifier',
                content: {
                    structuredDescriptionContentRenderer: {
                        items: [{ videoDescriptionHeaderRenderer: { factoid: [] } }]
                    }
                }
            }
        }]
    };

    injectDislikes(response, { dislikes: 1200 }, 'Dislikes');
    injectDislikes(response, { dislikes: 1200 }, 'Dislikes');

    const factoids = response.engagementPanels[0].engagementPanelSectionListRenderer.content.structuredDescriptionContentRenderer.items[0].videoDescriptionHeaderRenderer.factoid;
    assert.equal(factoids.length, 1);
    assert.equal(factoids[0].factoidRenderer.value.simpleText, '1.2K');
});