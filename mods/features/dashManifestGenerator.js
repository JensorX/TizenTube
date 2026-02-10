/**
 * Generates a minimal DASH MPD manifest for local playback of separate video/audio streams.
 * Usage: createDashManifest(videoStream, audioStream) -> "blob:http://..."
 */

export function createDashManifest(video, audio) {
    if (!video || !audio) return null;

    // Basic MPD template
    // We use a high minBufferTime to ensure AVPlay buffers enough before starting
    const mpd = `<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" 
     profiles="urn:mpeg:dash:profile:isoff-on-demand:2011" 
     type="static" 
     minBufferTime="PT1.5S" 
     mediaPresentationDuration="PT${(video.approxDurationMs / 1000).toFixed(3)}S">
  <Period>
    <!-- Video Adaptation Set -->
    <AdaptationSet mimeType="${video.mimeType.split(';')[0]}" contentType="video" subsegmentAlignment="true" startWithSAP="1">
      <Representation id="video" bandwidth="${video.bitrate}" width="${video.width}" height="${video.height}" codecs="${extractCodec(video.mimeType)}">
        <BaseURL>${escapeXml(video.url)}</BaseURL>
        <SegmentBase indexRange="${video.indexRange.start}-${video.indexRange.end}">
          <Initialization range="${video.initRange.start}-${video.initRange.end}" />
        </SegmentBase>
      </Representation>
    </AdaptationSet>

    <!-- Audio Adaptation Set -->
    <AdaptationSet mimeType="${audio.mimeType.split(';')[0]}" contentType="audio" subsegmentAlignment="true" startWithSAP="1">
      <Representation id="audio" bandwidth="${audio.bitrate}" codecs="${extractCodec(audio.mimeType)}" audioSamplingRate="48000">
        <BaseURL>${escapeXml(audio.url)}</BaseURL>
        <SegmentBase indexRange="${audio.indexRange.start}-${audio.indexRange.end}">
          <Initialization range="${audio.initRange.start}-${audio.initRange.end}" />
        </SegmentBase>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

    return URL.createObjectURL(new Blob([mpd], { type: 'application/dash+xml' }));
}

function extractCodec(mimeType) {
    const match = mimeType.match(/codecs="([^"]+)"/);
    return match ? match[1] : '';
}

function escapeXml(unsafe) {
    return unsafe.replace(/[<>&'"]/g, function (c) {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
        }
    });
}
