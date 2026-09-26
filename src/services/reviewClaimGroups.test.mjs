import test from 'node:test';
import assert from 'node:assert/strict';
import { groupReviewClaims } from './reviewClaimGroups.mjs';

test('groups extracted claim kinds under readable headings and preserves source order', () => {
  const firstMeasurement = { id: 'm1', kind: 'measurement', label: 'Blood pressure' };
  const medicine = { id: 'rx', kind: 'medication', label: 'Medicine' };
  const secondMeasurement = { id: 'm2', kind: 'measurement', label: 'Cholesterol' };

  assert.deepEqual(groupReviewClaims([firstMeasurement, medicine, secondMeasurement]), [
    { kind: 'measurement', title: 'Measurements and lab results', claims: [firstMeasurement, secondMeasurement] },
    { kind: 'medication', title: 'Medicines', claims: [medicine] },
  ]);
});

test('unknown claim kinds remain visible in a generic group without label inference', () => {
  const unknown = { id: 'other', kind: 'unexpected', label: 'Blood sugar' };
  assert.deepEqual(groupReviewClaims([unknown]), [
    { kind: 'other', title: 'Other source details', claims: [unknown] },
  ]);
});
