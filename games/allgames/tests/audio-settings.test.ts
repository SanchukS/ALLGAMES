import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getVolume, setVolume, setMuted, unlockAudio } from '../src/audio';

test('volume applies before and after audio unlock, survives mute, and persists', () => {
  const stored = new Map<string, string>();
  const master = { gain: { value: -1 }, connect() {} };
  Object.assign(globalThis, {
    localStorage: { setItem: (k: string, v: string) => stored.set(k, v) },
    AudioContext: class {
      sampleRate = 10; destination = {}; state = 'running';
      createGain() { return master; }
      createBuffer() { return { getChannelData: () => new Float32Array(5) }; }
    },
  });
  setVolume(.4); setMuted(true); unlockAudio();
  assert.equal(master.gain.value, 0);
  setMuted(false);
  assert.ok(Math.abs(master.gain.value - .14) < 1e-10);
  setVolume(.8);
  assert.ok(Math.abs(master.gain.value - .28) < 1e-10);
  assert.equal(stored.get('allgames-sound-volume'), '.8'.replace(/^\./, '0.'));
  setVolume(0); assert.equal(master.gain.value, 0);
  setVolume(2); assert.equal(getVolume(), 1);
  setVolume(NaN); assert.equal(getVolume(), 1);
});
