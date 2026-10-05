import test from 'node:test';
import assert from 'node:assert/strict';
import { healthFactRemovalOptions } from './healthFactRemoval.mjs';

test('manually entered current results can be removed from Ask or deleted from Nura', () => {
  assert.deepEqual(healthFactRemovalOptions({ id: 'manual-1' }), {
    canRemoveFromActiveProfile: true,
    canDeletePermanently: true,
    sourceLinked: false,
    sourceLinkNeedsAttention: false,
  });
});

test('source-linked current results can leave the active profile while retaining their source', () => {
  assert.deepEqual(healthFactRemovalOptions({ sourceId: 'source-1', sourceClaimId: 'claim-1' }), {
    canRemoveFromActiveProfile: true,
    canDeletePermanently: false,
    sourceLinked: true,
    sourceLinkNeedsAttention: false,
  });
});

test('earlier and already retracted versions cannot be removed from the active profile again', () => {
  assert.equal(healthFactRemovalOptions({ validUntil: '2026-10-02T00:00:00.000Z' }).canRemoveFromActiveProfile, false);
  assert.equal(healthFactRemovalOptions({ reviewState: 'user_retracted' }).canRemoveFromActiveProfile, false);
});

test('a claim without its source cannot be changed through the timeline', () => {
  assert.deepEqual(healthFactRemovalOptions({ sourceClaimId: 'claim-1' }), {
    canRemoveFromActiveProfile: false,
    canDeletePermanently: false,
    sourceLinked: true,
    sourceLinkNeedsAttention: true,
  });
});

test('an earlier manually entered value can still be deleted from Nura', () => {
  const options = healthFactRemovalOptions({ validUntil: '2026-10-02T00:00:00.000Z' });
  assert.equal(options.canRemoveFromActiveProfile, false);
  assert.equal(options.canDeletePermanently, true);
});
