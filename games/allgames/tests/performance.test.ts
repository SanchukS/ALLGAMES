import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AdaptiveQuality, renderPixelRatio } from '../src/performance';

test('render budget caps mobile resolution without lowering interface resolution', () => {
  assert.equal(renderPixelRatio(true, true, 3, 844), 1);
  assert.equal(renderPixelRatio(false, false, 2, 1280), 2);
  assert.equal(renderPixelRatio(true, true, 3, 1600), .8);
  assert.equal(renderPixelRatio(true, true, 3, 844, .6), .6);
});
test('sustained slow rendering lowers quality, then resolution, and stops at floor', () => {
  for (const [low, scale, expected] of [[false, 1, 'low'], [true, 1, 'reduce'], [true, .6, null]] as const) {
    const adaptive = new AdaptiveQuality();
    const decisions = Array.from({length: 50}, () => adaptive.sample(.2, low, scale, true)).filter(Boolean);
    assert.deepEqual(decisions, expected ? [expected] : []);
  }
});
test('fast frames, background tabs, pause and loading spikes do not degrade quality', () => {
  for (const [dt, active] of [[1/60, true], [.2, false], [2, true]] as const) {
    const adaptive = new AdaptiveQuality();
    assert.ok(Array.from({length: 1000}, () => adaptive.sample(dt, false, 1, active)).every(v => v === null));
  }
});
