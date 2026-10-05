import assert from 'node:assert/strict';
import test from 'node:test';
import { selectAskSourceContext } from './askSourceContext.mjs';

const profile = {
  topics: [{ id: 'cholesterol', label: 'Cholesterol' }, { id: 'sleep', label: 'Sleep' }],
  facts: [
    { id: 'ldl-1', label: 'LDL cholesterol', value: '128 mg/dL', date: '2026-09-20', category: 'Lab result', source: 'Lab report', status: 'confirmed', reviewState: 'user_confirmed', sourceId: 'source-1' },
    { id: 'sleep-1', label: 'Sleep note', value: 'Wakes early', date: '2026-09-18', category: 'Sleep', source: 'Entered by you', status: 'confirmed', reviewState: 'user_confirmed' },
    { id: 'draft-1', label: 'Total cholesterol', value: '195 mg/dL', date: '2026-09-20', category: 'Lab result', source: 'Lab report', status: 'suggested', reviewState: 'pending' },
  ],
  treatments: [
    { id: 'medicine-1', name: 'Atorvastatin', purpose: 'cholesterol', status: 'current' },
    { id: 'medicine-2', name: 'Melatonin', purpose: 'sleep', status: 'current' },
  ],
};

test('selected-source context contains only a matching topic and minimal confirmed details', () => {
  const result = selectAskSourceContext({ title: 'What is cholesterol?', detail: 'A lipid explainer.', topic: 'Cholesterol', url: 'https://youtu.be/abcdefghijk' }, profile, ['User Name', 'user@example.com']);
  assert.deepEqual(result.topics, [{ id: 'cholesterol', label: 'Cholesterol' }]);
  assert.deepEqual(result.facts.map(({ id, label, value }) => ({ id, label, value })), [{ id: 'ldl-1', label: 'LDL cholesterol', value: '128 mg/dL' }]);
  assert.deepEqual(result.treatments.map(({ name, dose, schedule }) => ({ name, dose, schedule })), [{ name: 'Atorvastatin', dose: '', schedule: '' }]);
  assert.deepEqual(result.links, []);
  assert.deepEqual(result.visits, []);
});

test('selected-source context excludes unrelated, unreviewed, and non-current details', () => {
  const result = selectAskSourceContext({ title: 'Cholesterol basics', detail: '', topic: 'Cholesterol' }, {
    topics: profile.topics,
    facts: profile.facts,
    treatments: profile.treatments.map((item) => item.name === 'Atorvastatin' ? { ...item, status: 'past' } : item),
  });
  assert.deepEqual(result.facts.map((fact) => fact.id), ['ldl-1']);
  assert.deepEqual(result.treatments, []);
  assert.deepEqual(result.topics, [{ id: 'cholesterol', label: 'Cholesterol' }]);
});
