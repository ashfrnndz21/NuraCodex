import assert from 'node:assert/strict';
import test from 'node:test';
import { feedSourceLinkVisibility } from './feedSourceActions.mjs';

test('an Explore card exposes one publisher link in each collapsed, opening, and closing detail state', () => {
  for (const detailsMounted of [false, true]) {
    const actions = feedSourceLinkVisibility(detailsMounted);
    assert.equal(Number(actions.inDetails) + Number(actions.compact), 1);
  }

  assert.deepEqual(feedSourceLinkVisibility(false), { inDetails: false, compact: true });
  assert.deepEqual(feedSourceLinkVisibility(true), { inDetails: true, compact: false });
});
