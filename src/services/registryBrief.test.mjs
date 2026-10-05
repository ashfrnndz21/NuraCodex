import test from 'node:test';
import assert from 'node:assert/strict';
import { registryBriefCitations, registryBriefDisplayModel, registryBriefDisplayText, registryBriefIsCurrent, registryCitationTargetId, registryEvidenceSnapshot } from './registryBrief.mjs';

const recordA = { id: 'fact:a', kind: 'fact', date: '2026-09-12', revision: '2026-09-12', status: 'reviewed' };
const recordB = { id: 'asset:b', kind: 'asset', date: '2026-09-10', revision: '2026-09-10|source-b', status: 'Original source', sourceIdentity: 'source-b' };
const link = { id: 'link-1', relationType: 'related_by_me', label: 'Linked by you as related', createdAt: '2026-09-12T00:00:00.000Z' };

test('registry source snapshot is stable when the same linked evidence arrives in a different order', () => {
  assert.equal(
    registryEvidenceSnapshot('topic-a', [recordA, recordB], [link]),
    registryEvidenceSnapshot('topic-a', [recordB, recordA], [link]),
  );
});

test('registry source snapshot changes when an evidence revision or user link changes', () => {
  const original = registryEvidenceSnapshot('topic-a', [recordA, recordB], [link]);
  const revised = registryEvidenceSnapshot('topic-a', [{ ...recordA, revision: '2026-09-24' }, recordB], [link]);
  const relinked = registryEvidenceSnapshot('topic-a', [recordA, recordB], [{ ...link, label: 'Same period' }]);
  assert.notEqual(original, revised);
  assert.notEqual(original, relinked);
});

test('brief freshness requires exact match with the current source snapshot', () => {
  const brief = { sourceSignature: 'source-snapshot-v1' };
  assert.equal(registryBriefIsCurrent(brief, 'source-snapshot-v1'), true);
  assert.equal(registryBriefIsCurrent(brief, 'source-snapshot-v2'), false);
  assert.equal(registryBriefIsCurrent(null, 'source-snapshot-v1'), false);
});

test('current summary view is allowed only after the exact linked-evidence signature matches', () => {
  assert.deepEqual(registryBriefDisplayModel({ sourceSignature: 'a'.repeat(64) }, 'a'.repeat(64), [recordA]), {
    mode: 'current',
    evidence: [],
  });
});

test('outdated summary falls back to structured current evidence without exposing saved prose or old citations', () => {
  const view = registryBriefDisplayModel({
    answer: 'Old summary says a value is current.',
    citations: [{ id: 'fact:old', title: 'Old result' }],
    sourceSignature: 'a'.repeat(64),
  }, 'b'.repeat(64), [{
    id: 'fact:new', title: 'HbA1c', detail: '5.8%', date: '2026-10-02', category: 'Lab result',
    source: 'Report.pdf · page 2', status: 'Confirmed by you',
  }]);

  assert.deepEqual(view, {
    mode: 'stale',
    evidence: [{
      id: 'fact:new', title: 'HbA1c', detail: '5.8%', date: '2026-10-02', category: 'Lab result',
      source: 'Report.pdf · page 2', status: 'Confirmed by you',
    }],
  });
  assert.equal('answer' in view, false);
  assert.equal('citations' in view, false);
});

test('while the source signature is being calculated, summary text stays hidden and evidence remains available', () => {
  const view = registryBriefDisplayModel({ answer: 'Saved answer', sourceSignature: 'a'.repeat(64) }, '', [recordB]);
  assert.equal(view.mode, 'checking');
  assert.equal(view.evidence[0].id, 'asset:b');
  assert.equal('answer' in view, false);
});

test('a saved brief can retain only sources cited by the completed answer', () => {
  const sources = [{ reference: 'R1', title: 'Report' }, { reference: 'R2', title: 'Visit note' }];
  assert.deepEqual(registryBriefCitations({ citations: ['R2', 'R9', 'R2'] }, sources), [sources[1]]);
  assert.deepEqual(registryBriefCitations({ citations: [] }, sources), []);
});

test('registry citations navigate to the exact connected record when ids match', () => {
  const connected = [{ id: 'fact:lab-1', kind: 'fact', sourceIdentity: 'source-a' }];
  assert.equal(registryCitationTargetId({ id: 'fact:lab-1' }, connected), 'fact:lab-1');
});

test('document-detail citations navigate to their linked local source file', () => {
  const connected = [{ id: 'asset:local-file-1', kind: 'asset', sourceIdentity: 'source-uuid-1' }];
  assert.equal(registryCitationTargetId({ id: 'document:source-uuid-1:2' }, connected), 'asset:local-file-1');
});

test('user-link citations navigate to a connected endpoint instead of an invalid timeline id', () => {
  const connected = [{ id: 'fact:lab-1', kind: 'fact', link: { id: 'topic-link-1' } }];
  assert.equal(registryCitationTargetId({ id: 'link:topic-link-1' }, connected), 'fact:lab-1');
});

test('unmatched registry citations do not invent a timeline target', () => {
  assert.equal(registryCitationTargetId({ id: 'document:missing-source:0' }, []), null);
});

test('registry brief display removes markdown syntax but keeps readable headings and lists', () => {
  assert.equal(
    registryBriefDisplayText('## Cholesterol summary\n\n- **12 Sep 2026:** Five values were captured.\n- Still `unknown`.'),
    'Cholesterol summary\n\n• 12 Sep 2026: Five values were captured.\n• Still unknown.',
  );
});
