import test from 'node:test';
import assert from 'node:assert/strict';
import { groupRegistryMarkerHistory } from './registryMarkerHistory.mjs';

const reading = (id, detail, date, source = 'Report.pdf') => ({
  id, kind: 'fact', title: 'HbA1c', detail, date, source,
});

test('keeps multiple dated HbA1c readings in one registry marker history without rewriting evidence', () => {
  const facts = [
    reading('a1c-latest', '6.4 mmol/mol', '2026-10-03'),
    reading('a1c-percent', '5.9%', '2026-10-02'),
    reading('a1c-unclear', '5.7 mmil', '2026-10-02', 'Entered by you'),
  ];

  const groups = groupRegistryMarkerHistory(facts);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].id, 'marker:hba1c');
  assert.equal(groups[0].title, 'HbA1c');
  assert.deepEqual(groups[0].records, facts);
  assert.equal(groups[0].sameDayStatus, 'needs_confirmation');
  assert.deepEqual(facts.map(({ detail }) => detail), ['6.4 mmol/mol', '5.9%', '5.7 mmil']);
});

test('does not call different-date HbA1c readings a discrepancy', () => {
  const groups = groupRegistryMarkerHistory([
    reading('a1c-old', '5.9%', '2026-09-01'),
    reading('a1c-new', '6.0%', '2026-10-01'),
  ]);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].records.length, 2);
  assert.equal(groups[0].sameDayStatus, 'none');
});

test('keeps different analytes, non-numeric facts, and other registry items distinct', () => {
  const facts = [
    reading('a1c', '5.9%', '2026-10-01'),
    { ...reading('cholesterol', '8.5 mmol/L', '2026-10-01'), title: 'Total cholesterol' },
    { ...reading('note', 'Follow up with my doctor', '2026-10-01'), title: 'HbA1c' },
    { id: 'policy', kind: 'asset', title: 'Policy.pdf', detail: 'PDF', date: '2026-10-01' },
  ];

  const groups = groupRegistryMarkerHistory(facts);

  assert.deepEqual(groups.map(({ id }) => id), ['marker:hba1c', 'marker:total-cholesterol', 'record:note', 'record:policy']);
});

test('recognizes HbA1c values reported in percent and IFCC units as one equivalent result', () => {
  const groups = groupRegistryMarkerHistory([
    reading('a1c-percent', '5.9%', '2026-10-02'),
    reading('a1c-ifcc', '41 mmol/mol', '2026-10-02', 'Lab report.pdf'),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].sameDayStatus, 'equivalent');
  assert.deepEqual(groups[0].records.map(({ detail }) => detail), ['5.9%', '41 mmol/mol']);
});

test('labels same-day known HbA1c values that remain different after unit normalization for review', () => {
  const groups = groupRegistryMarkerHistory([
    reading('a1c-percent', '5.9%', '2026-10-02'),
    reading('a1c-ifcc', '48 mmol/mol', '2026-10-02', 'Lab report.pdf'),
  ]);
  assert.equal(groups[0].sameDayStatus, 'possible_difference');
});

test('does not call an unclear HbA1c unit a numeric discrepancy', () => {
  const groups = groupRegistryMarkerHistory([
    reading('a1c-percent', '5.9%', '2026-10-02'),
    reading('a1c-typo', '5.7 mmil', '2026-10-02', 'Entered by you'),
  ]);
  assert.equal(groups[0].sameDayStatus, 'needs_confirmation');
});
