import test from 'node:test';
import assert from 'node:assert/strict';
import { policySourceAsset, policyTermEvidenceAction, policyTermEvidenceTarget } from './policyTermEvidence.mjs';

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


test('labels exact quotes, source-only fallback, and unavailable evidence honestly', () => {
  assert.deepEqual(policyTermEvidenceAction({ sourceId: 'source-1', sourceClaimId: 'claim-7' }, assets), { kind: 'quote', label: 'VIEW SOURCE QUOTE' });
  assert.deepEqual(policyTermEvidenceAction({ sourceId: 'source-1' }, assets), { kind: 'source', label: 'OPEN ORIGINAL SOURCE' });
  assert.deepEqual(policyTermEvidenceAction({ sourceId: 'missing', sourceClaimId: 'claim-7' }, assets), { kind: 'unavailable', label: null });
  assert.deepEqual(policyTermEvidenceAction({ sourceId: 'source-2', sourceClaimId: 'claim-7' }, assets), { kind: 'unavailable', label: null });
});


test('policy source lookup stays in the insurance registry and rejects blank identifiers', () => {
  const collidingAssets = [
    { id: 'medical-file', purpose: 'medical', serverSourceId: 'shared-source' },
    { id: 'policy-file', purpose: 'insurance', serverSourceId: 'shared-source' },
  ];
  assert.equal(policySourceAsset('shared-source', collidingAssets)?.id, 'policy-file');
  assert.equal(policySourceAsset('   ', collidingAssets), null);
  assert.equal(policyTermEvidenceTarget({ sourceId: ' ', sourceClaimId: 'claim-7' }, assets), null);
  assert.equal(policyTermEvidenceTarget({ sourceId: 'source-1', sourceClaimId: '  ' }, assets), null);
  assert.deepEqual(policyTermEvidenceAction({ sourceId: '   ' }, assets), { kind: 'unavailable', label: null });
});
