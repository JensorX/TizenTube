import { configRead } from "../config.js";

let voiceOverlay = null;
let voiceButtonInjected = false;

const originalClasses = {
    ytlrSearchVoice: {
        length: 0,
        classes: []
    },
    ytlrSearchVoiceMicButton: {
        length: 0,
        classes: []
    }
};

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
        const input = searchTextBox.querySelector('input') || searchTextBox;
        input.value = text;

        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));

        if (voiceOverlay) {
            voiceOverlay.style.display = 'none';
        }

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
                    <yt-icon style="font-size: 8rem; color: white;">
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

function removeVoiceButton() {
    const existingButton = document.querySelector('#tt-voice-search-button');
    if (existingButton) {
        existingButton.remove();
        voiceButtonInjected = false;
    }
}

function injectVoiceButton() {
    // Only show when search menu is open (vxawEf element exists)
    const searchMenuOpen = document.querySelector('.vxawEf');
    if (!searchMenuOpen) {
        removeVoiceButton();
        return;
    }

    if (voiceButtonInjected && document.querySelector('#tt-voice-search-button')) return;

    const searchBar = document.querySelector('ytlr-search-bar');
    if (!searchBar) return;

    // Try to copy classes from an existing ytlr-search-voice element (YouTube's native one)
    // This ensures proper spatial navigation integration
    const existingVoiceButton = searchBar.querySelector('ytlr-search-voice');

    const voiceButton = document.createElement('ytlr-search-voice');
    voiceButton.id = 'tt-voice-search-button';
    voiceButton.style.left = '13.5em';

    if (existingVoiceButton) {
        // Copy dynamic classes from the existing voice button for spatial nav compatibility
        for (let i = 0; i < existingVoiceButton.classList.length; i++) {
            if (originalClasses.ytlrSearchVoice.length === 0) {
                originalClasses.ytlrSearchVoice.length = existingVoiceButton.classList.length;
            }
            if (originalClasses.ytlrSearchVoice.length !== existingVoiceButton.classList.length) {
                for (const className of originalClasses.ytlrSearchVoice.classes) {
                    voiceButton.classList.add(className);
                }
                break;
            }
            if (!originalClasses.ytlrSearchVoice.classes.includes(existingVoiceButton.classList[i]))
                originalClasses.ytlrSearchVoice.classes.push(existingVoiceButton.classList[i]);
            voiceButton.classList.add(existingVoiceButton.classList[i]);
        }

        // Build the mic button by copying from the existing one
        const voiceMicButton = document.createElement('ytlr-search-voice-mic-button');
        for (let i = 0; i < existingVoiceButton.children[0].classList.length; i++) {
            if (originalClasses.ytlrSearchVoiceMicButton.length === 0) {
                originalClasses.ytlrSearchVoiceMicButton.length = existingVoiceButton.children[0].classList.length;
            }
            if (originalClasses.ytlrSearchVoiceMicButton.length !== existingVoiceButton.children[0].classList.length) {
                for (const className of originalClasses.ytlrSearchVoiceMicButton.classes) {
                    voiceMicButton.classList.add(className);
                }
                break;
            }
            if (!originalClasses.ytlrSearchVoiceMicButton.classes.includes(existingVoiceButton.children[0].classList[i]))
                originalClasses.ytlrSearchVoiceMicButton.classes.push(existingVoiceButton.children[0].classList[i]);
            voiceMicButton.classList.add(existingVoiceButton.children[0].classList[i]);
        }

        const micIcon = document.createElement('yt-icon');
        for (let i = 0; i < existingVoiceButton.children[0].children[0].classList.length; i++) {
            micIcon.classList.add(existingVoiceButton.children[0].children[0].classList[i]);
        }

        voiceMicButton.appendChild(micIcon);
        voiceButton.appendChild(voiceMicButton);
    } else {
        // Fallback: use hardcoded classes if no existing voice button found
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
        micIcon.innerHTML = `
            <svg viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" focusable="false" style="pointer-events: none; display: block; width: 100%; height: 100%;">
                <g><path d="M12,14c1.66,0,3-1.34,3-3V5c0-1.66-1.34-3-3-3S9,3.34,9,5v6C9,12.66,10.34,14,12,14z M11,5c0-0.55,0.45-1,1-1s1,0.45,1,1v6 c0,0.55-0.45,1-1,1s-1-0.45-1-1V5z M17,11c0,2.76-2.24,5-5,5s-5-2.24-5-5H6c0,3.05,2.19,5.58,5,5.91V21h2v-4.09\tc2.81-0.34,5-2.87,5-5.91H17z" fill="currentColor"></path></g>
            </svg>
        `;

        voiceMicButton.appendChild(micIcon);
        voiceButton.appendChild(voiceMicButton);
    }

    voiceButton.addEventListener('click', showOverlay);
    voiceButton.addEventListener('keydown', (e) => {
        if (e.keyCode === 13 || e.keyCode === 32) {
            showOverlay();
            e.preventDefault();
            e.stopPropagation();
        }
    });

    searchBar.appendChild(voiceButton);
    voiceButtonInjected = true;
    console.log("[VoiceSearch] Injected microphone button");
}

function start() {
    if (!configRead('enableVoiceSearch')) return;

    initVoiceInteraction();

    const observer = new MutationObserver(() => {
        injectVoiceButton();
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    start();
} else {
    window.addEventListener('load', start);
}
