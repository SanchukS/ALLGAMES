import assert from 'node:assert/strict';
import { test } from 'node:test';
import { copyControlLayout, fitControl, LayoutDraft, parseControlLayout, type ControlLayout } from '../src/controlLayout';
const original: ControlLayout = [{ x: .15, y: .7, radius: 60 }, { x: .85, y: .7, radius: 75 }, { x: .65, y: .7, radius: 70 }];

test('layout drafts isolate cancelled edits and commit separate independent copies', () => {
  const live = copyControlLayout(original);
  const draft = new LayoutDraft(live);
  draft.value[0].x = .3;
  draft.value[1].radius = 100;
  assert.deepEqual(live, original); // Cancel simply discards the draft.
  const committed = draft.commit();
  assert.equal(committed[0].x, .3);
  assert.equal(committed[1].radius, 100);
  assert.equal(committed[2].radius, 70);
  draft.value[0].x = .9;
  assert.equal(committed[0].x, .3);
});

test('saved control layouts round trip and reject malformed or nonnumeric data', () => {
  assert.deepEqual(parseControlLayout(JSON.stringify(original)), original);
  for (const raw of [null, '', 'null', '{}', '[]', '[1,2,3]', '[{"x":".5","y":0.5,"radius":60},{},{}]', 'broken']) assert.equal(parseControlLayout(raw), null);
  const outside = copyControlLayout(original);
  outside[0] = { x: -9, y: 4, radius: 999 };
  assert.deepEqual(parseControlLayout(JSON.stringify(outside))![0], { x: 0, y: 1, radius: 160 });
});

test('control geometry stays on screen after rotation and resize, including editor toolbar', () => {
  for (const [w, h] of [[844, 390], [667, 320], [390, 844], [1280, 720]]) {
    for (const top of [8, 100]) {
      for (const p of [{ x: -1, y: -1, radius: 160 }, { x: 2, y: 2, radius: 160 }]) {
        const fitted = fitControl(p, w, h, top);
        assert.ok(fitted.x - fitted.radius >= 8);
        assert.ok(fitted.y - fitted.radius >= top);
        assert.ok(fitted.x + fitted.radius <= w - 8);
        assert.ok(fitted.y + fitted.radius <= h - 8);
      }
    }
  }
});
