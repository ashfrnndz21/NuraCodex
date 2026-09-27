import test from 'node:test';
import assert from 'node:assert/strict';
import { answerFirstView, askAnswerFirstView, askMeaningView, coveragePanelReferences, groupAskEvidence } from './askAnswerPresentation.mjs';

test('short answers remain complete and do not get an unnecessary disclosure control', () => {
  const answer = 'The selected report lists a cholesterol result of 4.8 mmol/L.';
  assert.deepEqual(answerFirstView(answer), { text: answer, expandable: false });
});

test('meaning presentation is optional and includes only compact text with returned public source citations', () => {
  const publicSource = { reference: 'W1', kind: 'external_source', title: 'Trusted health source' };
  const privateRecord = { reference: 'R1', kind: 'user_record', title: 'Synthetic result' };
  assert.equal(askMeaningView(undefined, [publicSource]), null, 'legacy answers have no meaning section');
  assert.deepEqual(askMeaningView({ text: 'A1C estimates average blood sugar over roughly three months.', citations: ['W1', 'R1', 'W404'] }, [publicSource, privateRecord]), {
    text: 'A1C estimates average blood sugar over roughly three months.', citations: ['W1'], sources: [publicSource],
  });
  assert.equal(askMeaningView({ text: 'An explanation without a source.', citations: ['W404'] }, [publicSource]), null);
  assert.equal(askMeaningView({ text: `${'A compact sourced explanation. '.repeat(56)}`, citations: ['W1'] }, [publicSource]), null);
});

test('long answers lead with the first concise sentence while the original remains available to expand', () => {
  const answer = `${'This is a supported sentence. '.repeat(18)}The final source note remains visible after expansion.`;
  const firstView = answerFirstView(answer, 200);
  assert.equal(firstView.expandable, true);
  assert.match(firstView.text, /\.$/);
  assert.equal(firstView.text, 'This is a supported sentence.');
  assert.ok(firstView.text.length <= 200);
  assert.ok(answer.startsWith(firstView.text));
  assert.match(answer.slice(firstView.text.length), /final source note remains visible/);
});

test('a short opening sentence does not pull the next paragraph into the first view', () => {
  const answer = `The report is dated 12 September. ${'This is more supporting detail. '.repeat(12)}`;
  assert.deepEqual(answerFirstView(answer), { text: 'The report is dated 12 September.', expandable: true });
});

test('a single unusually long sentence is shortened at a word boundary', () => {
  const answer = `A detailed supported explanation ${'from the selected source '.repeat(60)}`;
  const firstView = answerFirstView(answer, 360);
  assert.equal(firstView.expandable, true);
  assert.ok(firstView.text.length <= 360);
  assert.doesNotMatch(firstView.text, /\s$/);
  assert.ok(answer.startsWith(firstView.text));
});

test('Ask first view keeps only explicitly cited returned evidence beside the answer', () => {
  const report = { reference: 'R1', title: 'Lipid report', detail: 'LDL cholesterol: 3.2 mmol/L.', source: 'Saved report', date: '2025-04-22' };
  const unrelated = { reference: 'R2', title: 'Sleep note', detail: 'You wrote that sleep was interrupted.' };
  const view = askAnswerFirstView({
    answer: 'Your selected report lists LDL cholesterol at 3.2 mmol/L. The wider profile does not show another result in any of the information included in this review.',
    citations: ['R1', 'R1'],
    unknowns: ['No earlier LDL result was selected.'],
    sources: [report, unrelated],
    maxCharacters: 120,
  });

  assert.equal(view.shortAnswer, 'Your selected report lists LDL cholesterol at 3.2 mmol/L.');
  assert.deepEqual(view.evidence.map(({ reference, source }) => [reference, source?.title]), [['R1', 'Lipid report']]);
  assert.deepEqual(view.unclear, ['No earlier LDL result was selected.']);
  assert.equal(view.answerExpandable, true);
  assert.equal(view.answer, 'Your selected report lists LDL cholesterol at 3.2 mmol/L. The wider profile does not show another result in any of the information included in this review.');
});

test('Ask first view preserves unavailable citations as unavailable and does not invent evidence', () => {
  const view = askAnswerFirstView({
    answer: 'The selected information does not answer this question.',
    citations: ['R4'],
    unknowns: [],
    sources: [{ reference: 'R5', title: 'Uncited item', detail: 'Not cited by the answer.' }],
  });

  assert.deepEqual(view.evidence, [{ reference: 'R4', source: null, detail: null }]);
  assert.deepEqual(view.unclear, []);
  assert.equal(view.expandable, false);
});

test('Ask first view shortens long source excerpts but retains their exact full detail for expansion', () => {
  const detail = `${'Source wording for the selected report. '.repeat(8)}Final clause remains available.`;
  const view = askAnswerFirstView({
    answer: 'The report contains a result.',
    citations: ['R1'],
    sources: [{ reference: 'R1', title: 'Report', detail }],
    evidenceCharacters: 120,
  });

  assert.equal(view.expandable, true);
  assert.equal(view.evidence[0].detail.expandable, true);
  assert.ok(view.evidence[0].detail.text.length <= 120);
  assert.equal(view.evidence[0].source.detail, detail);
});

test('Ask evidence presentation keeps saved records, document details, selected areas, user links and public sources distinct', () => {
  const evidence = [
    { source: { kind: 'user_record' } },
    { source: { kind: 'treatment_record' } },
    { source: { kind: 'care_visit' } },
    { source: { kind: 'document_context' } },
    { source: { kind: 'chosen_topic' } },
    { source: { kind: 'user_link' } },
    { source: { kind: 'external_source' } },
    { source: null },
  ];
  const groups = groupAskEvidence(evidence);

  assert.equal(groups.records.length, 3);
  assert.equal(groups.documentDetails.length, 1);
  assert.equal(groups.selectedAreas.length, 1);
  assert.equal(groups.savedLinks.length, 1);
  assert.equal(groups.publicSources.length, 1);
  assert.equal(groups.unavailable.length, 1);
  assert.equal(groups.other.length, 0);
});

test('coverage-panel references suppress only policy and related evidence already rendered there', () => {
  const assessments = [
    { policyReference: 'R1', relatedHealthReferences: ['R2', 'R404'] },
    { policyReference: 'R1', relatedHealthReferences: ['R3'] },
  ];
  const sources = [
    { reference: 'R1', title: 'Policy exclusion', detail: 'The policy term.' },
    { reference: 'R2', title: 'Selected health detail', detail: 'A saved detail.' },
    { reference: 'R3', title: 'Another selected record', detail: 'Another detail.' },
    { reference: 'R9', title: 'Unrelated citation', detail: 'Keep this source in the evidence list.' },
  ];
  const suppressedReferences = coveragePanelReferences(assessments, sources);
  const view = askAnswerFirstView({
    answer: 'The policy wording is unclear.',
    citations: ['R1', 'R2', 'R3', 'R9'],
    sources,
    excludedReferences: suppressedReferences,
  });

  assert.deepEqual(suppressedReferences, ['R1', 'R2', 'R3']);
  assert.deepEqual(view.suppressedReferences, ['R1', 'R2', 'R3']);
  assert.deepEqual(view.evidence.map(({ reference }) => reference), ['R9']);
  assert.equal(coveragePanelReferences([], sources).length, 0);
});
