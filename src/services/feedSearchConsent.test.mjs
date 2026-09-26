import assert from 'node:assert/strict';
import test from 'node:test';
import { createHealthFeedSearchPayload } from './feedSearchConsent.mjs';

test('requires a fresh explicit consent confirmation for every search payload', () => {
  for (const consent of [false, undefined, null, 1, 'true']) {
    assert.throws(
      () => createHealthFeedSearchPayload([{ id: 'cholesterol', label: 'Cholesterol' }], consent),
      /confirm consent/,
    );
  }
});

test('limits a search to one through three valid health topics', () => {
  assert.throws(() => createHealthFeedSearchPayload([], true), /one and three/);
  assert.throws(() => createHealthFeedSearchPayload([
    { id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }, { id: 'd', label: 'D' },
  ], true), /one and three/);
  assert.throws(() => createHealthFeedSearchPayload([{ id: 'topic with spaces', label: 'Cholesterol' }], true), /could not be searched/);
  assert.throws(() => createHealthFeedSearchPayload([{ id: 'cholesterol', label: 'A'.repeat(61) }], true), /could not be searched/);
});

test('sends only the explicitly selected topic identifiers and labels', () => {
  const payload = createHealthFeedSearchPayload([{
    id: 'heart-health',
    label: 'Heart health',
    profileName: 'Synthetic Example',
    records: ['private record should not pass through'],
  }], true);

  assert.deepEqual(payload, {
    consentConfirmed: true,
    topics: [{ id: 'heart-health', label: 'Heart health' }],
  });
});
