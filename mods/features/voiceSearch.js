import { configRead } from "../config.js";
import resolveCommand from "../resolveCommand.js";

let voiceOverlay = null;

function initVoiceInteraction() {
    if (window.webapis && window.webapis.voiceinteraction) {
        try {
            window.webapis.voiceinteraction.setCallback({
                onupdatestate: function () {
                    console.log("[VoiceSearch] VIF requesting app state");
                    return "List";
                },
                onsearch: function (vt) {
                    console.log("[VoiceSearch] VIF onsearch triggered:", vt);
                    const utterance = window.webapis.voiceinteraction.getDataFromSearchTerm(vt, "SEARCH_TERM_UTTERANCE");
                    if (utterance) {
                        console.log("[VoiceSearch] Recognized utterance:", utterance);
                        performSearch(utterance);
                    }
                    return true;
                }
            });
            window.webapis.voiceinteraction.listen();
            console.log("[VoiceSearch] VIF listen() called");
        } catch (e) {
            console.error("[VoiceSearch] VIF initialization failed:", e);
        }
    } else {
        console.warn("[VoiceSearch] webapis.voiceinteraction not available");
    }
}

function performSearch(text) {
    const searchTextBox = document.querySelector('ytlr-search-text-box');
    if (searchTextBox) {
        // Find the internal text input or element that stores the search query
        const input = searchTextBox.querySelector('input') || searchTextBox;
        input.value = text;

        // Dispatch events to notify the app of the change
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));

        // Hide overlay if visible
        if (voiceOverlay) {
            voiceOverlay.style.display = 'none';
        }

        // Trigger search by simulating Enter key on the search box
        const enterEvent = new KeyboardEvent('keydown', {
            key: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true
        });
        searchTextBox.dispatchEvent(enterEvent);
    }
}

function createOverlay() {
    if (voiceOverlay) return;

    voiceOverlay = document.createElement('div');
    voiceOverlay.id = 'tt-voice-overlay';
    voiceOverlay.className = 'tt-voice-overlay';
    voiceOverlay.style.display = 'none';

    voiceOverlay.innerHTML = `
        <div class="tt-voice-content">
            <div class="tt-voice-circle-outer">
                <div class="tt-voice-circle-inner">
                    <yt-icon class="ytLrSearchVoiceMicButtonIcon" style="font-size: 8rem; color: white;">
                        <svg viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" focusable="false" style="pointer-events: none; display: block; width: 100%; height: 100%;">
                            <g><path d="M12,14c1.66,0,3-1.34,3-3V5c0-1.66-1.34-3-3-3S9,3.34,9,5v6C9,12.66,10.34,14,12,14z M11,5c0-0.55,0.45-1,1-1s1,0.45,1,1v6 c0,0.55-0.45,1-1,1s-1-0.45-1-1V5z M17,11c0,2.76-2.24,5-5,5s-5-2.24-5-5H6c0,3.05,2.19,5.58,5,5.91V21h2v-4.09\tc2.81-0.34,5-2.87,5-5.91H17z"></path></g>
                        </svg>
                    </yt-icon>
                </div>
            </div>
            <div class="tt-voice-text">Sprechen Sie jetzt...</div>
            <div class="tt-voice-hint">Drücken Sie die Mikrofon-Taste auf Ihrer Fernbedienung</div>
        </div>
    `;

    document.body.appendChild(voiceOverlay);

    // Close on back button
    window.addEventListener('keydown', (e) => {
        if (voiceOverlay.style.display === 'block' && (e.keyCode === 27 || e.keyCode === 10009)) {
            voiceOverlay.style.display = 'none';
            e.preventDefault();
            e.stopPropagation();
        }
    }, true);
}

function showOverlay() {
    if (!voiceOverlay) createOverlay();
    voiceOverlay.style.display = 'block';
}

function injectVoiceButton() {
    const searchBar = document.querySelector('ytlr-search-bar');
    if (searchBar) {
        if (document.querySelector('#tt-voice-search-button')) return;

        const voiceButton = document.createElement('ytlr-search-voice');
        voiceButton.id = 'tt-voice-search-button';
        voiceButton.style.left = '13.5em'; // Position it next to the text box / existing buttons
        voiceButton.setAttribute('idomkey', 'ytLrSearchBarVoiceSearch');
        voiceButton.setAttribute('tabindex', '0');
        voiceButton.classList.add('ytLrSearchVoiceHost', 'ytLrSearchBarSearchVoice');

        const voiceMicButton = document.createElement('ytlr-search-voice-mic-button');
        voiceMicButton.setAttribute('hybridnavfocusable', 'true');
        voiceMicButton.setAttribute('tabindex', '-1');
        voiceMicButton.classList.add('ytLrSearchVoiceMicButtonHost', 'zylon-ve');

        const micIcon = document.createElement('yt-icon');
        micIcon.setAttribute('tabindex', '-1');
        micIcon.classList.add('ytLrSearchVoiceMicButtonIcon');

        // Use a simpler SVG or just the existing icon classes if possible
        micIcon.innerHTML = `
            <svg viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" focusable="false" style="pointer-events: none; display: block; width: 100%; height: 100%;">
                <g><path d="M12,14c1.66,0,3-1.34,3-3V5c0-1.66-1.34-3-3-3S9,3.34,9,5v6C9,12.66,10.34,14,12,14z M11,5c0-0.55,0.45-1,1-1s1,0.45,1,1v6 c0,0.55-0.45,1-1,1s-1-0.45-1-1V5z M17,11c0,2.76-2.24,5-5,5s-5-2.24-5-5H6c0,3.05,2.19,5.58,5,5.91V21h2v-4.09\tc2.81-0.34,5-2.87,5-5.91H17z" fill="currentColor"></path></g>
            </svg>
        `;

        voiceMicButton.appendChild(micIcon);
        voiceButton.appendChild(voiceMicButton);

        voiceButton.addEventListener('click', showOverlay);

        // Support for "OK" button via spatial nav
        voiceButton.addEventListener('keydown', (e) => {
            if (e.keyCode === 13 || e.keyCode === 32) {
                showOverlay();
                e.preventDefault();
                e.stopPropagation();
            }
        });

        searchBar.appendChild(voiceButton);
        console.log("[VoiceSearch] Injected microphone button");
    }
}

function start() {
    if (!configRead('enableVoiceSearch')) return;

    initVoiceInteraction();

    const observer = new MutationObserver(() => {
        injectVoiceButton();
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Immediate check
    injectVoiceButton();
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    start();
} else {
    window.addEventListener('load', start);
}
