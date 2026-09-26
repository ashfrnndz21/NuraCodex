import test from 'node:test';
import assert from 'node:assert/strict';
import { createProfileMapLayout } from './profileMapLayout.mjs';

test('the layout keeps one through four selected areas in the compact orbit', () => {
  for (let count = 0; count <= 4; count += 1) {
    const layout = createProfileMapLayout(count, 320);
    assert.equal(layout.expanded, false);
    assert.equal(layout.graphHeight, 185);
    assert.equal(layout.slots.length, count);
  }
  assert.deepEqual(createProfileMapLayout(4, 320).slots, [
    { left: 2, top: 0 }, { left: 240, top: 0 }, { left: 2, top: 127 }, { left: 240, top: 127 },
  ]);
});

test('five to ten selected areas use three columns and add rows instead of being capped at four', () => {
  for (let count = 5; count <= 10; count += 1) {
    const layout = createProfileMapLayout(count, 320);
    assert.equal(layout.expanded, true);
    assert.equal(layout.slots.length, count);
    assert.equal(layout.graphHeight, 92 + Math.ceil(count / 3) * 78);
    for (const slot of layout.slots) {
      assert.ok(slot.left >= 0);
      assert.ok(slot.left + layout.nodeWidth <= 320 + 0.001);
      assert.ok(slot.top + layout.nodeDiameter <= layout.graphHeight);
    }
  }
});

test('the expanded map adapts to a phone-width content area', () => {
  const layout = createProfileMapLayout(7, 288);
  assert.equal(layout.slots.length, 7);
  assert.equal(layout.graphHeight, 326);
  assert.ok(layout.slots.every((slot) => slot.left + layout.nodeWidth <= 288 + 0.001));
});
