import assert from 'node:assert/strict';
import test from 'node:test';
import { selectAskHealthFacts } from './askHealthFactSelection.mjs';

const facts = [
  { id: 'report-total-cholesterol', label: 'Total cholesterol', value: '122 mg/dL' },
  { id: 'report-triglycerides', label: 'Triglycerides', value: '184 mg/dL' },
  { id: 'note-glucose', label: 'Blood sugar note', value: 'Fictional sample note' },
];

test('keeps all health facts selected by default when the category is included', () => {
  assert.deepEqual(selectAskHealthFacts(facts, true), facts);
});

test('excludes only the individual facts the person unchecked', () => {
  assert.deepEqual(selectAskHealthFacts(facts, true, ['note-glucose']), facts.slice(0, 2));
});

test('a disabled health-facts category sends no individual facts', () => {
  assert.deepEqual(selectAskHealthFacts(facts, false), []);
});

test('stale excluded ids do not remove unrelated facts', () => {
  assert.deepEqual(selectAskHealthFacts(facts, true, ['deleted-fact']), facts);
});
