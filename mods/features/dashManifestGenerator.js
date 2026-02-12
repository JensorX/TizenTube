/**
 * Generates a minimal DASH MPD manifest for local playback of separate video/audio streams.
 * Usage: createDashManifest(videoStream, audioStream) -> "blob:http://..."
 */

export function createDashManifest(video, audio) {
  if (!video || !audio) return null;

  // Basic MPD template
  // We use a high minBufferTime to ensure AVPlay buffers enough before starting
  const durationS = (video.approxDurationMs ? (video.approxDurationMs / 1000) : 0).toFixed(3);
  const videoInitRange = video.initRange ? `${video.initRange.start}-${video.initRange.end}` : "0-0";
  const videoIndexRange = video.indexRange ? `${video.indexRange.start}-${video.indexRange.end}` : "0-0";
  const audioInitRange = audio.initRange ? `${audio.initRange.start}-${audio.initRange.end}` : "0-0";
  const audioIndexRange = audio.indexRange ? `${audio.indexRange.start}-${audio.indexRange.end}` : "0-0";

  const mpd = `<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" 
     profiles="urn:mpeg:dash:profile:isoff-on-demand:2011" 
     type="static" 
     minBufferTime="PT1.5S" 
     mediaPresentationDuration="PT${durationS}S">
  <Period>
    <!-- Video Adaptation Set -->
    <AdaptationSet mimeType="${video.mimeType.split(';')[0]}" contentType="video" subsegmentAlignment="true" startWithSAP="1">
      <Representation id="video" bandwidth="${video.bitrate}" width="${video.width || 0}" height="${video.height || 0}" codecs="${extractCodec(video.mimeType)}">
        <BaseURL>${escapeXml(video.url)}</BaseURL>
        <SegmentBase indexRange="${videoIndexRange}">
          <Initialization range="${videoInitRange}" />
        </SegmentBase>
      </Representation>
    </AdaptationSet>

    <!-- Audio Adaptation Set -->
    <AdaptationSet mimeType="${audio.mimeType.split(';')[0]}" contentType="audio" subsegmentAlignment="true" startWithSAP="1">
      <Representation id="audio" bandwidth="${audio.bitrate}" codecs="${extractCodec(audio.mimeType)}" audioSamplingRate="48000">
        <BaseURL>${escapeXml(audio.url)}</BaseURL>
        <SegmentBase indexRange="${audioIndexRange}">
          <Initialization range="${audioInitRange}" />
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
