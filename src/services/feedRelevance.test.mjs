import assert from 'node:assert/strict';
import test from 'node:test';
import { rankHealthFeedItemsByLocalContext } from './feedRelevance.mjs';

const topics = [
  { id: 'cholesterol', label: 'Cholesterol' },
  { id: 'blood-sugar', label: 'Blood sugar' },
];

test('locally ranks first-pull sources by current registry details while preserving selected topic coverage', () => {
  const items = [
    { id: 'cholesterol-overview', topic: 'Cholesterol', title: 'Cholesterol basics', detail: 'A general overview.' },
    { id: 'linked-lipid-guide', topic: 'Cholesterol', title: 'A lipid panel explains an LDL result', detail: 'How the report relates these measures.' },
    { id: 'direct-ldl-video', topic: 'Cholesterol', title: 'Understanding LDL cholesterol', detail: 'A video about LDL results.' },
    { id: 'sugar-guide', topic: 'Blood sugar', title: 'Understanding HbA1c', detail: 'A general blood sugar guide.' },
  ];
  const facts = [
    { id: 'ldl-current', label: 'LDL cholesterol', category: 'Lab result', value: '93 mg/dL', date: '2026-09-10', status: 'reviewed', reviewState: 'user_confirmed' },
    { id: 'a1c-current', label: 'HbA1c', category: 'Lab result', value: '5.7%', status: 'confirmed', reviewState: 'user_confirmed' },
    { id: 'ldl-old', label: 'LDL cholesterol', category: 'Lab result', value: '190 mg/dL', date: '2025-01-10', status: 'reviewed', reviewState: 'user_confirmed', validUntil: '2026-01-01' },
    { id: 'unreviewed-marker', label: 'LDL cholesterol trend', category: 'Lab result', value: 'Needs review', status: 'reviewed', reviewState: 'candidate' },
  ];
  const treatments = [
    { id: 'current-treatment', name: 'Ezetimibe', purpose: 'Cholesterol', status: 'current' },
    { id: 'past-treatment', name: 'Old medicine', purpose: 'Cholesterol', status: 'past' },
  ];
  const links = [
    { id: 'ldl-report-link', from: 'fact:ldl-current', to: 'asset:lipid-panel', relationType: 'same_source', label: 'LDL result linked to lipid panel report' },
    { id: 'unreviewed-link', from: 'fact:unreviewed-marker', to: 'asset:old-report', relationType: 'user_note', label: 'Unreviewed LDL trend' },
  ];
  const registryBriefs = [{
    topicLabel: 'Cholesterol',
    citations: [{ title: 'Lipid panel report and LDL results' }],
  }];

  const ranked = rankHealthFeedItemsByLocalContext(items, { topics, facts, treatments, links, registryBriefs });

  assert.deepEqual(ranked.map((item) => item.id), [
    'direct-ldl-video', 'linked-lipid-guide', 'cholesterol-overview', 'sugar-guide',
  ]);
  assert.deepEqual(items.map((item) => item.id), [
    'cholesterol-overview', 'linked-lipid-guide', 'direct-ldl-video', 'sugar-guide',
  ], 'Ranking must not mutate the provider response or persisted source list.');
  assert.doesNotMatch(JSON.stringify(ranked), /93 mg\/dL|190 mg\/dL|5\.7%/);
});

test('a source linked in the Medical Registry ranks ahead of an otherwise equal item', () => {
  const ranked = rankHealthFeedItemsByLocalContext([
    { id: 'same-marker-unlinked', topic: 'Cholesterol', title: 'LDL cholesterol overview', detail: 'A short general guide.' },
    { id: 'same-marker-linked', topic: 'Cholesterol', title: 'LDL cholesterol overview', detail: 'A lipid panel report guide for the LDL result.' },
  ], {
    topics: [{ id: 'cholesterol', label: 'Cholesterol' }],
    facts: [{ id: 'ldl-current', label: 'LDL cholesterol', category: 'Lab result', status: 'reviewed', reviewState: 'user_confirmed' }],
    links: [{ id: 'ldl-report-link', from: 'fact:ldl-current', to: 'asset:lipid-panel', relationType: 'same_source', label: 'LDL result linked to lipid panel report' }],
    registryBriefs: [{ topicLabel: 'Cholesterol', citations: [{ title: 'Lipid panel report and LDL results' }] }],
  });

  assert.deepEqual(ranked.map((item) => item.id), ['same-marker-linked', 'same-marker-unlinked']);
});

test('unreviewed and superseded health details do not influence local source ranking', () => {
  const items = [
    { id: 'first', topic: 'Blood sugar', title: 'Blood sugar overview', detail: 'General education.' },
    { id: 'candidate-match', topic: 'Blood sugar', title: 'Unreviewed marker trend', detail: 'Not accepted.' },
    { id: 'future-match', topic: 'Blood sugar', title: 'Future blood sugar marker guide', detail: 'Not active yet.' },
  ];
  const ranked = rankHealthFeedItemsByLocalContext(items, {
    topics: [{ id: 'blood-sugar', label: 'Blood sugar' }],
    facts: [
      { id: 'candidate', label: 'Unreviewed marker trend', category: 'Lab result', status: 'reviewed', reviewState: 'candidate' },
      { id: 'past', label: 'Blood sugar trend', category: 'Lab result', status: 'confirmed', reviewState: 'user_confirmed', validUntil: '2026-01-01' },
      { id: 'future', label: 'Future blood sugar marker guide', value: '5.7%', category: 'Lab result', status: 'confirmed', reviewState: 'user_confirmed', validFrom: '2999-01-01' },
    ],
    treatments: [{ id: 'past-med', name: 'Old medicine', purpose: 'Blood sugar', status: 'past' }],
  });

  assert.deepEqual(ranked.map((item) => item.id), ['first', 'candidate-match', 'future-match']);
});

test('only the latest saved Registry brief can influence local relevance', () => {
  const ranked = rankHealthFeedItemsByLocalContext([
    { id: 'old-reference', topic: 'Cholesterol', title: 'An earlier lipid reference', detail: 'General guide.' },
    { id: 'current-reference', topic: 'Cholesterol', title: 'Current lipid panel review', detail: 'General guide.' },
  ], {
    topics: [{ id: 'cholesterol', label: 'Cholesterol' }],
    registryBriefs: [
      { id: 'old', topicId: 'cholesterol', topicLabel: 'Cholesterol', createdAt: '2025-01-01T00:00:00.000Z', citations: [{ title: 'An earlier lipid reference' }] },
      { id: 'current', topicId: 'cholesterol', topicLabel: 'Cholesterol', createdAt: '2026-01-01T00:00:00.000Z', citations: [{ title: 'Current lipid panel review' }] },
    ],
  });

  assert.deepEqual(ranked.map((item) => item.id), ['current-reference', 'old-reference']);
});

test('recent Ask question cues can reorder already-retrieved sources locally without leaving the selected topic', () => {
  const items = [
    { id: 'overview', topic: 'Cholesterol', title: 'Cholesterol basics', detail: 'A general guide.' },
    { id: 'ldl', topic: 'Cholesterol', title: 'Understanding LDL cholesterol', detail: 'How LDL results fit into a lipid panel.' },
    { id: 'sugar', topic: 'Blood sugar', title: 'Understanding HbA1c', detail: 'A general blood sugar guide.' },
  ];
  const ranked = rankHealthFeedItemsByLocalContext(items, {
    topics,
    recentQuestionCues: ['What affects LDL cholesterol?'],
  });

  assert.deepEqual(ranked.map((item) => item.id), ['ldl', 'overview', 'sugar']);
  assert.deepEqual(items.map((item) => item.id), ['overview', 'ldl', 'sugar']);
});
