import assert from 'node:assert/strict';
import test from 'node:test';
import { documentDisplayName, documentIsInsurance, documentOriginalName } from './documentPresentation.mjs';

test('bundled examples use recognizable standardized names', () => {
  assert.equal(documentDisplayName({ localSampleFixtureId: 'lipid-panel-jan-2025' }), 'Lipid panel · January 2025');
  assert.equal(documentDisplayName({ localSampleFixtureId: 'insurance-sample-standard-2025' }), 'Example policy · 2025');
  assert.equal(documentDisplayName({ localSampleFixtureId: 'insurance-independent-sample-2024' }), 'Independent example policy · 2024');
});

test('audio stays visibly distinct until its review service is available', () => {
  assert.equal(documentDisplayName({ name: 'blood-pressure-visit.m4a', kind: 'audio', purpose: 'medical' }), 'Audio recording · review not available yet');
});

test('ordinary file title stays generic until linked evidence supports a category', () => {
  const asset = { name: 'smart-medic-family-benefit-table.png', kind: 'image', purpose: 'insurance', serverSourceId: 'policy-1' };
  assert.equal(documentDisplayName(asset), 'Insurance policy · review needed');
  assert.equal(documentDisplayName(asset, [{ sourceId: 'policy-1', category: 'Insurance coverage', label: 'Hospital room limit', status: 'reviewed', reviewState: 'user_confirmed' }]), 'Insurance policy · reviewed terms');
  assert.equal(documentDisplayName(asset, [{ sourceId: 'policy-1', category: 'Insurance coverage', label: 'Hospital room limit', status: 'candidate', reviewState: 'candidate' }]), 'Insurance policy · review needed');
  assert.equal(documentOriginalName(asset), 'smart-medic-family-benefit-table.png');
});

test('a policy upload without an insurance-purpose flag gets a contextual title and category', () => {
  const asset = { name: 'Elmo_Health policy doc_A5 WEB.pdf', kind: 'pdf', purpose: 'medical' };
  assert.equal(documentIsInsurance(asset), true);
  assert.equal(documentDisplayName(asset), 'Insurance policy · review needed');
  assert.equal(documentOriginalName(asset), 'Elmo_Health policy doc_A5 WEB.pdf');
});

test('analyzed document type suggests a searchable standardized title while review stays explicit', () => {
  const report = { name: 'PL0005-sample-lipid-profile.pdf', kind: 'pdf', purpose: 'medical', documentType: 'Lipid Profile Serum Sample' };
  const policy = { name: 'benefits-final-3.png', kind: 'image', purpose: 'insurance', documentType: 'Family benefits schedule' };
  assert.equal(documentDisplayName(report), 'Lipid panel · review needed');
  assert.equal(documentDisplayName(policy), 'Insurance policy · review needed');
  assert.equal(documentOriginalName(report), 'PL0005-sample-lipid-profile.pdf');
  assert.equal(documentDisplayName({ name: 'Cholesterol_results_Jan_2025.jpg', kind: 'image' }), 'Lipid panel · review needed');
});

test('medical title follows linked, current facts and ignores another source or superseded fact', () => {
  const asset = { name: 'a.pdf', kind: 'pdf', purpose: 'medical', serverSourceId: 'source-1' };
  assert.equal(documentDisplayName(asset, [
    { sourceId: 'source-2', category: 'Lab results', label: 'HDL' },
    { sourceId: 'source-1', category: 'Treatment', label: 'Medicine', status: 'reviewed', reviewState: 'user_confirmed', validUntil: '2026-01-01' },
  ]), 'Health report · review needed');
  assert.equal(documentDisplayName(asset, [{ sourceId: 'source-1', category: 'Lab results', label: 'HDL', status: 'reviewed', reviewState: 'user_confirmed' }]), 'Lipid panel · reviewed results');
  assert.equal(documentDisplayName(asset, [
    { sourceId: 'source-1', category: 'Lab results', label: 'LDL cholesterol', date: '2025-01-21', status: 'reviewed', reviewState: 'user_confirmed' },
    { sourceId: 'source-1', category: 'Lab results', label: 'HDL cholesterol', date: '2025-04-22', status: 'reviewed', reviewState: 'user_confirmed' },
  ]), 'Lipid panel · Jan 2025–Apr 2025');
  assert.equal(documentDisplayName(asset, [
    { sourceId: 'source-1', category: 'Lab results', label: 'HDL cholesterol', date: '2025-04-22', status: 'reviewed', reviewState: 'user_retracted' },
  ]), 'Health report · review needed');
});
