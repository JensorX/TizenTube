import initPatches from './features/standaloneUserscript.js';

if (window.location.hostname === 'localhost') {
    const logicalUrl = window.location.href.replace('http://localhost:8099', 'https://www.youtube.com');
    const logicalLocation = new URL(logicalUrl);

    Object.defineProperty(window, '__tizentubeLogicalUrl', {
        configurable: false,
        enumerable: false,
        writable: false,
        value: logicalUrl
    });
    Object.defineProperty(window, '__tizentubeLogicalLocation', {
        configurable: false,
        enumerable: false,
        writable: false,
        value: logicalLocation
    });

    initPatches();
}