(function () {
    const CHECK_INTERVAL_MS = 150;
    const RESTORE_WINDOW_MS = 8000;
    const MIN_QUERY_LENGTH = 2;
    const voiceState = window.__ttVoiceSearchState || (window.__ttVoiceSearchState = {
        lastMicKeyAt: 0,
        lastMicKeyCode: null
    });

    let lastSearchText = '';
    let lastSearchTextAt = 0;
    let lastRestoreAt = 0;

    function isEditableElement(element) {
        if (!element) return false;

        return element.tagName === 'INPUT'
            || element.tagName === 'TEXTAREA'
            || element.isContentEditable
            || element.getAttribute('role') === 'textbox';
    }

    function scoreSearchCandidate(element) {
        if (!isEditableElement(element)) return -1;

        const hints = [
            element.tagName,
            element.type,
            element.name,
            element.id,
            element.className,
            element.getAttribute('placeholder'),
            element.getAttribute('aria-label'),
            element.getAttribute('role'),
            element.parentElement && element.parentElement.tagName,
            element.parentElement && element.parentElement.className,
            element.closest('ytlr-search-box, ytlr-search-text-box, [role="search"], [aria-label*="search" i], [placeholder*="search" i]') ? 'search-ancestor' : ''
        ].filter(Boolean).join(' ').toLowerCase();

        let score = 0;
        if (hints.includes('search')) score += 4;
        if (hints.includes('query')) score += 2;
        if (hints.includes('textbox')) score += 1;
        if (element === document.activeElement) score += 2;

        return score;
    }

    function getSearchElement() {
        const candidates = Array.from(document.querySelectorAll('input, textarea, [contenteditable="true"], [role="textbox"]'));
        let bestElement = null;
        let bestScore = 0;

        for (const candidate of candidates) {
            const score = scoreSearchCandidate(candidate);
            if (score > bestScore) {
                bestElement = candidate;
                bestScore = score;
            }
        }

        return bestScore >= 3 ? bestElement : null;
    }

    function readElementText(element) {
        if (!element) return '';
        if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
            return String(element.value || '');
        }
        return String(element.textContent || '');
    }

    function writeElementText(element, value) {
        if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
            element.value = value;
        } else {
            element.textContent = value;
        }

        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function shouldRestoreClearedSearch(currentValue) {
        if (currentValue.trim() !== '') return false;
        if (lastSearchText.trim().length < MIN_QUERY_LENGTH) return false;
        if (Date.now() - voiceState.lastMicKeyAt > RESTORE_WINDOW_MS) return false;
        if (Date.now() - lastSearchTextAt > RESTORE_WINDOW_MS) return false;
        if (Date.now() - lastRestoreAt < 1000) return false;
        return true;
    }

    function trackSearchField() {
        const element = getSearchElement();
        if (!element) return;

        const value = readElementText(element);
        const trimmedValue = value.trim();

        if (trimmedValue.length >= MIN_QUERY_LENGTH) {
            lastSearchText = value;
            lastSearchTextAt = Date.now();
            return;
        }

        if (!shouldRestoreClearedSearch(value)) return;

        lastRestoreAt = Date.now();
        writeElementText(element, lastSearchText);
    }

    setInterval(trackSearchField, CHECK_INTERVAL_MS);
})();