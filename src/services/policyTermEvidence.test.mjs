import test from 'node:test';
import assert from 'node:assert/strict';
import { policyTermEvidenceTarget } from './policyTermEvidence.mjs';

const assets = [
  { id: 'policy-file-1', purpose: 'insurance', serverSourceId: 'source-1' },
  { id: 'health-file-1', purpose: 'medical', serverSourceId: 'source-2' },
];

test('resolves a reviewed policy term to its exact saved file, source and claim', () => {
  assert.deepEqual(policyTermEvidenceTarget({ sourceId: 'source-1', sourceClaimId: 'claim-7' }, assets), {
    assetId: 'policy-file-1', sourceId: 'source-1', claimId: 'claim-7',
  });
});

test('does not create an evidence target when source or claim provenance is missing', () => {
  assert.equal(policyTermEvidenceTarget({ sourceId: 'source-1' }, assets), null);
  assert.equal(policyTermEvidenceTarget({ sourceClaimId: 'claim-7' }, assets), null);
  assert.equal(policyTermEvidenceTarget(null, assets), null);
});

test('does not route a policy quote into another purpose or an unavailable source', () => {
  assert.equal(policyTermEvidenceTarget({ sourceId: 'source-2', sourceClaimId: 'claim-7' }, assets), null);
  assert.equal(policyTermEvidenceTarget({ sourceId: 'missing', sourceClaimId: 'claim-7' }, assets), null);
});
