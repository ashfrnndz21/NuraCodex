import test from 'node:test';
import assert from 'node:assert/strict';
import { organizeSelfReportLocally } from './localSelfReport.mjs';
import { interpretSelfReportRequest } from './selfReport.mjs';

test('local description organizer structures explicit measurements, medicines, allergies and symptoms with exact quotes', () => {
  const text = 'My blood pressure was 120/80 mmHg on 2026-09-20. I take atorvastatin 10 mg daily. I am allergic to penicillin. I feel dizzy today.';
  const result = organizeSelfReportLocally(text);
  assert.deepEqual(result.claims.map(({ kind, label, value, unit, effectiveAt, quote }) => ({ kind, label, value, unit, effectiveAt, quote })), [
    { kind: 'measurement', label: 'blood pressure', value: '120/80', unit: 'mmHg', effectiveAt: '2026-09-20', quote: 'My blood pressure was 120/80 mmHg on 2026-09-20.' },
    { kind: 'medication', label: 'atorvastatin', value: '10 mg', unit: null, effectiveAt: null, quote: 'I take atorvastatin 10 mg daily.' },
    { kind: 'allergy', label: 'penicillin', value: 'penicillin', unit: null, effectiveAt: null, quote: 'I am allergic to penicillin.' },
    { kind: 'symptom', label: 'dizzy', value: 'dizzy', unit: null, effectiveAt: null, quote: 'I feel dizzy today.' },
  ]);
  assert.deepEqual(result.unknowns, []);
});

test('explicitly reported diagnosis remains labeled as the person’s report; causal or unclear language stays unknown', () => {
  const text = 'I was diagnosed with diabetes in 2024. My knee hurts because I started running. I feel off.';
  const result = organizeSelfReportLocally(text);
  assert.deepEqual(result.claims.map(({ kind, label, value }) => ({ kind, label, value })), [
    { kind: 'reported_condition', label: 'diabetes', value: 'diabetes' },
  ]);
  assert.deepEqual(result.unknowns.map(({ quote }) => quote), [
    'My knee hurts because I started running.',
    'I feel off.',
  ]);
});

test('unclear and unrecognized passages are never promoted into claims', async () => {
  const result = await interpretSelfReportRequest({
    consentForThisNote: true, syntheticDemoConfirmed: true, noteId: 'note-02',
    text: 'I feel strange sometimes. The scan was last year, but I do not remember what it showed.',
  }, { interpret: async ({ text }) => organizeSelfReportLocally(text) });
  assert.equal(result.claims.length, 0);
  assert.equal(result.unknowns.length, 2);
  assert.ok(result.unknowns.every(({ quote }) => result.text.includes(quote)));
});
