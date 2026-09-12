import resolveCommand from '../resolveCommand.js';

function getMappings() {
    return Object.values(window._yttv || {}).find(value => value && value.mappings)?.mappings;
}

function requestNextAndNavigateChannel(params) {
    const mappings = getMappings();
    const identityService = mappings?.get('CurrentIdentityService');
    const innerTubeClient = mappings?.get('KabukiInnerTubeClient');
    const videoId = params?.tileRenderer?.contentId || params?.lockupViewModel?.contentId;
    const watchEndpoint = params?.tileRenderer?.onSelectCommand?.watchEndpoint
        || params?.lockupViewModel?.rendererContext?.commandContext?.onTap?.innertubeCommand?.watchEndpoint;

    if (!identityService || !innerTubeClient || !videoId || !watchEndpoint?.params) return;

    const randomDelay = Math.floor(Math.random() * 2000);
    identityService.get().then(identity => {
        const request = {
            identity,
            isPrefetch: false,
            path: '/youtubei/v1/next',
            payload: {
                videoId,
                params: watchEndpoint.params,
                racyCheckOk: true,
                contentCheckOk: true,
                playbackContext: {
                    lactMilliseconds: randomDelay,
                    isLyricsMode: false
                },
                autonavState: 'STATE_NONE',
                mdxContext: {
                    mdxReceiverContext: {
                        mdxConnectedDevices: []
                    }
                }
            },
            clickTracking: {
                clickTrackingParams: null
            }
        };

        innerTubeClient.fetch(request).subscribe(response => {
            const contents = response?.contents?.singleColumnWatchNextResults?.results?.results?.contents;
            const itemSectionRenderer = contents?.find(item => item.itemSectionRenderer);
            const videoMetadataRenderer = itemSectionRenderer?.itemSectionRenderer?.contents?.find(item => item.videoMetadataRenderer);
            const navigation = videoMetadataRenderer?.videoMetadataRenderer?.owner?.videoOwnerRenderer?.navigationEndpoint;
            if (navigation) resolveCommand(navigation);
        });
    }).catch(() => {});
}

function getGuide() {
    const mappings = getMappings();
    const innerTubeClient = mappings?.get('KabukiInnerTubeClient');
    if (!innerTubeClient) return Promise.resolve(null);

    return new Promise(resolve => {
        innerTubeClient.fetch({ path: '/youtubei/v1/guide' }).subscribe(resolve);
    });
}

export {
    requestNextAndNavigateChannel,
    getGuide
};