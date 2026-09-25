import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyIntent, coverageTraceDetail, createEvidenceTools, sanitizeRunBody, validateAnswer } from './context.mjs';

const sampleTreatment = {
  id: 'medicine-1', name: 'Sample medicine', dose: 'Example 10 mg', schedule: 'Example once daily',
  purpose: 'Sample treatment note', prescriber: 'Sample clinician', careLocation: 'Sample clinic',
  pharmacy: 'Sample pharmacy', status: 'current', startedOn: '2026-08-18', endedOn: '',
  source: 'Synthetic demo medicine list',
};
const sampleVisit = {
  id: 'visit-1', purpose: 'Cardiology follow-up', appointmentAt: '2026-10-02T09:00:00.000Z',
  clinician: 'Sample care team', location: 'Sample clinic', status: 'upcoming', source: 'Synthetic visit entry',
  questions: ['What changed since my last blood test?'], outcome: '', followUp: '',
  followUpActions: [{ id: 'action-1', title: 'Book the next visit', dueOn: '2026-10-12', status: 'open', source: 'Added by you' }],
};
const sampleDocument = {
  id: 'source-1', title: 'Sample lipid report', documentType: 'Lipid profile',
  dates: [{ kind: 'collected_at', value: '2025-01-21', page: 1, quote: 'Collected 21-Jan-25' }],
  entities: [{ kind: 'laboratory', value: 'Sample laboratory', page: 1, quote: 'Sample laboratory' }],
  notes: [{ kind: 'fasting_guidance', value: 'Lipid reports are best obtained after 10 hours fasting.', page: 1, quote: 'Reports of Lipid Profile are best obtained with 10 hours fasting.' }],
};
test('coverage activity reports retrieved policy evidence accurately', () => {
  const policySource = { reference: 'R1', kind: 'user_record', category: 'Insurance coverage' };
  assert.match(coverageTraceDetail({ citations: ['R1'], coverageAssessments: [] }, [policySource]), /1 cited policy term/);
  assert.match(coverageTraceDetail({ citations: [], coverageAssessments: [] }, [policySource]), /1 policy term retrieved/);
  assert.match(coverageTraceDetail({ citations: [], coverageAssessments: [] }, []), /comparison remains incomplete/);
  assert.match(coverageTraceDetail({ citations: ['R1'], coverageAssessments: [{ policyReference: 'R1' }] }, [policySource]), /1 policy finding linked/);
});

test('coverage findings cannot link health records outside the current evidence set', () => {
  const sources = [
    { reference: 'R1', id: 'fact:policy', title: 'Cardiology visit limit', kind: 'user_record', category: 'Insurance coverage' },
    { reference: 'R2', id: 'visit:sample', title: 'Sample clinic visit', kind: 'care_visit', category: 'Care visit' },
  ];
  const answer = validateAnswer({
    answer: 'The limit is stated in the policy.',
    citations: ['R1', 'R2', 'R99'],
    coverageAssessments: [{ kind: 'explicit_limit', policyReference: 'R1', detail: 'Eight visits per year.', relatedHealthReferences: ['R2', 'R99'] }],
    unknowns: [], nextSteps: [], memoryProposal: { proposed: false },
  }, sources, { key: 'coverage', question: 'Compare the policy with the selected visit.' });

  assert.deepEqual(answer.coverageAssessments, [{
    kind: 'explicit_limit', policyReference: 'R1', detail: 'Eight visits per year.', relatedHealthReferences: ['R2'],
  }]);
  assert.deepEqual(answer.citations, ['R1', 'R2']);
});

test('coverage validation accepts the normalized policy-term category variants', () => {
  const policySource = { reference: 'R1', id: 'fact:policy', title: 'Annual visit limit', kind: 'user_record', category: 'coverage term' };
  const answer = validateAnswer({
    answer: 'The policy states an annual visit limit.', citations: [],
    coverageAssessments: [{ kind: 'explicit_limit', policyReference: 'R1', detail: 'Eight visits per year.', relatedHealthReferences: [] }],
    unknowns: [], nextSteps: [], memoryProposal: { proposed: false },
  }, [policySource], { key: 'coverage', question: 'What is the policy limit?' });

  assert.equal(answer.coverageAssessments.length, 1);
  assert.match(coverageTraceDetail(answer, [policySource]), /1 policy finding linked/);
});

const run = (overrides = {}) => sanitizeRunBody({
  runId: 'sample-run', question: 'What medicine is recorded?', consentConfirmed: true,
  treatmentContextConsent: false, visitContextConsent: false, context: { facts: [], topics: [], links: [], treatments: [], visits: [] }, ...overrides,
});

test('profile revision runs are labeled separately from the first synthesis', () => {
  assert.deepEqual(classifyIntent('Create a concise first-pass synthesis of my selected health profile.'), {
    key: 'profile_summary', label: 'first profile synthesis',
  });
  assert.deepEqual(classifyIntent('Re-contextualize my selected health profile with the new note.'), {
    key: 'profile_summary', label: 'profile recontextualization',
  });
});

test('treatment records are excluded when the per-run treatment choice is absent or off', () => {
  const absent = run({ context: { facts: [], topics: [], links: [], treatments: [sampleTreatment] } });
  const unchecked = run({ treatmentContextConsent: false, context: { facts: [], topics: [], links: [], treatments: [sampleTreatment] } });
  assert.deepEqual(absent.context.treatments, []);
  assert.deepEqual(unchecked.context.treatments, []);
  assert.equal(absent.treatmentContextConsent, false);
});

test('an explicitly selected treatment record is sanitized and available to retrieval', () => {
  const request = run({
    treatmentContextConsent: true,
    context: { facts: [], topics: [], links: [], treatments: [sampleTreatment] },
  });
  assert.equal(request.treatmentContextConsent, true);
  assert.deepEqual(request.context.treatments, [sampleTreatment]);

  const evidence = createEvidenceTools(request.context);
  const result = evidence.execute('search_profile', { query: 'Sample medicine dose' });
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].id, 'treatment:medicine-1');
  assert.match(result.results[0].detail, /Dose as recorded: Example 10 mg/);
  assert.equal(result.results[0].source, 'Synthetic demo medicine list');
  assert.equal(result.results[0].kind, 'treatment_record');
});

test('symptom support always drops treatment records even if the caller submits them', () => {
  const request = run({
    mode: 'symptom_support', treatmentContextConsent: true,
    context: { facts: [], topics: [], links: [], treatments: [sampleTreatment] },
  });
  assert.deepEqual(request.context.treatments, []);
  assert.equal(request.treatmentContextConsent, false);
});

test('treatment fields are length-bounded and invalid records are removed', () => {
  const request = run({
    treatmentContextConsent: true,
    context: { facts: [], topics: [], links: [], treatments: [
      { ...sampleTreatment, id: 'x'.repeat(140), name: 'n'.repeat(200), dose: 'd'.repeat(160) },
      { ...sampleTreatment, id: '', name: 'Missing identifier' },
    ] },
  });
  assert.equal(request.context.treatments.length, 1);
  assert.equal(request.context.treatments[0].id.length, 96);
  assert.equal(request.context.treatments[0].name.length, 140);
  assert.equal(request.context.treatments[0].dose.length, 120);
});

test('visit and follow-up records are excluded unless separately selected for this run', () => {
  const absent = run({ context: { facts: [], topics: [], links: [], treatments: [], visits: [sampleVisit] } });
  const unchecked = run({ visitContextConsent: false, context: { facts: [], topics: [], links: [], treatments: [], visits: [sampleVisit] } });
  assert.deepEqual(absent.context.visits, []);
  assert.deepEqual(unchecked.context.visits, []);
  assert.equal(absent.visitContextConsent, false);
});

test('an explicitly selected visit is searchable with its user-authored action state and source', () => {
  const request = run({ visitContextConsent: true, context: { facts: [], topics: [], links: [], treatments: [], visits: [sampleVisit] } });
  assert.equal(request.visitContextConsent, true);
  const evidence = createEvidenceTools(request.context);
  const result = evidence.execute('search_profile', { query: 'Cardiology next visit due' });
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].id, 'visit:visit-1');
  assert.match(result.results[0].detail, /Book the next visit \(due 2026-10-12\) · open/);
  assert.equal(result.results[0].source, 'Synthetic visit entry');
  assert.equal(result.results[0].kind, 'care_visit');
});

test('symptom support always drops visit history and follow-up actions', () => {
  const request = run({ mode: 'symptom_support', visitContextConsent: true, context: { facts: [], topics: [], links: [], treatments: [], visits: [sampleVisit] } });
  assert.deepEqual(request.context.visits, []);
  assert.equal(request.visitContextConsent, false);
});

test('source report context is excluded unless the user selects it for this run', () => {
  const context = { facts: [], topics: [], links: [], treatments: [], visits: [], documentSources: [sampleDocument] };
  const absent = run({ context });
  const unchecked = run({ sourceContextConsent: false, context });
  assert.deepEqual(absent.context.documentSources, []);
  assert.deepEqual(unchecked.context.documentSources, []);
  assert.equal(absent.sourceContextConsent, false);
});

test('selected report details are searchable and cited as source context, not personal facts', () => {
  const request = run({
    sourceContextConsent: true,
    context: { facts: [], topics: [], links: [], treatments: [], visits: [], documentSources: [sampleDocument] },
  });
  assert.equal(request.sourceContextConsent, true);
  const evidence = createEvidenceTools(request.context);
  const result = evidence.execute('search_profile', { query: 'fasting 10 hours' });
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].kind, 'document_context');
  assert.equal(result.results[0].source, 'Sample lipid report');
  assert.match(result.results[0].detail, /10 hours fasting/);
  assert.match(result.results[0].detail, /Page 1/);
  assert.doesNotMatch(result.results[0].detail, /You fasted/);
});

test('report context is always unavailable to symptom support', () => {
  const request = run({
    mode: 'symptom_support', sourceContextConsent: true,
    context: { facts: [], topics: [], links: [], treatments: [], visits: [], documentSources: [sampleDocument] },
  });
  assert.deepEqual(request.context.documentSources, []);
  assert.equal(request.sourceContextConsent, false);
});
