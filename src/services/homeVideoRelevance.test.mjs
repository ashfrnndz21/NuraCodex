import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHomeVideoRelevance } from './homeVideoRelevance.mjs';

test('maps each video to its broad search topic and only its locally matched saved labels', () => {
  const facts = [
    { label: 'LDL cholesterol', category: 'Lab result', value: '93 mg/dL', date: '2026-09-10', status: 'reviewed', reviewState: 'user_confirmed' },
    { label: 'HDL cholesterol', category: 'Lab result', value: '49 mg/dL', status: 'confirmed', reviewState: 'user_confirmed' },
    { label: 'HbA1c', category: 'Lab result', value: '5.7%', status: 'reviewed', reviewState: 'user_confirmed' },
    { label: 'Unreviewed LDL', category: 'Lab result', value: '999 mg/dL', status: 'reviewed', reviewState: 'candidate' },
  ];
  const treatments = [
    { name: 'Ezetimibe', purpose: 'Cholesterol', status: 'current', dose: '10 mg' },
    { name: 'Past medicine', purpose: 'Cholesterol', status: 'past' },
  ];

  const cholesterol = buildHomeVideoRelevance({
    topic: 'Cholesterol',
    title: 'LDL cholesterol and HDL explained',
    detail: 'How these numbers appear on a lipid panel.',
  }, facts, treatments);
  const bloodSugar = buildHomeVideoRelevance({
    topic: 'Blood sugar',
    title: 'Understanding an HbA1c result',
    detail: 'A general guide to blood sugar testing.',
  }, facts, treatments);

  assert.deepEqual(cholesterol, {
    searchTopic: 'Cholesterol',
    matchedFacts: ['LDL cholesterol', 'HDL cholesterol'],
    matchedTreatments: ['Ezetimibe'],
    matchCount: 3,
  });
  assert.deepEqual(bloodSugar, {
    searchTopic: 'Blood sugar',
    matchedFacts: ['HbA1c'],
    matchedTreatments: [],
    matchCount: 1,
  });
  assert.doesNotMatch(JSON.stringify(cholesterol), /93 mg\/dL|49 mg\/dL|2026-09-10|10 mg/);
});

test('uses only the selected topic when there is no confirmed local match', () => {
  const relevance = buildHomeVideoRelevance({ topic: 'Heart health', title: 'A heart health overview' }, [
    { label: 'Heart diagnosis', category: 'Condition', value: 'unreviewed', status: 'reviewed', reviewState: 'candidate' },
  ]);

  assert.deepEqual(relevance, {
    searchTopic: 'Heart health',
    matchedFacts: [],
    matchedTreatments: [],
    matchCount: 0,
  });
});
