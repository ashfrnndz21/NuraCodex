import assert from 'node:assert/strict';
import test from 'node:test';
import { excludeDocumentContextDuplicates, mapVideoFrameClaims, separateGeneralMedicalNotes } from './openaiResponses.mjs';

test('maps video evidence to trusted sampled frame timestamps and drops unsupported locations', () => {
  const frames = [{ timestampSeconds: 12.375 }, { timestampSeconds: 38.5 }];
  const claims = [
    { frameIndex: 1, kind: 'measurement', label: 'Heart rate', value: '72', unit: 'bpm', quote: 'Heart rate 72 bpm' },
    { frameIndex: 7, kind: 'measurement', label: 'Unsupported', value: '1', quote: 'Unsupported 1' },
    { frameIndex: 0, kind: 'measurement', label: 'Unquoted', value: '2', quote: null },
  ];
  const mapped = mapVideoFrameClaims(claims, frames);
  assert.equal(mapped.length, 1);
  assert.equal(mapped[0].timestampSeconds, 38.5);
  assert.equal(mapped[0].page, null);
  assert.equal(mapped[0].frameIndex, undefined);
});

test('keeps source-wide guidance with the document instead of returning it as a profile claim', () => {
  const claims = [
    { label: 'Triglyceride', value: '184 mg/dL', quote: 'Triglyceride 184 mg/dL <150' },
    { label: 'Lipid profile fasting condition', value: 'Reports are best obtained with 10 hours fasting.', quote: 'Reports of Lipid Profile are best obtained with 10 hours fasting.' },
  ];
  const notes = [{ kind: 'fasting_guidance', value: 'Reports of Lipid Profile are best obtained with 10 hours fasting.', quote: 'Reports of Lipid Profile are best obtained with 10 hours fasting.' }];
  assert.deepEqual(excludeDocumentContextDuplicates(claims, notes), [claims[0]]);
});

test('does not discard a measured result merely because its note category is similar', () => {
  const result = { label: 'Fasting glucose', value: '5.4 mmol/L', quote: 'Fasting glucose 5.4 mmol/L' };
  assert.deepEqual(excludeDocumentContextDuplicates([result], [{ kind: 'fasting_guidance', value: 'Fast for 10 hours before collection.' }]), [result]);
});

test('moves generic lipid-panel fasting instructions out of personal health claims', () => {
  const guidance = {
    kind: 'other', label: 'Lipid profile fasting condition',
    value: 'Reports of Lipid Profile are best obtained with 10 hours fasting',
    page: 1, quote: 'Reports of Lipid Profile are best obtained with 10 hours fasting.',
  };
  const result = separateGeneralMedicalNotes([guidance], { notes: [] });
  assert.deepEqual(result.claims, []);
  assert.deepEqual(result.documentContext.notes, [{
    kind: 'fasting_guidance', value: guidance.value, page: 1, quote: guidance.quote,
  }]);
});

test('keeps explicit lab measurements while moving educational guidance into document context', () => {
  const measurement = { kind: 'measurement', label: 'Triglyceride', value: '184', unit: 'mg/dL', quote: 'Triglyceride 184 mg/dL <150', page: 1 };
  const note = { kind: 'other', label: 'Clinical significance', value: 'This text is for educational purposes.', quote: 'Clinical significance: for educational purposes only.', page: 1 };
  const result = separateGeneralMedicalNotes([measurement, note], { notes: [] });
  assert.deepEqual(result.claims, [measurement]);
  assert.equal(result.documentContext.notes[0].kind, 'other');
  assert.equal(result.documentContext.notes[0].page, 1);
});
