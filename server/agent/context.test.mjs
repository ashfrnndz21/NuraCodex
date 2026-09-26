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
    { reference: 'R1', id: 'fact:policy', title: 'Cardiology visit limit', detail: 'Eight visits per year.', kind: 'user_record', category: 'Insurance coverage' },
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

test('coverage validation rejects an explicit exclusion presented as a benefit', () => {
  const sources = [{ reference: 'R1', title: 'Dialysis exclusion', detail: 'Dialysis treatment is excluded.', kind: 'user_record', category: 'Insurance coverage' }];
  const answer = validateAnswer({
    answer: 'Dialysis is covered under this policy.', citations: ['R1'],
    coverageAssessments: [{ kind: 'explicit_benefit', policyReference: 'R1', detail: 'Dialysis treatment is excluded.', relatedHealthReferences: [] }],
    unknowns: [], nextSteps: [], memoryProposal: { proposed: false },
  }, sources, { key: 'coverage', question: 'Is dialysis covered?' });

  assert.deepEqual(answer.coverageAssessments, []);
  assert.doesNotMatch(answer.answer, /Dialysis is covered/);
  assert.deepEqual(answer.citations, []);

  const mislabeled = validateAnswer({
    answer: 'The reviewed wording is uncertain.', citations: ['R1'],
    coverageAssessments: [{ kind: 'unclear', policyReference: 'R1', detail: 'Dialysis treatment is excluded.', relatedHealthReferences: [] }],
    unknowns: [], nextSteps: [], memoryProposal: { proposed: false },
  }, sources, { key: 'coverage', question: 'What does this term say?' });
  assert.deepEqual(mislabeled.coverageAssessments, []);
});

test('coverage validation rejects unsupported finding detail despite a valid policy citation', () => {
  const sources = [{ reference: 'R1', title: 'Annual medical limit', detail: 'USD 50,000 per policy year.', kind: 'user_record', category: 'Insurance coverage' }];
  const answer = validateAnswer({
    answer: 'The policy limit is $500,000.', citations: ['R1'],
    coverageAssessments: [{ kind: 'explicit_limit', policyReference: 'R1', detail: 'USD 500,000 per policy year.', relatedHealthReferences: [] }],
    unknowns: [], nextSteps: [], memoryProposal: { proposed: false },
  }, sources, { key: 'coverage', question: 'What is the annual limit?' });

  assert.deepEqual(answer.coverageAssessments, []);
  assert.doesNotMatch(answer.answer, /500,000/);
  assert.deepEqual(answer.citations, []);
});

test('coverage validation does not turn missing exclusion wording into a no-exclusions conclusion', () => {
  const sources = [{ reference: 'R1', title: 'Exclusions', detail: 'No exclusions are listed in this summary.', kind: 'user_record', category: 'Insurance coverage' }];
  const answer = validateAnswer({
    answer: 'The policy has no exclusions.', citations: ['R1'],
    coverageAssessments: [{ kind: 'explicit_exclusion', policyReference: 'R1', detail: 'No exclusions are listed in this summary.', relatedHealthReferences: [] }],
    unknowns: [], nextSteps: [], memoryProposal: { proposed: false },
  }, sources, { key: 'coverage', question: 'Are there any exclusions?' });

  assert.deepEqual(answer.coverageAssessments, []);
  assert.match(answer.answer, /does not establish that the policy has no exclusions/i);
  assert.ok(answer.unknowns.some((item) => /do not establish that the policy has no exclusions/i.test(item)));
});

test('coverage validation preserves exact supported limits, exclusions, and unclear findings', () => {
  const sources = [
    { reference: 'R1', title: 'Annual medical limit', detail: 'USD 50,000 per policy year.', kind: 'user_record', category: 'Insurance coverage' },
    { reference: 'R2', title: 'Dialysis exclusion', detail: 'Dialysis treatment is excluded.', kind: 'user_record', category: 'coverage term' },
    { reference: 'R3', title: 'Pre-existing conditions', detail: 'Coverage is subject to insurer approval.', kind: 'user_record', category: 'coverage_term' },
  ];
  const answer = validateAnswer({
    answer: 'The saved wording lists a USD 50,000 annual limit and excludes dialysis; pre-existing condition coverage needs clarification.', citations: ['R1', 'R2', 'R3'],
    coverageAssessments: [
      { kind: 'explicit_limit', policyReference: 'R1', detail: 'USD 50,000 per policy year.', relatedHealthReferences: [] },
      { kind: 'explicit_exclusion', policyReference: 'R2', detail: 'Dialysis treatment is excluded.', relatedHealthReferences: [] },
      { kind: 'unclear', policyReference: 'R3', detail: 'Coverage is subject to insurer approval.', relatedHealthReferences: [] },
    ],
    unknowns: [], nextSteps: [], memoryProposal: { proposed: false },
  }, sources, { key: 'coverage', question: 'Summarize the limits and exclusions.' });

  assert.deepEqual(answer.coverageAssessments.map((item) => item.kind), ['explicit_limit', 'explicit_exclusion', 'unclear']);
  assert.deepEqual(answer.citations, ['R1', 'R2', 'R3']);
});

test('coverage validation accepts the normalized policy-term category variants', () => {
  const policySource = { reference: 'R1', id: 'fact:policy', title: 'Annual visit limit', detail: 'Eight visits per year.', kind: 'user_record', category: 'coverage term' };
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

test('first profile synthesis retrieves all selected facts and topics rather than the eight-item Ask shortlist', () => {
  const context = {
    facts: Array.from({ length: 5 }, (_, index) => ({
      id: `fact-${index + 1}`, label: `Saved detail ${index + 1}`, value: `Synthetic value ${index + 1}`,
      date: '2026-09-25', category: 'Profile', source: 'Added by you', status: 'user_confirmed',
    })),
    topics: Array.from({ length: 6 }, (_, index) => ({ id: `topic-${index + 1}`, label: `Selected area ${index + 1}` })),
    links: [{ id: 'link-1', from: 'fact:fact-1', to: 'topic:topic-1', relationType: 'user_note', label: 'Synthetic user link', createdAt: '2026-09-25' }],
    treatments: [], visits: [], documentSources: [],
  };
  const evidence = createEvidenceTools(context);

  const summary = evidence.execute('search_profile', { query: 'profile' }, { includeAllSelected: true });
  const ordinaryAsk = evidence.execute('search_profile', { query: 'Synthetic value' });

  assert.equal(summary.results.length, 11);
  assert.equal(summary.userAuthoredLinks.length, 1);
  assert.equal(summary.results.length + summary.userAuthoredLinks.length, 12);
  assert.equal(summary.totalCount, 11);
  assert.equal(summary.omittedCount, 0);
  assert.deepEqual(new Set(summary.results.map((item) => item.id)), new Set([
    ...context.facts.map((item) => `fact:${item.id}`),
    ...context.topics.map((item) => `topic:${item.id}`),
  ]));
  assert.equal(ordinaryAsk.results.length, 5);
  assert.equal(evidence.sources().length, 12);
});

test('dangling relationship endpoints stay in the profile but never become Ask evidence', () => {
  const links = [
    { id: 'link-missing-target', from: 'topic:cholesterol', to: 'fact:deleted-record', relationType: 'related_by_me', label: 'Synthetic relationship note', createdAt: '2026-09-25' },
    { id: 'link-missing-origin', from: 'fact:deleted-record', to: 'topic:cholesterol', relationType: 'related_by_me', label: 'Another synthetic relationship note', createdAt: '2026-09-25' },
  ];
  const context = { facts: [], topics: [{ id: 'cholesterol', label: 'Cholesterol' }], links, treatments: [], visits: [], documentSources: [] };
  const evidence = createEvidenceTools(context);

  const result = evidence.execute('search_profile', { query: 'cholesterol' });
  const linkSources = evidence.sources().filter((source) => source.id.startsWith('link:'));

  assert.deepEqual(result.results.map((source) => source.id), ['topic:cholesterol']);
  assert.deepEqual(result.userAuthoredLinks, []);
  assert.deepEqual(linkSources, []);
  assert.equal(evidence.execute('get_saved_record', { recordId: 'link:link-missing-target' }).unavailable, true);
  assert.equal(context.links.length, 2, 'unresolved user-created links remain unchanged in the profile context');
  assert.deepEqual(context.links, links);
});

test('profile synthesis reports bounded omissions instead of implying omitted data is unknown', () => {
  const context = {
    facts: Array.from({ length: 40 }, (_, index) => ({
      id: `fact-${index + 1}`, label: `Saved detail ${index + 1}`, value: `Synthetic value ${index + 1}`,
      date: '', category: 'Profile', source: 'Added by you', status: 'user_confirmed',
    })),
    topics: [], links: [], treatments: [], visits: [], documentSources: [],
  };
  const evidence = createEvidenceTools(context);
  const summary = evidence.execute('search_profile', { query: 'profile' }, { includeAllSelected: true });
  const ordinaryAsk = evidence.execute('search_profile', { query: 'Synthetic value' });

  assert.equal(summary.results.length, 32);
  assert.equal(summary.totalCount, 40);
  assert.equal(summary.omittedCount, 8);
  assert.equal(ordinaryAsk.results.length, 8);
  assert.equal(evidence.sources().length, 32);
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


test('unconfirmed fact states never enter Ask retrieval', () => {
  const request = run({
    context: {
      facts: [
        { id: 'confirmed', label: 'Confirmed sample detail', value: 'Synthetic confirmed value', status: 'confirmed' },
        { id: 'reviewed', label: 'Reviewed sample detail', value: 'Synthetic reviewed value', status: 'reviewed' },
        { id: 'candidate', label: 'Candidate sample detail', value: 'Synthetic candidate value', status: 'candidate' },
        { id: 'pending', label: 'Pending sample detail', value: 'Synthetic pending value', status: 'needs_review' },
        { id: 'rejected', label: 'Rejected sample detail', value: 'Synthetic rejected value', status: 'rejected' },
        { id: 'superseded', label: 'Superseded sample detail', value: 'Synthetic superseded value', status: 'superseded' },
        { id: 'unknown', label: 'Unknown state detail', value: 'Synthetic unknown value', status: 'unknown' },
        { id: 'missing', label: 'Missing state detail', value: 'Synthetic missing value', status: '' },
      ],
      topics: [], links: [], treatments: [], visits: [],
    },
  });
  const evidence = createEvidenceTools(request.context);
  const result = evidence.execute('search_profile', { query: 'Synthetic' });

  assert.deepEqual(result.results.map((item) => item.id), ['fact:confirmed', 'fact:reviewed']);
  assert.equal(evidence.sources().length, 2);
});


test('memory proposals require a positive save request, not a recall or opt-out question', () => {
  const candidate = { proposed: true, label: 'Synthetic preference', value: 'Riley Sample', reason: 'The user asked to remember it.', sourceReferences: [] };
  const answerFor = (question, memoryProposal = candidate) => validateAnswer({
    answer: 'I can help with that.', citations: [], unknowns: [], nextSteps: [], memoryProposal,
  }, [], { key: 'profile', question }).memoryProposal;

  assert.equal(answerFor('Do you remember which sample medicine I listed?'), null);
  assert.equal(answerFor('Please do not remember this sample detail.'), null);
  assert.deepEqual(answerFor('Please remember that my preferred name is Riley Sample.'), {
    label: 'Synthetic preference', value: 'Riley Sample', reason: 'The user asked to remember it.', sourceKind: 'user_request', sourceReferences: [],
  });
  assert.equal(answerFor('Please remember this preference.', { ...candidate, value: '!!!' }), null, 'punctuation-only values are not direct user evidence');
  assert.deepEqual(answerFor('Add this to my profile: I prefer morning appointments.', { ...candidate, value: 'morning appointments' }), {
    label: 'Synthetic preference', value: 'morning appointments', reason: 'The user asked to remember it.', sourceKind: 'user_request', sourceReferences: [],
  });
});

test('memory proposals need a directly stated value or a citeable personal source', () => {
  const sources = [
    { reference: 'R1', id: 'fact:fact-1', kind: 'user_record', category: 'Health', title: 'Synthetic lab value' },
    { reference: 'R2', id: 'topic:topic-1', kind: 'chosen_topic', category: 'Health area', title: 'Cholesterol' },
    { reference: 'R3', id: 'web:W1', kind: 'external_source', category: 'Education', title: 'Public article' },
    { reference: 'R4', id: 'link:link-1', kind: 'user_link', category: 'Relationship', title: 'User link' },
    { reference: 'R5', id: 'fact:policy-1', kind: 'user_record', category: 'Insurance coverage', title: 'Policy term' },
  ];
  const candidate = { proposed: true, label: 'Latest sample result', value: '4.8 mmol/L', reason: 'A saved report states this value.', sourceReferences: ['R1'] };
  const validate = (proposal) => validateAnswer({
    answer: 'The report shows a result.', citations: [], unknowns: [], nextSteps: [], memoryProposal: proposal,
  }, sources, { key: 'profile', question: 'Please remember this value from my report.' });

  const supported = validate(candidate);
  assert.deepEqual(supported.memoryProposal, {
    label: 'Latest sample result', value: '4.8 mmol/L', reason: 'A saved report states this value.', sourceKind: 'selected_record', sourceReferences: ['R1'],
  });
  assert.deepEqual(supported.citations, ['R1'], 'the supporting source is promoted into answer citations for visible evidence navigation');
  assert.equal(validate({ ...candidate, sourceReferences: [] }).memoryProposal, null, 'an inferred proposal without evidence is withheld');
  assert.equal(validate({ ...candidate, sourceReferences: ['R2', 'R3', 'R4', 'R5', 'R99'] }).memoryProposal, null, 'topics, external sources, user links, policy terms and unknown refs cannot support a personal memory write');
  assert.deepEqual(sources.map((source) => source.reference), ['R1', 'R2', 'R3', 'R4', 'R5'], 'validation does not mutate the evidence registry');
});
