// We use a PlayStation 4 User Agent here.
// Why PS4? YouTube's server-side logic rolls out the most modern UI (including the transparent glassmorphism watch buttons)
// to PS4 devices natively. Using an Android TV user agent often results in mid-tier UIs with gray buttons.
// This matches the successful approach used in VacuumTube.

function generateUserAgent() {
    return 'Mozilla/5.0 (PS4; Leanback Shell) Cobalt/25.lts.30.1034958-gold (unlike Gecko) Starboard/15';
}

if (window.h5vcc && window.h5vcc.tizentube && window.h5vcc.tizentube.SetUserAgent) {
    const currentUA = navigator.userAgent;
    
    // If the User Agent already contains PS4 or Cobalt (set by TizenBrew), 
    // we don't need to do anything!
    if (currentUA.includes('PS4') || currentUA.includes('Cobalt/25')) {
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