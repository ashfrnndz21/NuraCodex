import test from 'node:test';
import assert from 'node:assert/strict';
import { createPolicyClarification, isPolicyClarificationSourceCurrent, removePolicyClarification, removePolicyClarificationFromList, updatePolicyClarification } from './policyClarification.mjs';

const facts = [
  { id: 'term-current', label: 'Outpatient care', value: 'Subject to usual and customary rate', category: 'Insurance coverage', status: 'confirmed', sourceId: 'policy-source', sourceClaimId: 'claim-7' },
  { id: 'term-old', label: 'Outpatient care', value: 'Earlier wording', category: 'Insurance coverage', status: 'confirmed', sourceId: 'policy-source', sourceClaimId: 'claim-7', validUntil: '2026-05-01T00:00:00.000Z' },
  { id: 'medical', label: 'Outpatient visit', category: 'Care', sourceId: 'policy-source', sourceClaimId: 'claim-7' },
  { id: 'other-policy', label: 'Outpatient care', category: 'Insurance coverage', sourceId: 'another-source', sourceClaimId: 'claim-7' },
];
const assets = [{ id: 'policy-asset', purpose: 'insurance', serverSourceId: 'policy-source' }];
const base = {
  id: 'reply-1', sourceId: 'policy-source', sourceClaimId: 'claim-7',
  question: 'Which rate schedule is used?', response: 'The insurer said it uses the 2026 published schedule.',
  reportedAt: '2026-09-26T08:00:00.000Z', facts, assets,
};

test('stores the reply as user-reported and links it to the exact current policy claim', () => {
  const result = createPolicyClarification(base);
  assert.deepEqual(result, {
    id: 'reply-1', sourceId: 'policy-source', sourceClaimId: 'claim-7', sourceFactId: 'term-current',
    termLabel: 'Outpatient care', question: 'Which rate schedule is used?',
    response: 'The insurer said it uses the 2026 published schedule.',
    reportedAt: '2026-09-26T08:00:00.000Z', status: 'user_reported',
  });
  assert.equal(result.status, 'user_reported');
});

test('rejects replies without an available insurance source or current reviewed term', () => {
  assert.throws(() => createPolicyClarification({ ...base, assets: [] }), /source is no longer available/i);
  assert.throws(() => createPolicyClarification({ ...base, sourceClaimId: 'missing' }), /current reviewed record/i);
  assert.throws(() => createPolicyClarification({ ...base, facts: facts.filter((fact) => fact.id !== 'term-current') }), /current reviewed record/i);
  assert.throws(() => createPolicyClarification({ ...base, facts: facts.map((fact) => fact.id === 'term-current' ? { ...fact, reviewState: 'user_retracted' } : fact) }), /current reviewed record/i);
  assert.throws(() => createPolicyClarification({ ...base, facts: facts.map((fact) => fact.id === 'term-current' ? { ...fact, status: 'pending' } : fact) }), /current reviewed record/i);
});

test('requires a non-empty reply and a valid report date, with a bounded response size', () => {
  assert.throws(() => createPolicyClarification({ ...base, response: '  ' }), /add the insurer’s reply/i);
  assert.throws(() => createPolicyClarification({ ...base, response: 'x'.repeat(2001) }), /under 2,000 characters/i);
  assert.throws(() => createPolicyClarification({ ...base, reportedAt: 'not-a-date' }), /date is invalid/i);
});

test('edits only the reply text and keeps its original user-reported source and claim linkage', () => {
  const clarification = createPolicyClarification(base);
  const updated = updatePolicyClarification({ clarification, response: 'Insurer says the 2026 schedule applies.', facts, assets });
  assert.deepEqual(updated, { ...clarification, response: 'Insurer says the 2026 schedule applies.' });
  assert.equal(updated.sourceId, clarification.sourceId);
  assert.equal(updated.sourceClaimId, clarification.sourceClaimId);
  assert.equal(updated.sourceFactId, clarification.sourceFactId);
  assert.equal(updated.status, 'user_reported');
});

test('rejects edits when the exact source or accepted term has gone stale, while exposing stale status', () => {
  const clarification = createPolicyClarification(base);
  assert.equal(isPolicyClarificationSourceCurrent({ clarification, facts, assets }), true);
  const missingSource = { ...clarification, sourceId: 'missing-source' };
  assert.equal(isPolicyClarificationSourceCurrent({ clarification: missingSource, facts, assets }), false);
  assert.throws(() => updatePolicyClarification({ clarification, response: 'An updated note.', facts, assets: [] }), /source is no longer available/i);
  assert.throws(() => updatePolicyClarification({ clarification, response: 'An updated note.', facts: facts.filter((fact) => fact.id !== 'term-current'), assets }), /current reviewed record/i);
  assert.throws(() => updatePolicyClarification({ clarification, response: 'An updated note.', facts: facts.map((fact) => fact.id === 'term-current' ? { ...fact, reviewState: 'user_retracted' } : fact), assets }), /current reviewed record/i);
});

test('removes only the chosen reply even after its source or term is stale', () => {
  const first = createPolicyClarification(base);
  const second = createPolicyClarification({ ...base, id: 'reply-2' });
  const staleFirst = { ...first, sourceId: 'removed-source' };
  assert.deepEqual(removePolicyClarification([staleFirst, second], first.id), [second]);
  assert.throws(() => removePolicyClarification([second], first.id), /no longer in your record/i);
});

test('latest-state removal preserves a reply added while native deletion was pending', () => {
  const target = createPolicyClarification(base);
  const existing = createPolicyClarification({ ...base, id: 'reply-existing' });
  const addedWhileWaiting = createPolicyClarification({ ...base, id: 'reply-added-during-delete' });
  assert.deepEqual(removePolicyClarificationFromList([target, existing, addedWhileWaiting], target.id), [existing, addedWhileWaiting]);
});
