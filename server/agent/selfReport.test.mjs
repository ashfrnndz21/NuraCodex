import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretSelfReportRequest, sanitizeSelfReportInterpretation, validateSelfReportRequest } from './selfReport.mjs';

const request = (overrides = {}) => ({
  consentForThisNote: true,
  syntheticDemoConfirmed: true,
  noteId: 'note-demo-01',
  text: 'My knee feels stiff after running. It started on 2026-09-20.',
  topic: { id: 'joints', label: 'Joints and movement' },
  ...overrides,
});

test('self-report consent is specific to one selected note and is required before the interpreter runs', async () => {
  let calls = 0;
  const interpret = async () => { calls += 1; return { claims: [], unknowns: [] }; };
  await assert.rejects(interpretSelfReportRequest(request({ consentForThisNote: false }), { interpret }), /Approve this one description/);
  await assert.rejects(interpretSelfReportRequest(request({ syntheticDemoConfirmed: false }), { interpret }), /fictional sample information/);
  assert.equal(calls, 0);
});

test('self-report input rejects oversized, malformed and extra payload data before provider use', () => {
  assert.throws(() => validateSelfReportRequest(request({ text: 'a'.repeat(2_001) })), /under 2,000 characters/);
  assert.throws(() => validateSelfReportRequest(request({ noteId: 'name@example.com' })), /could not be matched/);
  assert.throws(() => validateSelfReportRequest({ ...request(), profileName: 'synthetic' }), /unsupported details/);
  assert.throws(() => validateSelfReportRequest(request({ topic: { id: 'joints', label: 'Joints\n and movement' } })), /selected health area/);
});

test('interpretation accepts only exact quoted details whose label, value and optional unit are present in the quote', () => {
  const text = 'My knee feels stiff after running. It started on 2026-09-20.';
  const output = sanitizeSelfReportInterpretation(text, {
    claims: [
      { kind: 'symptom', label: 'knee feels stiff', value: 'stiff', quote: 'My knee feels stiff after running', confidence: 0.83 },
      { kind: 'reported_condition', label: 'knee condition', value: 'pain', quote: 'My knee feels stiff after running' },
      { kind: 'symptom', label: 'knee feels stiff', value: 'stiff', quote: 'My knee feels stiff after jogging' },
      { kind: 'symptom', label: 'knee feels stiff', value: 'stiff', unit: 'mg', quote: 'My knee feels stiff after running' },
      { kind: 'relationship', label: 'caused by running', value: 'running', quote: 'My knee feels stiff after running' },
      { kind: 'symptom', label: 'started', value: '2026-09-20', quote: 'It started on 2026-09-20.', effectiveAt: '2026-09-20' },
    ],
    unknowns: [
      { quote: 'My knee feels stiff after running', reason: 'unclear' },
      { quote: 'This was not in the note', reason: 'unclear' },
    ],
  });
  assert.deepEqual(output.claims.map(({ kind, label, value, effectiveAt }) => ({ kind, label, value, effectiveAt })), [
    { kind: 'symptom', label: 'knee feels stiff', value: 'stiff', effectiveAt: null },
    { kind: 'symptom', label: 'started', value: '2026-09-20', effectiveAt: '2026-09-20' },
  ]);
  assert.deepEqual(output.unknowns, [{ quote: 'My knee feels stiff after running', reason: 'unclear' }]);
});

test('missing or unclear passages stay unknown, and invalid consent never reaches a model adapter', async () => {
  let calls = 0;
  const interpreted = await interpretSelfReportRequest(request(), {
    interpret: async () => {
      calls += 1;
      return {
        claims: [{ kind: 'other', label: 'stiff after running', value: 'stiff after running', quote: 'stiff after running' }],
        unknowns: [{ quote: 'My knee feels stiff after running', reason: 'unclear' }],
      };
    },
  });
  assert.equal(calls, 1);
  assert.equal(interpreted.claims.length, 1);
  assert.deepEqual(interpreted.unknowns, [{ quote: 'My knee feels stiff after running', reason: 'unclear' }]);
});
