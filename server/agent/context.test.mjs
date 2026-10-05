import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyIntent, coverageTraceDetail, createEvidenceTools, sanitizeRunBody, validateAnswer } from './context.mjs';
import { resolveAuthorizedAskContext } from './authorizedAskContext.mjs';

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

test('coverage validation preserves supported terms when it removes an unsupported no-exclusions sentence', () => {
  const source = { reference: 'R1', title: 'Outpatient diagnostic limit', detail: 'Outpatient diagnostic tests are covered up to MYR 1,000 per policy year.', kind: 'user_record', category: 'Insurance coverage' };
  const answer = validateAnswer({
    answer: 'The policy states outpatient diagnostic tests are covered up to MYR 1,000 per policy year. The policy has no exclusions.',
    citations: ['R1'],
    coverageAssessments: [{ kind: 'explicit_benefit', policyReference: 'R1', detail: 'Outpatient diagnostic tests are covered up to MYR 1,000 per policy year.', relatedHealthReferences: [] }],
    unknowns: [], nextSteps: [], memoryProposal: { proposed: false },
  }, [source], { key: 'coverage', question: 'Does this test have a coverage limit?' });

  assert.match(answer.answer, /covered up to MYR 1,000/);
  assert.doesNotMatch(answer.answer, /no exclusions/i);
  assert.equal(answer.coverageAssessments.length, 1);
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

test('coverage validation classifies mixed benefit and cap wording from each exact quoted clause', () => {
  const source = {
    reference: 'R1', title: 'Outpatient diagnostic test limit',
    detail: 'Outpatient diagnostic tests are covered up to MYR 1,000 per policy year. Pre-approval is required for non-emergency diagnostic tests.',
    kind: 'user_record', category: 'Insurance coverage',
  };
  const answer = validateAnswer({
    answer: 'The policy lists outpatient diagnostic tests as covered up to MYR 1,000 per policy year, with pre-approval required for non-emergency tests. It does not specifically confirm whether this cholesterol test qualifies.',
    citations: ['R1'],
    coverageAssessments: [
      { kind: 'explicit_benefit', policyReference: 'R1', detail: 'Outpatient diagnostic tests are covered up to MYR 1,000 per policy year.', relatedHealthReferences: [] },
      { kind: 'explicit_limit', policyReference: 'R1', detail: 'Pre-approval is required for non-emergency diagnostic tests.', relatedHealthReferences: [] },
    ],
    unknowns: ['Whether a cholesterol blood test qualifies under this wording.'],
    nextSteps: ['Ask the insurer whether this test qualifies and whether pre-approval is needed.'],
    memoryProposal: { proposed: false },
  }, [source], { key: 'coverage', question: 'Does my policy cover an outpatient cholesterol blood test?' });

  assert.match(answer.answer, /covered up to MYR 1,000/);
  assert.doesNotMatch(answer.answer, /could not verify that policy interpretation/i);
  assert.deepEqual(answer.coverageAssessments.map((item) => item.kind), ['explicit_benefit', 'unclear']);
  assert.deepEqual(answer.citations, ['R1']);
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

test('a client-supplied profile identifier never becomes authority in the sanitized run', () => {
  const request = run({
    profileId: 'synthetic-foreign-profile',
    context: { facts: [], topics: [], links: [], treatments: [], visits: [], profileId: 'synthetic-foreign-profile' },
  });
  assert.equal(Object.hasOwn(request, 'profileId'), false);
  assert.equal(Object.hasOwn(request.context, 'profileId'), false);
});

test('profile revision runs are labeled separately from the first synthesis', () => {
  assert.deepEqual(classifyIntent('Create a concise first-pass synthesis of my selected health profile.'), {
    key: 'profile_summary', label: 'first profile synthesis',
  });
  assert.deepEqual(classifyIntent('Re-contextualize my selected health profile with the new note.'), {
    key: 'profile_summary', label: 'profile recontextualization',
  });
});

test('broad overall-health questions trigger synthesis of the selected profile', () => {
  assert.deepEqual(classifyIntent('How is my overall health?'), {
    key: 'profile_summary', label: 'overall health review',
  });
  assert.deepEqual(classifyIntent('Tell me how good my health is'), {
    key: 'profile_summary', label: 'overall health review',
  });
  assert.deepEqual(classifyIntent('How healthy am I?'), {
    key: 'profile_summary', label: 'overall health review',
  });
  assert.deepEqual(classifyIntent('How is my health state?'), {
    key: 'profile_summary', label: 'overall health review',
  });
  assert.deepEqual(classifyIntent('Can you summarize my health records?'), {
    key: 'profile_summary', label: 'overall health review',
  });
  assert.deepEqual(classifyIntent('What should I focus about my health?'), {
    key: 'profile_summary', label: 'overall health review',
  });
  assert.deepEqual(classifyIntent('What should I pay attention to in my health?'), {
    key: 'profile_summary', label: 'overall health review',
  });
  assert.deepEqual(classifyIntent('How does my cholesterol result sit alongside my weight and height?'), {
    key: 'profile_summary', label: 'connected health-results review',
  });
});

test('Ask routes five different questions using consented conversation and selected-video context', () => {
  const history = [
    { role: 'user', content: 'How is my overall health?' },
    { role: 'assistant', content: 'Your cholesterol result is above a common adult guide, and BMI is one useful clue.' },
    { role: 'user', content: 'Any of mine high?' },
    { role: 'assistant', content: 'Total cholesterol is high; one HbA1c entry also needs its unit checked.' },
  ];
  const selectedVideo = {
    title: 'Cholesterol Numbers: Mayo Clinic', publisher: 'Mayo Clinic', topic: 'Cholesterol',
    mediaType: 'video', summary: 'Explains what total cholesterol, LDL, HDL, and triglycerides can indicate.',
    url: 'https://youtu.be/abcdefghijk',
  };
  assert.equal(classifyIntent('How is my overall health?').key, 'profile_summary');
  assert.equal(classifyIntent('What do you know of me?').key, 'profile_summary');
  assert.equal(classifyIntent('Any of mine high?').key, 'result_check');
  assert.equal(classifyIntent('What does that mean for my cholesterol?', { history }).key, 'profile_follow_up');
  assert.equal(classifyIntent('What should I check next?', { history }).key, 'profile_follow_up');
  assert.equal(classifyIntent('cholesterol then?', { history }).key, 'profile_follow_up');
  assert.equal(classifyIntent('but am I having good vitals?', { history }).key, 'profile_follow_up');
  assert.equal(classifyIntent('What should I pick up from this?', { history, readingSource: selectedVideo }).key, 'selected_reading');
  assert.equal(classifyIntent('How does that connect to my results?', {
    history: [...history, { role: 'assistant', content: 'The selected video is about cholesterol.', readingSource: selectedVideo }],
  }).key, 'selected_reading', 'a follow-up can recover the video context from an earlier consented turn');
});

test('recent Ask history is bounded, sanitized, consent-gated, and omitted in symptom support', () => {
  const selectedVideo = {
    title: '  Cholesterol basics  ', publisher: 'Publisher', topic: 'Cholesterol', mediaType: 'video',
    summary: '  A short overview.  ', url: 'https://youtu.be/abcdefghijk',
  };
  const history = Array.from({ length: 10 }, (_, index) => ({
    role: index % 2 ? 'assistant' : 'user', content: 'turn ' + index, readingSource: selectedVideo,
  }));
  assert.deepEqual(run({ history, recentMessagesConsent: false }).history, []);
  const shared = run({ history, recentMessagesConsent: true });
  assert.equal(shared.history.length, 8);
  assert.equal(shared.history[0].content, 'turn 2');
  assert.equal(shared.history[0].readingSource.title, 'Cholesterol basics');
  assert.equal(shared.history[0].readingSource.summary, 'A short overview.');
  assert.equal(shared.history[0].readingSource.url, 'https://youtu.be/abcdefghijk');
  assert.deepEqual(run({ mode: 'symptom_support', history, recentMessagesConsent: true }).history, []);
});

test('health-record quality questions are distinct from questions about the person’s health', () => {
  for (const question of [
    'How good are my health records?',
    'Tell me how is good is my health records?',
    'Are my records complete and reliable?',
  ]) assert.deepEqual(classifyIntent(question), { key: 'record_quality', label: 'health record quality review' });

  assert.deepEqual(classifyIntent('Give me an insight about my health.'), {
    key: 'profile_summary', label: 'overall health review',
  });
});

test('record-quality answers preserve both sides of same-marker unit differences and avoid health-rating refusals', () => {
  const sources = [
    { reference: 'R1', id: 'fact:a1c-1', title: 'HbA1c', detail: '5.7 mmol/mol', date: '2026-10-02', source: 'Provided by you', status: 'confirmed', kind: 'user_record', category: 'Blood sugar' },
    { reference: 'R2', id: 'fact:a1c-2', title: 'HbA1c', detail: '5.8%', date: '2026-10-01', source: 'Provided by you', status: 'confirmed', kind: 'user_record', category: 'Blood sugar' },
    { reference: 'R3', id: 'fact:cholesterol-1', title: 'Total cholesterol', detail: '8.5 mmol/L', date: '2026-10-02', source: 'Provided by you', status: 'confirmed', kind: 'user_record', category: 'Cholesterol' },
    { reference: 'R4', id: 'fact:cholesterol-2', title: 'Total cholesterol', detail: '8.5 mg/dL', date: '2026-10-01', source: 'Provided by you', status: 'confirmed', kind: 'user_record', category: 'Cholesterol' },
  ];
  const answer = validateAnswer({
    answer: 'I can’t rate your overall health from these records alone. The current records show two HbA1c entries and one current cholesterol value; the 8.5 mg/dL value is an earlier saved version.',
    citations: ['R1', 'R2', 'R3'], unknowns: [], nextSteps: [], memoryProposal: { proposed: false },
  }, sources, { key: 'record_quality', question: 'Tell me how good are my health records?' });

  assert.match(answer.answer, /useful starting point/);
  assert.match(answer.answer, /HbA1c and total cholesterol entries use different units/);
  assert.match(answer.answer, /check the units and reference intervals against the original lab reports/);
  assert.doesNotMatch(answer.answer, /can’t rate|current records|earlier saved version|8\.5 mg\/dL/i);
  assert.deepEqual(answer.citations, ['R1', 'R2', 'R3', 'R4'], 'each conflicting original remains available in the cited evidence');
  assert.deepEqual(answer.unknowns, []);
  assert.deepEqual(answer.nextSteps, [
    'Check the HbA1c units against the original report',
    'Check the total cholesterol units against the original report',
  ]);
});

test('a concise grounded record-quality answer is not replaced when no unit discrepancy is present', () => {
  const sources = [{ reference: 'R1', id: 'fact:a1c', title: 'HbA1c', detail: '5.8%. Reference interval printed in report: 4.0–5.6%.', date: '2026-10-02', source: 'lab-report.pdf', status: 'reviewed', kind: 'user_record', category: 'Blood sugar' }];
  const answer = validateAnswer({
    answer: 'Your saved record is useful for tracking because it includes a date, unit, source, and the report’s reference interval.',
    citations: ['R1'], unknowns: [], nextSteps: ['Compare the next HbA1c result'], memoryProposal: { proposed: false },
  }, sources, { key: 'record_quality', question: 'Are my records useful?' });

  assert.match(answer.answer, /useful for tracking/);
  assert.deepEqual(answer.citations, ['R1']);
});

test('diet and food follow-ups are classified for general nutrition education', () => {
  assert.deepEqual(classifyIntent('What foods should I know about for cholesterol?'), {
    key: 'education', label: 'food and nutrition education',
  });
  assert.deepEqual(classifyIntent('Can you explain protein and fiber?'), {
    key: 'education', label: 'food and nutrition education',
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

test('broad Ask calculates BMI from same-date selected measures and keeps the birth date out of the request', () => {
  const request = run({
    derivedAgeConsent: true,
    question: 'What can you say about my overall health?',
    context: {
      facts: [
        { id: 'weight-1', label: 'Weight', value: '70 kg', date: '2026-10-03T00:00:00.000Z', category: 'Body measurement', source: 'Entered by you', status: 'confirmed' },
        { id: 'height-1', label: 'Height', value: '163 cm', date: '2026-10-03', category: 'Body measurement', source: 'Entered by you', status: 'confirmed' },
        { id: 'a1c-1', label: 'HbA1c', value: '5.6 mmol/mol', date: '2026-10-03', category: 'Blood sugar', source: 'Entered by you', status: 'confirmed' },
      ], topics: [], links: [], treatments: [], visits: [],
      demographics: { ageAtMeasurement: 38, measurementDate: '2026-10-03', dateOfBirth: '1987-10-04' },
    },
  });
  const evidence = createEvidenceTools(request.context);
  const result = evidence.execute('search_profile', { query: 'overall health' }, { includeAllSelected: true, includeDerivedMeasurements: true });
  const bmi = result.derivedMeasurements[0];
  assert.equal(request.context.demographics.ageAtMeasurement, 38);
  assert.equal(Object.hasOwn(request.context.demographics, 'dateOfBirth'), false);
  assert.equal(bmi.value, '26.3 kg/m²');
  assert.equal(bmi.ageAtMeasurement, 38);
  assert.match(bmi.method, /same date/);
  assert.deepEqual([bmi.weightReference, bmi.heightReference], ['R1', 'R2']);
  assert.ok(evidence.sources().some((source) => source.reference === bmi.educationalReference && source.url === 'https://www.cdc.gov/bmi/adult-calculator/index.html'));
  assert.ok(evidence.sources().some((source) => source.reference === bmi.a1cEducationalReference && source.url === 'https://www.niddk.nih.gov/health-information/diagnostic-tests/A1C-test'));
});

test('Ask ignores a calculated age that does not match the selected measurement date', () => {
  const request = run({ derivedAgeConsent: true, context: {
    facts: [
      { id: 'weight-1', label: 'Weight', value: '70 kg', date: '2026-10-03', category: 'Body measurement', source: 'Entered by you', status: 'confirmed' },
      { id: 'height-1', label: 'Height', value: '163 cm', date: '2026-10-03', category: 'Body measurement', source: 'Entered by you', status: 'confirmed' },
    ], topics: [], links: [], treatments: [], visits: [],
    demographics: { ageAtMeasurement: 38, measurementDate: '2026-10-02' },
  } });
  const evidence = createEvidenceTools(request.context);
  const result = evidence.execute('search_profile', { query: 'overall health' }, { includeAllSelected: true, includeDerivedMeasurements: true });
  assert.equal(result.derivedMeasurements[0].ageAtMeasurement, null);
  assert.ok(result.derivedMeasurements[0].educationalReference);
  assert.ok(evidence.sources().some((source) => source.reference === result.derivedMeasurements[0].educationalReference && source.url === 'https://www.cdc.gov/bmi/adult-calculator/index.html'));
});

test('symptom support never retains calculated demographic context', () => {
  const request = run({ mode: 'symptom_support', derivedAgeConsent: true, context: {
    facts: [], topics: [], links: [], treatments: [], visits: [],
    demographics: { ageAtMeasurement: 38, measurementDate: '2026-10-03' },
  } });
  assert.equal(request.context.demographics, null);
  assert.equal(request.derivedAgeConsent, false);
});

test('calculated age is dropped unless the user makes its separate share choice', () => {
  const request = run({ context: {
    facts: [], topics: [], links: [], treatments: [], visits: [],
    demographics: { ageAtMeasurement: 38, measurementDate: '2026-10-03' },
  } });
  assert.equal(request.context.demographics, null);
  assert.equal(request.derivedAgeConsent, false);
});

test('Ask resolves selected document claims and report details from the authorized repository', () => {
  const assertion = {
    id: 'assertion-lipid', profileId: 'demo-profile', sourceId: 'source-lab', claimId: 'claim-lipid',
    kind: 'lab_result', label: 'LDL cholesterol', value: '3.1', unit: 'mmol/L',
    referenceRange: '0 - 3.0', method: 'Direct measurement',
    sourceLocation: { page: 1, quote: 'LDL cholesterol 3.1 mmol/L; reference range 0 - 3.0 mmol/L' },
    effectiveAt: '2026-09-20', evidenceState: 'user_confirmed', validUntil: null,
  };
  const source = {
    id: 'source-lab', profileId: 'demo-profile', displayName: 'September health report.pdf',
    origin: 'document_extraction', documentContext: {
      documentType: 'Lipid panel', dates: [{ kind: 'collected_at', value: '20 Sep 2026', page: 1, quote: 'Collected 20 Sep 2026' }],
      entities: [], notes: [],
    },
  };
  const body = {
    sourceContextConsent: true,
    context: {
      facts: [{ id: 'local-fact-id', sourceId: 'source-lab', sourceClaimId: 'claim-lipid', label: 'Spoofed lab result', value: '9000 mg/dL', date: '2099-01-01', category: 'Insurance coverage', source: 'made-up.pdf', status: 'reviewed' }],
      documentSources: [{ id: 'source-lab', title: 'Spoofed document', documentType: 'Policy', dates: [], entities: [], notes: [{ kind: 'other', value: 'client supplied text', quote: 'invented quote' }] }],
    },
  };

  const resolved = resolveAuthorizedAskContext(body, { profileId: 'demo-profile', assertions: [assertion], sources: [source] });
  assert.deepEqual(resolved.context.facts, [{
    id: 'local-fact-id', label: 'LDL cholesterol', value: '3.1 mmol/L', date: '2026-09-20',
    category: 'lab_result', source: 'September health report.pdf', status: 'reviewed',
    referenceRange: '0 - 3.0', method: 'Direct measurement',
    sourceQuote: 'LDL cholesterol 3.1 mmol/L; reference range 0 - 3.0 mmol/L', page: 1,
  }]);
  assert.deepEqual(resolved.context.documentSources, [{
    id: 'source-lab', title: 'September health report.pdf', documentType: 'Lipid panel',
    dates: [{ kind: 'collected_at', value: '20 Sep 2026', page: 1, quote: 'Collected 20 Sep 2026' }],
    entities: [], notes: [],
  }]);
  const authorized = sanitizeRunBody({ consentConfirmed: true, question: 'How is my overall health?', ...resolved });
  const evidence = createEvidenceTools(authorized.context);
  const search = evidence.execute('search_profile', { query: 'overall health' }, { includeAllSelected: true });
  assert.match(search.results[0].detail, /Reference interval printed in report: 0 - 3\.0/);
  assert.match(search.results[0].detail, /Source wording: “LDL cholesterol 3\.1 mmol\/L; reference range 0 - 3\.0 mmol\/L” \(page 1\)/);
});

test('Ask refuses a selected claim unless it is current, user-confirmed, and belongs to the authorized profile and source', () => {
  const assertion = {
    id: 'assertion-lipid', profileId: 'demo-profile', sourceId: 'source-lab', claimId: 'claim-lipid',
    kind: 'lab_result', label: 'LDL cholesterol', value: '3.1', unit: 'mmol/L',
    effectiveAt: '2026-09-20', evidenceState: 'user_confirmed', validUntil: null,
  };
  const source = { id: 'source-lab', profileId: 'demo-profile', displayName: 'September health report.pdf', origin: 'document_extraction' };
  const body = { context: { facts: [{ id: 'local-fact-id', sourceId: 'source-lab', sourceClaimId: 'claim-lipid', label: 'LDL', value: '3.1' }] } };
  for (const invalidAssertion of [
    { ...assertion, profileId: 'another-profile' }, { ...assertion, sourceId: 'another-source' },
    { ...assertion, evidenceState: 'needs_review' }, { ...assertion, validUntil: '2026-09-25T00:00:00.000Z' },
  ]) assert.throws(() => resolveAuthorizedAskContext(body, {
    profileId: 'demo-profile', assertions: [invalidAssertion], sources: [source],
  }), /no longer available for review/i);
});

test('Ask includes earlier source values when the user explicitly selects them for this question', () => {
  const earlierAssertion = {
    id: 'assertion-earlier', profileId: 'demo-profile', sourceId: 'source-lab', claimId: 'claim-lipid',
    kind: 'lab_result', label: 'LDL cholesterol', value: '3.1', unit: 'mmol/L',
    effectiveAt: '2026-01-20', evidenceState: 'superseded', validFrom: '2026-01-21T08:00:00.000Z',
    validUntil: '2026-06-01T08:00:00.000Z', recordedAt: '2026-01-21T08:00:00.000Z',
  };
  const source = { id: 'source-lab', profileId: 'demo-profile', displayName: 'Lipid report.pdf', origin: 'document_extraction' };
  const earlierFact = {
    id: 'local-earlier-fact', label: 'LDL cholesterol', value: '3.1 mmol/L', date: '2026-01-20',
    category: 'lab_result', source: 'Lipid report.pdf', status: 'reviewed', reviewState: 'user_confirmed',
    sourceId: 'source-lab', sourceClaimId: 'claim-lipid', validFrom: '2026-01-21T08:00:01.000Z',
    validUntil: '2026-06-01T08:00:01.000Z',
  };
  const body = {
    question: 'What should I know about my health profile?', consentConfirmed: true, historyContextConsent: true,
    context: { facts: [earlierFact] },
  };

  const resolved = resolveAuthorizedAskContext(body, { profileId: 'demo-profile', assertions: [earlierAssertion], sources: [source] });
  assert.deepEqual(resolved.context.facts, [{
    id: 'local-earlier-fact', label: 'LDL cholesterol', value: '3.1 mmol/L', date: '2026-01-20',
    category: 'lab_result', source: 'Lipid report.pdf', status: 'reviewed',
    referenceRange: '', method: '', sourceQuote: '', page: null,
    validFrom: '2026-01-21T08:00:00.000Z', validUntil: '2026-06-01T08:00:00.000Z', versionStatus: 'earlier',
  }]);
  const sanitized = sanitizeRunBody(resolved);
  assert.equal(sanitized.historyContextConsent, true);
  assert.equal(sanitized.context.facts[0].versionStatus, 'earlier');
  const evidence = createEvidenceTools(sanitized.context);
  evidence.execute('search_profile', { query: 'LDL history' });
  assert.match(evidence.sources()[0].detail, /no longer current/i);

  for (const invalidBody of [
    { ...body, historyContextConsent: false },
    { ...body, context: { facts: [{ ...earlierFact, value: 'spoofed result' }] } },
    { ...body, context: { facts: [{ ...earlierFact, reviewState: 'user_retracted' }] } },
  ]) assert.throws(() => resolveAuthorizedAskContext(invalidBody, {
    profileId: 'demo-profile', assertions: [earlierAssertion], sources: [source],
  }), /no longer available for review/i);
});

test('Ask sanitizer drops earlier values without history consent and an explicit history question', () => {
  const earlierFact = {
    id: 'earlier', label: 'LDL cholesterol', value: '3.1 mmol/L', date: '2026-01-20', category: 'lab_result',
    source: 'Lipid report.pdf', status: 'reviewed', validFrom: '2026-01-21T08:00:00.000Z',
    validUntil: '2026-06-01T08:00:00.000Z', versionStatus: 'earlier',
  };
  const sanitized = sanitizeRunBody({ consentConfirmed: true, question: 'What does LDL mean?', context: { facts: [earlierFact] } });
  assert.deepEqual(sanitized.context.facts, []);
});

test('Ask keeps unlinked on-device facts as user-provided context and drops source detail when that scope is off', () => {
  const source = {
    id: 'source-lab', profileId: 'demo-profile', displayName: 'September health report.pdf', origin: 'document_extraction',
    documentContext: { documentType: 'Lipid panel', dates: [], entities: [], notes: [] },
  };
  const body = {
    sourceContextConsent: false,
    context: {
      facts: [{ id: 'manual-fact', label: 'Headache', value: 'Started yesterday', date: '2026-09-27', category: 'Symptoms', source: 'Made-up source.pdf', status: 'reviewed' }],
      documentSources: [{ id: 'source-lab', title: 'Report', documentType: 'Report', dates: [], entities: [], notes: [] }],
    },
  };
  const resolved = resolveAuthorizedAskContext(body, { profileId: 'demo-profile', assertions: [], sources: [source] });
  assert.equal(resolved.context.facts[0].source, 'Provided by you for this answer');
  assert.equal(resolved.context.facts[0].status, 'confirmed');
  assert.deepEqual(resolved.context.documentSources, []);
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

test('a clear health statement becomes a review-only self-reported context proposal', () => {
  const answer = validateAnswer({
    answer: 'I can answer your question using saved records.', citations: [], unknowns: [], nextSteps: [], memoryProposal: { proposed: false },
  }, [], { key: 'profile', question: 'I was diagnosed with asthma. Is this in my health profile?' });

  assert.deepEqual(answer.memoryProposal, {
    label: 'Self-reported condition',
    value: 'asthma',
    reason: 'You mentioned “I was diagnosed with asthma” in your question. Review it before saving; this is your self-reported context, not a verified medical conclusion.',
    sourceKind: 'user_statement',
    sourceReferences: [],
  });
  assert.deepEqual(answer.citations, [], 'a question statement is not a source citation');
});

test('a question or symptom does not create a health-context proposal', () => {
  for (const question of ['Could I have diabetes?', 'I have been getting headaches.']) {
    const answer = validateAnswer({
      answer: 'I cannot infer that from this information.', citations: [], unknowns: [], nextSteps: [], memoryProposal: { proposed: false },
    }, [], { key: 'profile', question });
    assert.equal(answer.memoryProposal, null, question);
  }
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

test('meaning is concise public education and stays linked to cited trusted sources', () => {
  const sources = [
    { reference: 'R1', id: 'fact:result', kind: 'user_record', category: 'Lab result', title: 'Synthetic result' },
    { reference: 'W1', id: 'web:W1', kind: 'external_source', category: 'Education', title: 'Trusted public source' },
  ];
  const answer = validateAnswer({
    answer: 'The selected report lists a synthetic result.', citations: ['R1', 'W1'],
    meaning: { text: 'A1C estimates average blood sugar over roughly three months.', citations: ['W1'] },
    unknowns: [], nextSteps: [], memoryProposal: { proposed: false },
  }, sources, { key: 'results', question: 'What does A1C measure?' });

  assert.deepEqual(answer.meaning, { text: 'A1C estimates average blood sugar over roughly three months.', citations: ['W1'] });
  assert.deepEqual(answer.citations, ['R1', 'W1']);

  const generalRiskContext = validateAnswer({
    answer: 'The selected report lists a synthetic result.', citations: ['W1'],
    meaning: { text: 'High blood pressure is associated with stroke risk over time.', citations: ['W1'] },
    unknowns: [], nextSteps: [], memoryProposal: { proposed: false },
  }, sources, { key: 'results', question: 'What is high blood pressure?' });
  assert.equal(generalRiskContext.meaning.text, 'High blood pressure is associated with stroke risk over time.', 'general sourced education can mention population-level risk without assigning a risk to the person');
});

test('meaning is empty for legacy, uncited, non-public, unsafe, or overlong explanations', () => {
  const sources = [
    { reference: 'R1', id: 'fact:result', kind: 'user_record', category: 'Lab result', title: 'Synthetic result' },
    { reference: 'W1', id: 'web:W1', kind: 'external_source', category: 'Education', title: 'Trusted public source' },
  ];
  const base = { answer: 'The selected record was reviewed.', citations: ['R1', 'W1'], unknowns: [], nextSteps: [], memoryProposal: { proposed: false } };
  const validate = (meaning, intent = 'results') => validateAnswer({ ...base, ...(meaning === undefined ? {} : { meaning }) }, sources, { key: intent, question: 'Explain this result.' });

  assert.deepEqual(validate(undefined).meaning, { text: '', citations: [] }, 'older answer payloads remain valid');
  assert.deepEqual(validate({ text: 'A1C estimates average blood sugar over roughly three months.', citations: ['R1'] }).meaning, { text: '', citations: [] }, 'a personal record cannot source general medical education');
  assert.deepEqual(validate({ text: 'A1C estimates average blood sugar over roughly three months.', citations: ['W404'] }).meaning, { text: '', citations: [] }, 'unknown source references are rejected');
  assert.deepEqual(validate({ text: 'Your result means you have diabetes.', citations: ['W1'] }).meaning, { text: '', citations: [] }, 'personal diagnosis language is rejected');
  assert.deepEqual(validate({ text: 'A1C estimates average blood sugar over roughly three months.', citations: ['W1'] }, 'coverage').meaning, { text: '', citations: [] }, 'policy meaning uses its dedicated wording and assessment');
  assert.deepEqual(validate({ text: `${'A1C estimates average blood sugar. '.repeat(56)}`, citations: ['W1'] }).meaning, { text: '', citations: [] }, 'long explanations do not become a text dump');
});
