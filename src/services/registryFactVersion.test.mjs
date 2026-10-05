import test from 'node:test';
import assert from 'node:assert/strict';
import { getRegistryFactVersionBadge } from './registryFactVersion.mjs';

test('labels both sides of an explicitly linked correction without changing exact record provenance', () => {
  const earlier = {
    id: 'fact-lab-before', label: 'HbA1c', value: '5.7 mmil', date: '2026-10-02T14:14:00.408Z',
    source: 'lab-report.pdf · page 2', sourceId: 'source-lab-1', sourceClaimId: 'claim-a1c-1',
    validUntil: '2026-10-03T09:00:00.000Z',
  };
  const corrected = {
    id: 'fact-lab-after', label: 'HbA1c', value: '5.8 %', date: '2026-10-03T09:00:00.000Z',
    source: 'Entered by you', sourceId: undefined, sourceClaimId: undefined, supersedesId: earlier.id,
  };

  assert.deepEqual(getRegistryFactVersionBadge(earlier, [earlier, corrected]), {
    kind: 'previous', label: 'PREVIOUS VERSION', relatedFactId: corrected.id,
  });
  assert.deepEqual(getRegistryFactVersionBadge(corrected, [earlier, corrected]), {
    kind: 'corrected', label: 'CORRECTED BY YOU', relatedFactId: earlier.id,
  });
  assert.equal(earlier.value, '5.7 mmil');
  assert.equal(earlier.date, '2026-10-02T14:14:00.408Z');
  assert.equal(earlier.source, 'lab-report.pdf · page 2');
  assert.equal(earlier.sourceId, 'source-lab-1');
  assert.equal(earlier.sourceClaimId, 'claim-a1c-1');
  assert.equal(corrected.value, '5.8 %');
  assert.equal(corrected.date, '2026-10-03T09:00:00.000Z');
  assert.equal(corrected.source, 'Entered by you');
});

test('does not invent lineage from similar values, marker names, dates, or sources', () => {
  const facts = [
    { id: 'one', label: 'Total cholesterol', value: '195 mg/dL', date: '2026-10-02', source: 'Report A' },
    { id: 'two', label: 'Total cholesterol', value: '7.5 mmol/L', date: '2026-10-02', source: 'Report B' },
  ];
  assert.equal(getRegistryFactVersionBadge(facts[0], facts), null);
  assert.equal(getRegistryFactVersionBadge(facts[1], facts), null);
});

test('shows explicit retraction or closed validity without claiming a replacement exists', () => {
  assert.deepEqual(getRegistryFactVersionBadge({ id: 'retracted', reviewState: 'user_retracted' }), {
    kind: 'retracted', label: 'RETRACTED BY YOU', relatedFactId: null,
  });
  assert.deepEqual(getRegistryFactVersionBadge({ id: 'ended', validUntil: '2026-10-03' }), {
    kind: 'ended', label: 'NO LONGER CURRENT', relatedFactId: null,
  });
});

test('does not offer a broken history jump when a referenced prior version is unavailable', () => {
  assert.deepEqual(getRegistryFactVersionBadge({ id: 'new', supersedesId: 'missing-old' }, [{ id: 'new', supersedesId: 'missing-old' }]), {
    kind: 'corrected', label: 'CORRECTED BY YOU', relatedFactId: null,
  });
});
