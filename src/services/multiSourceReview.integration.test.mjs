import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeIntakeBatch } from './intakeBatchAnalysis.mjs';
import { processIntakeBatch } from './intakeBatch.mjs';
import { commitReviewBatch } from './reviewBatch.mjs';

test('two-file intake keeps source-linked repeat/conflict cues and retries only the failed review item', async () => {
  // In-memory synthetic evidence only. No file bytes, personal data, or provider calls.
  const stagedFiles = [
    { id: 'file-january', name: 'Sample January report' },
    { id: 'file-september', name: 'Sample September report' },
    { id: 'file-unreadable', name: 'Sample unreadable report' },
  ];
  const results = await processIntakeBatch(stagedFiles, async (file) => {
    if (file.id === 'file-unreadable') throw new Error('synthetic unreadable source');
    if (file.id === 'file-january') return {
      sourceId: 'source-january', sourceName: file.name,
      claims: [
        { id: 'jan-ldl', label: 'LDL cholesterol', value: '2.8', unit: 'mmol/L', effectiveAt: '2026-01-12', evidenceState: 'candidate' },
        { id: 'jan-hdl', label: 'HDL cholesterol', value: '1.2', unit: 'mmol/L', effectiveAt: '2026-01-12', evidenceState: 'candidate' },
        { id: 'jan-total', label: 'Total cholesterol', value: '4.2', unit: 'mmol/L', effectiveAt: '2026-01-12', evidenceState: 'candidate' },
        { id: 'jan-uncertain', label: 'Non-HDL cholesterol', value: '3.0', unit: 'mmol/L', effectiveAt: null, evidenceState: 'candidate' },
      ],
    };
    return {
      sourceId: 'source-september', sourceName: file.name,
      claims: [
        { id: 'sep-ldl', label: 'LDL cholesterol', value: '2.8', unit: 'mmol/L', effectiveAt: '2026-01-12', evidenceState: 'candidate' },
        { id: 'sep-hdl', label: 'HDL cholesterol', value: '1.0', unit: 'mmol/L', effectiveAt: '2026-01-12', evidenceState: 'candidate' },
        { id: 'sep-total', label: 'Total cholesterol', value: '4.0', unit: 'mmol/L', effectiveAt: '2026-09-12', evidenceState: 'candidate' },
        { id: 'sep-uncertain', label: 'Non-HDL cholesterol', value: '3.2', unit: 'mmol/L', effectiveAt: '2026-09-12', evidenceState: 'candidate' },
      ],
    };
  });

  assert.deepEqual(results.map(({ assetId, status }) => [assetId, status]), [
    ['file-january', 'complete'], ['file-september', 'complete'], ['file-unreadable', 'failed'],
  ]);
  const completedSources = results.filter((item) => item.status === 'complete').map((item) => item.value);
  const findings = analyzeIntakeBatch(completedSources);
  const cue = (kind, label) => findings.find((item) => item.kind === kind && item.label === label);

  const repeated = cue('same_date_match', 'LDL cholesterol');
  assert.deepEqual(repeated.claimIds, ['jan-ldl', 'sep-ldl']);
  assert.deepEqual(repeated.sources.map(({ id }) => id).sort(), ['source-january', 'source-september']);

  const conflict = cue('same_date_difference', 'HDL cholesterol');
  assert.deepEqual(conflict.claimIds, ['jan-hdl', 'sep-hdl']);
  assert.equal(conflict.eventDates[0], '2026-01-12');
  assert.equal(cue('date_uncertain_difference', 'Non-HDL cholesterol')?.claimIds.length, 2);
  assert.equal(cue('same_date_difference', 'Total cholesterol'), undefined, 'different dated values remain a sequence, not a conflict');
  assert(findings.every((item) => item.sources.every((source) => completedSources.some((entry) => entry.sourceId === source.id))), 'every cue must resolve to a processed source');

  const saved = new Map();
  let failHdlOnce = true;
  const operations = [
    { id: 'decision-jan-ldl', kind: 'claim', claimId: 'jan-ldl', decision: 'accept' },
    { id: 'decision-sep-hdl', kind: 'claim', claimId: 'sep-hdl', decision: 'reject' },
    { id: 'self-report', kind: 'user_note', text: 'I want to compare these sample reports.' },
  ];
  const persist = async (operation) => {
    if (operation.id === 'decision-sep-hdl' && failHdlOnce) {
      failHdlOnce = false;
      throw new Error('synthetic persistence failure');
    }
    saved.set(operation.id, operation);
  };
  const firstSave = await commitReviewBatch(operations, persist);
  assert.deepEqual(firstSave.map(({ id, status }) => [id, status]), [
    ['decision-jan-ldl', 'saved'], ['decision-sep-hdl', 'failed'], ['self-report', 'saved'],
  ]);
  assert.equal(saved.has('decision-jan-ldl'), true);
  assert.equal(saved.has('self-report'), true);
  assert.equal(saved.has('decision-sep-hdl'), false);

  const retryIds = firstSave.filter((item) => item.status === 'failed').map((item) => item.id);
  const retry = await commitReviewBatch(operations.filter((operation) => retryIds.includes(operation.id)), persist);
  assert.deepEqual(retry, [{ id: 'decision-sep-hdl', status: 'saved' }]);
  assert.equal(saved.size, 3);
  assert.equal(saved.get('self-report').kind, 'user_note', 'the user-authored note stays distinct from extracted claims');
});
