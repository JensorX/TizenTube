// We use an Nvidia Shield TV User Agent here.
// Why Shield TV? It is a high-end Android TV device. YouTube's server-side logic rolls out the most modern UI 
// (including transparent glassmorphic buttons) to it natively, while remote control keys (like Back and Play/Pause)
// work flawlessly using standard Android/Tizen browser mappings without any PS4/console keylocks.

function generateUserAgent() {
    return 'Mozilla/5.0 (Linux; Shield Android TV) Cobalt/25.lts.30.1034958-gold (unlike Gecko) Starboard/15';
}

if (window.h5vcc && window.h5vcc.tizentube && window.h5vcc.tizentube.SetUserAgent) {
    const currentUA = navigator.userAgent;
    
    // If the User Agent already contains a high-end platform or Cobalt (set by TizenBrew), 
    // we don't need to do anything!
    if (currentUA.includes('Shield') || currentUA.includes('Xbox') || currentUA.includes('PS4') || currentUA.includes('Cobalt')) {
        console.log("TizenTube: High-End UA already active, skipping spoof.");
    } else {
        let storedUA = localStorage.getItem('tizentube_userAgent');
        
        if (!storedUA || storedUA !== generateUserAgent()) {
            storedUA = generateUserAgent();
            localStorage.setItem('tizentube_userAgent', storedUA);
        }

        if (currentUA !== storedUA) {
            window.h5vcc.tizentube.SetUserAgent(storedUA);
            location.reload();
        }
    }
}