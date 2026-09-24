import assert from 'node:assert/strict';
import test from 'node:test';
import { findMisdatedAcceptedClaims, findMissingAcceptedClaims, findMissingRetractions } from './sourceClaimReconciliation.mjs';

const sourceId = 'source-1';
const accepted = (id, patch = {}) => ({
  id, sourceId, evidenceState: 'user_confirmed', acceptedAssertionId: `assertion-${id}`,
  ...patch,
});

test('reconciles only accepted claims belonging to the opened source', () => {
  const claims = [
    accepted('accepted'),
    accepted('pending', { evidenceState: 'needs_review', acceptedAssertionId: null }),
    accepted('other-source', { sourceId: 'source-2' }),
    accepted('no-assertion', { acceptedAssertionId: null }),
  ];
  assert.deepEqual(findMissingAcceptedClaims(claims, [], sourceId), [claims[0]]);
});

test('does not duplicate a current source-linked profile fact', () => {
  const claims = [accepted('already-added'), accepted('missing')];
  const facts = [{ sourceId, sourceClaimId: 'already-added', validUntil: null }];
  assert.deepEqual(findMissingAcceptedClaims(claims, facts, sourceId), [claims[1]]);
});

test('restores a claim when its prior profile version has been superseded', () => {
  const claim = accepted('corrected');
  const facts = [{ sourceId, sourceClaimId: 'corrected', validUntil: '2026-09-24T10:00:00.000Z' }];
  assert.deepEqual(findMissingAcceptedClaims([claim], facts, sourceId), [claim]);
});

test('returns each accepted claim at most once and ignores missing source identity', () => {
  const claim = accepted('duplicate');
  assert.deepEqual(findMissingAcceptedClaims([claim, claim], [], sourceId), [claim]);
  assert.deepEqual(findMissingAcceptedClaims([claim], [], null), []);
});

test('repairs the displayed date only for an accepted claim linked to its active source fact', () => {
  const claim = accepted('dated-claim', { effectiveAt: '2025-01-21' });
  const facts = [
    { id: 'fact-1', sourceId, sourceClaimId: 'dated-claim', date: '2026-09-24T10:00:00.000Z', validUntil: null },
    { id: 'fact-2', sourceId, sourceClaimId: 'pending', date: '2026-09-24T10:00:00.000Z', validUntil: null },
  ];
  assert.deepEqual(findMisdatedAcceptedClaims([claim], facts, sourceId), [{ claim, factId: 'fact-1', effectiveAt: '2025-01-21' }]);
});

test('does not rewrite equivalent calendar dates, pending claims, or superseded facts', () => {
  const acceptedSameDay = accepted('same-day', { effectiveAt: '2025-01-21' });
  const pending = accepted('pending', { effectiveAt: '2025-01-21', evidenceState: 'needs_review' });
  const claimWithHistory = accepted('superseded', { effectiveAt: '2025-01-21' });
  const facts = [
    { id: 'fact-same', sourceId, sourceClaimId: 'same-day', date: '2025-01-21T12:00:00.000Z', validUntil: null },
    { id: 'fact-pending', sourceId, sourceClaimId: 'pending', date: '2026-09-24', validUntil: null },
    { id: 'fact-old', sourceId, sourceClaimId: 'superseded', date: '2026-09-24', validUntil: '2026-09-24T12:00:00.000Z' },
  ];
  assert.deepEqual(findMisdatedAcceptedClaims([acceptedSameDay, pending, claimWithHistory], facts, sourceId), []);
});


test('reconciles a saved retraction to a still-active local fact without deleting its history', () => {
  const claim = accepted('retracted-note', {
    evidenceState: 'user_retracted',
    retractedAt: '2026-09-24T12:00:00.000Z',
  });
  const otherSourceClaim = accepted('other-source-retraction', {
    sourceId: 'source-2',
    evidenceState: 'user_retracted',
    retractedAt: '2026-09-24T12:00:00.000Z',
  });
  const facts = [
    { id: 'active-fact', sourceId, sourceClaimId: 'retracted-note', validUntil: null },
    { id: 'already-closed', sourceId, sourceClaimId: 'other-closed', validUntil: '2026-09-24T11:00:00.000Z' },
  ];
  assert.deepEqual(findMissingRetractions([claim, otherSourceClaim], facts, sourceId), [
    { claim, factId: 'active-fact', retractedAt: '2026-09-24T12:00:00.000Z' },
  ]);
  assert.deepEqual(findMissingRetractions([claim], facts, null), []);
});
