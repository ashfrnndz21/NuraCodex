import assert from 'node:assert/strict';
import test from 'node:test';
import { createCandidateClaim, createDocumentContext, createSourceRecord } from './contracts.mjs';

test('document context preserves bounded report metadata and source-located notes', () => {
  const context = createDocumentContext({
    documentType: 'Lipid Profile Serum Sample',
    dates: [{ kind: 'collected_at', value: '21-Jan-25 21:16', page: 1, quote: 'Collected On: 21-Jan-25 21:16' }],
    entities: [{ kind: 'analyzer', value: 'VITROS 5600', page: 1, quote: 'Analyzer: VITROS 5600' }, { kind: 'patient_name', value: 'Ignored' }],
    notes: [{ kind: 'fasting_guidance', value: 'Reports are best obtained with 10 hours fasting.', page: 1, quote: 'Reports are best obtained with 10 hours fasting.' }],
  });
  assert.deepEqual(context, {
    documentType: 'Lipid Profile Serum Sample',
    dates: [{ kind: 'collected_at', value: '21-Jan-25 21:16', page: 1, quote: 'Collected On: 21-Jan-25 21:16' }],
    entities: [{ kind: 'analyzer', value: 'VITROS 5600', page: 1, quote: 'Analyzer: VITROS 5600' }],
    notes: [{ kind: 'fasting_guidance', value: 'Reports are best obtained with 10 hours fasting.', page: 1, quote: 'Reports are best obtained with 10 hours fasting.' }],
  });
});

test('empty document context remains absent on an unprocessed or legacy source', () => {
  assert.equal(createDocumentContext({ dates: [], entities: [], notes: [] }), null);
  const source = createSourceRecord({ displayName: 'sample.pdf', mediaType: 'application/pdf', sizeBytes: 10, sha256: 'a'.repeat(64) });
  assert.equal(source.documentContext, null);
});

test('video source timestamps are retained as server-sampled locations', () => {
  const claim = createCandidateClaim({
    sourceId: 'source-video', kind: 'measurement', label: 'Heart rate', value: '72', unit: 'bpm',
    sourceLocation: { timestampSeconds: 12.375, quote: 'Heart rate 72 bpm' },
  });
  assert.equal(claim.sourceLocation.timestampSeconds, 12.375);
  assert.equal(claim.sourceLocation.locationConfidence, 'server_sampled');
});

test('document context validates kind, bounds item counts, and limits content length', () => {
  const context = createDocumentContext({
    dates: [{ kind: 'untrusted', value: 'skip' }, ...Array.from({ length: 15 }, (_, index) => ({ kind: 'report_date', value: `date-${index}` }))],
    notes: [{ kind: 'remarks', value: 'x'.repeat(1300), page: -1, quote: ' q '.repeat(400) }],
  });
  assert.equal(context.dates.length, 12);
  assert.equal(context.notes[0].value.length, 1200);
  assert.equal(context.notes[0].page, null);
  assert.equal(context.notes[0].quote.length, 600);
});
