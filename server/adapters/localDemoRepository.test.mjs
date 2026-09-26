import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { LocalDemoRepository } from './localDemoRepository.mjs';
import { createCandidateClaim, createDocumentContext, createRunEvent, createSourceRecord, DEMO_PROFILE_ID } from '../contracts.mjs';

test('report metadata remains attached to its source across repository reloads', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nura-source-context-'));
  try {
    const repository = new LocalDemoRepository(directory);
    const source = createSourceRecord({ displayName: 'sample-lab.pdf', mediaType: 'application/pdf', sizeBytes: 17, sha256: 'c'.repeat(64) });
    await repository.createSource(source);
    const documentContext = createDocumentContext({
      documentType: 'Lipid Profile Serum Sample',
      dates: [{ kind: 'collected_at', value: '21-Jan-25 21:16', page: 1, quote: 'Collected On: 21-Jan-25 21:16' }],
      entities: [{ kind: 'analyzer', value: 'VITROS 5600', page: 1, quote: 'Analyzer: VITROS 5600' }],
      notes: [{ kind: 'fasting_guidance', value: 'Report-wide instruction.', page: 1, quote: 'Report-wide instruction.' }],
    });
    await repository.setSourceState(source.id, 'candidate_review', { documentContext });
    const reloaded = new LocalDemoRepository(directory);
    assert.deepEqual((await reloaded.getSource(source.id)).documentContext, documentContext);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

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
    const claim = createCandidateClaim({ sourceId: source.id, kind: 'lab_result', label: 'Sample marker', value: '4.0', unit: 'mmol/L', referenceRange: '3.5–5.0', method: 'Enzymatic', effectiveAt: '2026-09-12', confidence: 0.9, sourceLocation: { page: 2, quote: 'Sample marker 4.0 mmol/L; reference interval 3.5–5.0; enzymatic method' } });
    assert.ok(claim);
    await repository.saveCandidateClaims([claim]);
    const accepted = await repository.decideClaim(claim.id, { decision: 'accept' });
    assert.equal(accepted.assertion.referenceRange, '3.5–5.0');
    assert.equal(accepted.assertion.method, 'Enzymatic');
    assert.equal(accepted.assertion.effectiveAt, '2026-09-12');
    assert.equal(accepted.assertion.validFrom, accepted.assertion.recordedAt);
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
    assert.equal(corrected.claim.effectiveAt, '2026-09-12');
    assert.equal(corrected.assertion.validFrom, corrected.assertion.recordedAt);
    assert.deepEqual((await repository.listAssertions()).map((item) => item.id), [corrected.assertion.id, accepted.assertion.id]);

    await assert.rejects(repository.correctClaim(claim.id, {
      expectedAssertionId: corrected.assertion.id,
      editedValue: { label: 'Sample marker', value: '4.3', unit: 'mmol/L', effectiveAt: '2026-02-30' },
    }), /real calendar date/);
    const undated = await repository.correctClaim(claim.id, {
      expectedAssertionId: corrected.assertion.id,
      editedValue: { label: 'Sample marker', value: '4.3', unit: 'mmol/L', effectiveAt: '' },
    });
    assert.equal(undated.claim.effectiveAt, null);
    assert.equal(undated.assertion.effectiveAt, null);
    assert.equal(undated.assertion.validFrom, undated.assertion.recordedAt);
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


test('retracting an accepted claim closes but preserves its sourced assertion and history', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nura-repository-retraction-'));
  try {
    const repository = new LocalDemoRepository(directory);
    const source = createSourceRecord({ displayName: 'sample-lab.pdf', mediaType: 'application/pdf', sizeBytes: 17, sha256: 'd'.repeat(64) });
    await repository.createSource(source);
    const claim = createCandidateClaim({ sourceId: source.id, kind: 'condition', label: 'Fasting guidance', value: '10 hours before testing', confidence: 0.9, sourceLocation: { page: 1, quote: 'Lipid profiles are best obtained after 10 hours fasting.' } });
    assert.ok(claim);
    await repository.saveCandidateClaims([claim]);
    const accepted = await repository.decideClaim(claim.id, { decision: 'accept' });

    const result = await repository.retractClaim(claim.id, { expectedAssertionId: accepted.assertion.id, reason: 'not_personal' });

    assert.equal(result.unchanged, false);
    assert.equal(result.claim.evidenceState, 'user_retracted');
    assert.equal(result.claim.retractionReason, 'not_personal');
    assert.ok(result.claim.retractedAt);
    assert.equal(result.previousAssertion.evidenceState, 'user_retracted');
    assert.equal(result.previousAssertion.validUntil, result.claim.retractedAt);
    assert.equal(result.previousAssertion.sourceId, source.id);
    assert.equal((await repository.listAssertions(DEMO_PROFILE_ID)).length, 1);
    assert.equal((await repository.getSource(source.id)).displayName, 'sample-lab.pdf');
    const repeated = await repository.retractClaim(claim.id, { expectedAssertionId: accepted.assertion.id, reason: 'not_personal' });
    assert.equal(repeated.unchanged, true);
    assert.equal((await repository.listAssertions(DEMO_PROFILE_ID)).length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('a stale profile assertion cannot be retracted by an old review', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nura-repository-stale-retraction-'));
  try {
    const repository = new LocalDemoRepository(directory);
    const source = createSourceRecord({ displayName: 'sample-lab.pdf', mediaType: 'application/pdf', sizeBytes: 17, sha256: 'e'.repeat(64) });
    await repository.createSource(source);
    const claim = createCandidateClaim({ sourceId: source.id, kind: 'condition', label: 'Fasting guidance', value: '10 hours before testing', confidence: 0.9, sourceLocation: { page: 1, quote: 'Lipid profiles are best obtained after 10 hours fasting.' } });
    assert.ok(claim);
    await repository.saveCandidateClaims([claim]);
    const accepted = await repository.decideClaim(claim.id, { decision: 'accept' });

    await assert.rejects(
      repository.retractClaim(claim.id, { expectedAssertionId: 'older-assertion', reason: 'not_personal' }),
      /changed since you opened/,
    );
    assert.equal((await repository.getClaim(claim.id)).evidenceState, 'user_confirmed');
    assert.equal((await repository.listAssertions(DEMO_PROFILE_ID))[0].validUntil, null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});


test('reviewed result dates are validated and an explicit blank remains undated', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nura-reviewed-result-date-'));
  try {
    const repository = new LocalDemoRepository(directory);
    const source = createSourceRecord({ displayName: 'sample-lab.pdf', mediaType: 'application/pdf', sizeBytes: 17, sha256: 'd'.repeat(64) });
    await repository.createSource(source);
    const undated = createCandidateClaim({
      profileId: DEMO_PROFILE_ID, sourceId: source.id, kind: 'measurement',
      label: 'Glucose', value: '5.1', unit: 'mmol/L',
      sourceLocation: { page: 1, quote: 'Glucose 5.1 mmol/L' },
    });
    const dated = createCandidateClaim({
      profileId: DEMO_PROFILE_ID, sourceId: source.id, kind: 'measurement',
      label: 'Cholesterol', value: '4.2', unit: 'mmol/L', effectiveAt: '2025-01-21',
      sourceLocation: { page: 1, quote: 'Cholesterol 4.2 mmol/L' },
    });
    await repository.saveCandidateClaims([undated, dated]);
    await assert.rejects(
      repository.decideClaim(undated.id, { decision: 'edit', editedValue: { label: 'Glucose', value: '5.1', unit: 'mmol/L', effectiveAt: '2025-02-30' } }),
      /real calendar date/,
    );
    const reviewed = await repository.decideClaim(undated.id, { decision: 'edit', editedValue: { label: 'Glucose', value: '5.1', unit: 'mmol/L', effectiveAt: '2025-02-28' } });
    assert.equal(reviewed.claim.effectiveAt, '2025-02-28');
    assert.equal(reviewed.assertion.effectiveAt, '2025-02-28');
    const cleared = await repository.decideClaim(dated.id, { decision: 'edit', editedValue: { label: 'Cholesterol', value: '4.2', unit: 'mmol/L', effectiveAt: '' } });
    assert.equal(cleared.claim.effectiveAt, null);
    assert.equal(cleared.assertion.effectiveAt, null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
