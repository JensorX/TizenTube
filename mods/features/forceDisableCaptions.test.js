import test from 'node:test';
import assert from 'node:assert/strict';
import { disableActiveCaptions, hasActiveCaptionTrack } from './forceDisableCaptionsCore.js';

test('hasActiveCaptionTrack distinguishes selected and disabled tracks', () => {
    assert.equal(hasActiveCaptionTrack({ languageCode: 'de' }), true);
    assert.equal(hasActiveCaptionTrack({}), false);
    assert.equal(hasActiveCaptionTrack(null), false);
});

test('disableActiveCaptions clears a selected caption track', () => {
    const calls = [];
    const player = {
        getOption(moduleName, optionName) {
            calls.push(['getOption', moduleName, optionName]);
            return { languageCode: 'en', kind: 'asr' };
        },
        setOption(moduleName, optionName, value) {
            calls.push(['setOption', moduleName, optionName, value]);
        }
    };

    assert.equal(disableActiveCaptions(player), true);
    assert.deepEqual(calls, [
        ['getOption', 'captions', 'track'],
        ['setOption', 'captions', 'track', {}]
    ]);
});

test('disableActiveCaptions leaves an already disabled track unchanged', () => {
    let setCalls = 0;
    const player = {
        getOption() {
            return {};
        },
        setOption() {
            setCalls++;
        }
    };

    assert.equal(disableActiveCaptions(player), false);
    assert.equal(setCalls, 0);
});