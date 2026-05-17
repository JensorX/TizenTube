// We use an Xbox One User Agent here.
// Why Xbox One? YouTube's server-side logic rolls out the most modern UI (including the transparent glassmorphism watch buttons)
// to Xbox One devices natively. Additionally, Xbox has far fewer keybinding restrictions compared to PlayStation 4,
// allowing standard remote control navigation keys to work flawlessly.

function generateUserAgent() {
    return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; Xbox; Xbox One) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36 Cobalt/24.lts.0-gold (unlike Gecko) Starboard/14';
}

if (window.h5vcc && window.h5vcc.tizentube && window.h5vcc.tizentube.SetUserAgent) {
    const currentUA = navigator.userAgent;
    
    // If the User Agent already contains Xbox or Cobalt (set by TizenBrew), 
    // we don't need to do anything!
    if (currentUA.includes('Xbox') || currentUA.includes('Cobalt')) {
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