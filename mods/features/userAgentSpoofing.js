// We use a PlayStation 4 User Agent here.
// Why PS4? YouTube's server-side logic rolls out the most modern UI (including the transparent glassmorphism watch buttons)
// to PS4 devices natively. Using an Android TV user agent often results in mid-tier UIs with gray buttons.
// This matches the successful approach used in VacuumTube.

function generateUserAgent() {
    return 'Mozilla/5.0 (PS4; Leanback Shell) Cobalt/25.lts.30.1034958-gold; compatible; TizenTube';
}

if (window.h5vcc && window.h5vcc.tizentube && window.h5vcc.tizentube.SetUserAgent) {
    const currentUA = navigator.userAgent;
    let storedUA = localStorage.getItem('userAgent');
    
    if (!storedUA || storedUA !== generateUserAgent()) {
        storedUA = generateUserAgent();
        localStorage.setItem('userAgent', storedUA);
    }

    if (currentUA !== storedUA) {
        window.h5vcc.tizentube.SetUserAgent(storedUA);
        location.reload();
    }
}