import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { LocalDemoRepository } from './localDemoRepository.mjs';
import { createCandidateClaim, createRunEvent, createSourceRecord, DEMO_PROFILE_ID } from '../contracts.mjs';

test('clearing the local synthetic profile removes its sources, claims, accepted assertions and activity', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nura-repository-clear-'));
  try {
    const repository = new LocalDemoRepository(directory);
    const source = createSourceRecord({
      displayName: 'sample-lab.pdf', mediaType: 'application/pdf', sizeBytes: 17,
      sha256: 'a'.repeat(64),
    });
    await repository.createSource(source);
    const claim = createCandidateClaim({
      profileId: DEMO_PROFILE_ID, sourceId: source.id, kind: 'lab_result',
      label: 'Sample value', value: 'Example only', confidence: 0.9,
      sourceLocation: { page: 1, quote: 'Example only' },
    });
    assert.ok(claim);
    await repository.saveCandidateClaims([claim]);
    await repository.decideClaim(claim.id, { decision: 'accept' });
    await repository.appendRunEvent(createRunEvent({
      runId: 'sample-run', sequence: 1, type: 'source_received', stage: 'intake',
      status: 'complete', displayLabel: 'Sample source received', refs: [{ kind: 'source', id: source.id }],
    }));

    assert.deepEqual(await repository.clearDemoProfile(DEMO_PROFILE_ID), {
      sources: 1, claims: 1, assertions: 1, activityEvents: 1,
    });
    assert.deepEqual(await repository.listSources(DEMO_PROFILE_ID), []);
    assert.deepEqual(await repository.listClaims(source.id), []);
    assert.deepEqual(await repository.listAssertions(DEMO_PROFILE_ID), []);
    assert.deepEqual(await repository.listRunEvents('sample-run'), []);
    assert.deepEqual(await repository.clearDemoProfile(DEMO_PROFILE_ID), {
      sources: 0, claims: 0, assertions: 0, activityEvents: 0,
    });
    assert.throws(() => repository.clearDemoProfile('another-profile'), /synthetic demo profile/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('correcting an accepted extracted claim appends a linked version and preserves the prior claim', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nura-repository-correction-'));
  try {
    const repository = new LocalDemoRepository(directory);
    const source = createSourceRecord({ displayName: 'sample-lab.pdf', mediaType: 'application/pdf', sizeBytes: 17, sha256: 'b'.repeat(64) });
    await repository.createSource(source);
    const claim = createCandidateClaim({ sourceId: source.id, kind: 'lab_result', label: 'Sample marker', value: '4.0', unit: 'mmol/L', effectiveAt: '2026-09-12', confidence: 0.9, sourceLocation: { page: 2, quote: 'Sample marker 4.0 mmol/L' } });
    assert.ok(claim);
    await repository.saveCandidateClaims([claim]);
    const accepted = await repository.decideClaim(claim.id, { decision: 'accept' });
    const corrected = await repository.correctClaim(claim.id, {
      expectedAssertionId: accepted.assertion.id,
      editedValue: { label: 'Sample marker', value: '4.2', unit: 'mmol/L', effectiveAt: '2026-09-12' },
    });

    assert.equal(corrected.claim.value, '4.2');
    assert.equal(corrected.claim.revisionHistory.length, 1);
    assert.equal(corrected.claim.revisionHistory[0].value, '4.0');
    assert.equal(corrected.claim.revisionHistory[0].assertionId, accepted.assertion.id);
    assert.equal(corrected.previousAssertion.evidenceState, 'superseded');
    assert.ok(corrected.previousAssertion.validUntil);
    assert.equal(corrected.assertion.version, 2);
    assert.equal(corrected.assertion.supersedes, accepted.assertion.id);
    assert.equal(corrected.assertion.sourceId, source.id);
    assert.deepEqual((await repository.listAssertions()).map((item) => item.id), [corrected.assertion.id, accepted.assertion.id]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('editing an extraction candidate for acceptance retains the original model suggestion', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nura-repository-review-edit-'));
  try {
    const repository = new LocalDemoRepository(directory);
    const source = createSourceRecord({ displayName: 'sample-lab.pdf', mediaType: 'application/pdf', sizeBytes: 17, sha256: 'c'.repeat(64) });
    await repository.createSource(source);
    const claim = createCandidateClaim({ sourceId: source.id, kind: 'lab_result', label: 'Sample marker', value: '40', unit: 'mmol/L', confidence: 0.9, sourceLocation: { page: 2, quote: 'Sample marker 4.0 mmol/L' } });
    assert.ok(claim);
    await repository.saveCandidateClaims([claim]);
    const reviewed = await repository.decideClaim(claim.id, { decision: 'edit', editedValue: { label: 'Sample marker', value: '4.0', unit: 'mmol/L' } });
    assert.equal(reviewed.claim.value, '4.0');
    assert.deepEqual(reviewed.claim.originalExtraction, { label: 'Sample marker', value: '40', unit: 'mmol/L', effectiveAt: null });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
