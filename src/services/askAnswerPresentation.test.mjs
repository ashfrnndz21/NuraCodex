import test from 'node:test';
import assert from 'node:assert/strict';
import { answerFirstView, askAnswerFirstView, askEvidencePreview, askFollowUpOption, askMeaningView, askRelevanceSummary, askSelectedReadingFollowUps, sameAskPublicSource, conversationalAnswerBlocks, conversationalAnswerPreview, coveragePanelReferences, groupAskEvidence } from './askAnswerPresentation.mjs';

test('Ask evidence preview returns an empty compact summary when no cited evidence exists', () => {
  assert.deepEqual(askEvidencePreview([]), { visible: [], hiddenCount: 0, totalCount: 0 });
});

test('Ask evidence preview shows all three distinct cited items when there are three', () => {
  const evidence = ['R1', 'R2', 'R3'].map((reference) => ({ reference, title: `Source ${reference}` }));
  assert.deepEqual(askEvidencePreview(evidence), { visible: evidence, hiddenCount: 0, totalCount: 3 });
});

test('Ask evidence preview limits the first view to three and preserves the full list for expansion', () => {
  const evidence = ['R1', 'R2', 'R3', 'R4', 'R5'].map((reference) => ({ reference, title: `Source ${reference}` }));
  const original = evidence.slice();
  const preview = askEvidencePreview(evidence);

  assert.deepEqual(preview, { visible: evidence.slice(0, 3), hiddenCount: 2, totalCount: 5 });
  assert.deepEqual(evidence, original, 'the full evidence list remains unchanged for expansion');
});

test('Ask evidence preview de-duplicates citations by trimmed reference and keeps their first order', () => {
  const first = { reference: 'R1', title: 'First source row' };
  const duplicate = { reference: ' R1 ', title: 'Repeated citation' };
  const second = { reference: 'R2', title: 'Second source row' };
  const third = { reference: 'R3', title: 'Third source row' };
  const preview = askEvidencePreview([first, duplicate, second, third]);

  assert.deepEqual(preview, { visible: [first, second, third], hiddenCount: 0, totalCount: 3 });
});

test('Ask evidence preview omits excluded references from both visible and additional counts', () => {
  const evidence = ['R1', 'R2', 'R3', 'R4', 'R5'].map((reference) => ({ reference, title: `Source ${reference}` }));
  const preview = askEvidencePreview(evidence, { limit: 3, excludedReferences: ['R2', ' R4 '] });

  assert.deepEqual(preview, { visible: [evidence[0], evidence[2], evidence[4]], hiddenCount: 0, totalCount: 3 });
  assert.deepEqual(evidence.map((item) => item.reference), ['R1', 'R2', 'R3', 'R4', 'R5'], 'suppressed rows remain in the caller-owned list but are not displayed');
});

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

test('conversational answers preserve headings, bullets, and paragraph breaks', () => {
  assert.deepEqual(conversationalAnswerBlocks('A useful opening sentence.\n\n**What to notice**\n- Compare each value with the range printed on its report.\n2) Check the date.'), [
    { kind: 'paragraph', text: 'A useful opening sentence.' },
    { kind: 'heading', text: 'What to notice' },
    { kind: 'bullet', marker: '•', text: 'Compare each value with the range printed on its report.' },
    { kind: 'number', marker: '2.', text: 'Check the date.' },
  ]);
});

test('long plain-language answers are split into short readable paragraph groups', () => {
  const blocks = conversationalAnswerBlocks('First point is clear. Second point adds context. Third point gives a next step. Fourth point closes the answer.');
  assert.deepEqual(blocks.map(({ text }) => text), [
    'First point is clear. Second point adds context.',
    'Third point gives a next step. Fourth point closes the answer.',
  ]);
});

test('conversational preview skips a report inventory lead and keeps a short answer expandable', () => {
  const answer = 'The records reviewed include: HbA1c 5.7 mg/dl dated October 1, 2026 (R1); weight 70 kg and height 165 cm, both dated October 1, 2026 (R2, R3). Cholesterol and blood sugar are selected health areas, not confirmed diagnoses. The HbA1c record does not include a reference interval or interpretation, so this record alone cannot establish what it means medically. To support overall health, focus on regular physical activity, a varied nutrient-dense eating pattern, adequate sleep, stress management, avoiding tobacco, moderating alcohol if applicable, and keeping preventive-care visits and screenings up to date.';
  const preview = conversationalAnswerPreview(answer);

  assert.doesNotMatch(preview.text, /records reviewed include|October 1, 2026|selected health areas/);
  assert.match(preview.text, /reference interval/);
  assert.match(preview.text, /physical activity/);
  assert.ok(preview.text.split(/\s+/).length <= 90);
  assert.equal(preview.expandable, true);
});

test('conversational preview keeps a short useful answer complete', () => {
  const answer = 'This video explains how cholesterol levels can be influenced by family history, health conditions, and daily habits. The useful takeaway is to understand LDL, HDL, and triglycerides together rather than judging one number alone.';
  assert.deepEqual(conversationalAnswerPreview(answer), { text: answer, expandable: false });
});

test('conversational preview keeps short, intentional health-answer paragraphs', () => {
  const answer = 'Your cholesterol stands out: total cholesterol is high at 7.9 mmol/L and LDL cholesterol is very high at 5.6 mmol/L, compared with common adult guides; triglycerides are within guide at 1.4 mmol/L.\n\nAt 70 kg and 163 cm, your BMI is 26.3. If you are 20 or older, it is in the adult overweight screening range; BMI is one clue, not a diagnosis.\n\nA routine clinician review is sensible. Your age helps tailor next steps; how old are you?';
  const preview = conversationalAnswerPreview(answer);
  assert.deepEqual(preview, { text: answer, expandable: false });
  assert.equal(conversationalAnswerBlocks(preview.text).length, 3);
});

test('the educational video answer stays visible instead of being cut to a short teaser', () => {
  const answer = 'This video asks why cholesterol can be high. A key idea is that levels can be shaped by inherited traits, health conditions and lifestyle, so food is only one part of the picture. Since cholesterol is one of the areas you follow, it is useful to understand what LDL, HDL and triglycerides each tell you on a lipid panel.';
  assert.deepEqual(conversationalAnswerPreview(answer), { text: answer, expandable: false });
});

test('follow-up button labels are short, contextual, and still open a natural question', () => {
  assert.deepEqual(askFollowUpOption('Review blood pressure and lipid results at a routine healthcare visit, if available.'), {
    label: 'Blood pressure & lipid results',
    question: 'What should I know about my blood pressure and lipid results?',
  });
  assert.deepEqual(askFollowUpOption('Discuss the HbA1c value with a clinician because its record lacks units context, a reference interval, and interpretation.'), {
    label: 'HbA1c value',
    question: 'What should I know about the HbA1c value?',
  });
  assert.deepEqual(askFollowUpOption('Explain LDL vs HDL'), { label: 'Explain LDL vs HDL', question: 'Explain LDL vs HDL' });
});

test('follow-up questions become concise learning chips and preserve a useful Ask prompt', () => {
  assert.deepEqual(askFollowUpOption('What should I notice about my saved LDL cholesterol while I watch?'), {
    label: 'Understand saved LDL cholesterol',
    question: 'What should I notice about my saved LDL cholesterol while I watch?',
  });
  assert.deepEqual(askFollowUpOption('What does my lipid panel show?'), {
    label: 'Understand lipid panel',
    question: 'What does my lipid panel show?',
  });
  assert.deepEqual(askFollowUpOption('How can diet affect my cholesterol results?'), {
    label: 'Diet & cholesterol results',
    question: 'How can diet affect my cholesterol results?',
  });
  assert.deepEqual(askFollowUpOption('What should I learn about this video?'), {
    label: 'Key takeaway',
    question: 'What should I learn about this video?',
  });
});

test('selected video follow-ups stay available and personalize the second chip to cited records', () => {
  assert.deepEqual(askSelectedReadingFollowUps([], {
    source: { mediaType: 'video', title: 'What causes high cholesterol?', topic: 'Cholesterol' },
    records: [{ title: 'LDL cholesterol' }],
  }), [
    { label: 'Key takeaway', question: 'What should I learn about this video?' },
    { label: 'Understand saved LDL cholesterol', question: 'What should I notice about my saved LDL cholesterol while I watch?' },
  ]);
  assert.equal(askSelectedReadingFollowUps(['Explain LDL vs HDL'], {
    source: { mediaType: 'video', title: 'Cholesterol basics', topic: 'Cholesterol' },
  }).length, 2, 'one service suggestion is filled with a context-aware video follow-up');
});

test('selected-source citation matching recognizes alternate YouTube URL forms without hiding other videos', () => {
  assert.equal(sameAskPublicSource(
    { url: 'https://youtu.be/abcdefghijk' },
    { url: 'https://www.youtube.com/watch?v=abcdefghijk&feature=share' },
  ), true);
  assert.equal(sameAskPublicSource(
    { url: 'https://youtube.com/watch?v=abcdefghijk' },
    { url: 'https://youtube.com/watch?v=zzzzzzzzzzz' },
  ), false);
  assert.equal(sameAskPublicSource(
    { url: 'https://www.example.org/article?utm_source=feed' },
    { url: 'https://example.org/article' },
  ), true);
});

test('relevance explanation names the topic match and only records actually cited', () => {
  assert.equal(askRelevanceSummary({
    source: { mediaType: 'video', topic: 'Cholesterol' },
    records: [{ title: 'LDL cholesterol' }],
  }), 'This video appeared because you follow Cholesterol. Nura connected the explanation to LDL cholesterol.');
  assert.equal(askRelevanceSummary({ source: { mediaType: 'video', topic: 'Blood sugar' } }), 'This video appeared because you follow Blood sugar. It gives background on the topic.');
  assert.equal(askRelevanceSummary({ records: [{ title: 'HbA1c' }], hasSelectedArea: true }), 'Nura connected this answer to HbA1c from your saved health details.');
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
