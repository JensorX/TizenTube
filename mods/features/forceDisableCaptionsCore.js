export function hasActiveCaptionTrack(track) {
    return Boolean(track && typeof track === 'object' && Object.keys(track).length > 0);
}

export function disableActiveCaptions(player) {
    if (!player || typeof player.getOption !== 'function' || typeof player.setOption !== 'function') {
        return false;
    }

    try {
        const activeTrack = player.getOption('captions', 'track');
        if (!hasActiveCaptionTrack(activeTrack)) return false;

        player.setOption('captions', 'track', {});
        return true;
    } catch (error) {
        console.warn('[ForceDisableCaptions] Failed to disable captions:', error);
        return false;
    }
}