import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeIntakeBatch } from './intakeBatchAnalysis.mjs';

const claim = (id, label, value, effectiveAt, evidenceState = 'needs_review', unit = 'mmol/L') => ({ id, label, value, effectiveAt, evidenceState, unit });
const source = (sourceId, sourceName, ...claims) => ({ sourceId, sourceName, claims });

test('same value, unit and event date in distinct sources is a reviewable match, not an automatic merge', () => {
  const findings = analyzeIntakeBatch([
    source('s1', 'January report', claim('c1', 'LDL Cholesterol', '3.40', '2026-01-10')),
    source('s2', 'Clinic note', claim('c2', 'ldl cholesterol', '3.4', '2026-01-10', 'user_confirmed', 'MMOL/L')),
  ]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, 'same_date_match');
  assert.deepEqual(findings[0].claimIds, ['c1', 'c2']);
  assert.deepEqual(findings[0].sources.map((item) => item.name), ['January report', 'Clinic note']);
});

test('same field and date with different values is surfaced as a conflict', () => {
  const findings = analyzeIntakeBatch([
    source('s1', 'Lab report', claim('c1', 'LDL Cholesterol', '3.4', '2026-01-10')),
    source('s2', 'Visit note', claim('c2', 'LDL Cholesterol', '4.1', '2026-01-10')),
  ]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, 'same_date_difference');
  assert.deepEqual(findings[0].values, ['3.4', '4.1']);
});

test('different values with a missing source date are flagged for clarification, not called a conflict', () => {
  const findings = analyzeIntakeBatch([
    source('s1', 'Lab report', claim('c1', 'Total Cholesterol', '122', '2026-01-10', 'user_confirmed', 'mg/dL')),
    source('s2', 'Follow-up report', claim('c2', 'Total cholesterol', '128', null, 'needs_review', 'mg/dL')),
  ]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, 'date_uncertain_difference');
  assert.deepEqual(findings[0].values, ['122', '128']);
  assert.deepEqual(findings[0].eventDates, ['2026-01-10']);
});

test('same result on different or unknown dates is only a possible repeat', () => {
  const findings = analyzeIntakeBatch([
    source('s1', 'Earlier report', claim('c1', 'LDL Cholesterol', '3.4', '2026-01-10')),
    source('s2', 'Later report', claim('c2', 'LDL Cholesterol', '3.4', '2026-04-12')),
    source('s3', 'Undated note', claim('c3', 'LDL Cholesterol', '3.4', null)),
  ]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, 'possible_repeat');
  assert.deepEqual(findings[0].eventDates, ['2026-01-10', '2026-04-12']);
});

test('different dated results remain a history sequence and rejected claims are excluded', () => {
  const findings = analyzeIntakeBatch([
    source('s1', 'January report', claim('c1', 'LDL Cholesterol', '3.4', '2026-01-10')),
    source('s2', 'April report', claim('c2', 'LDL Cholesterol', '4.1', '2026-04-12')),
    source('s3', 'Dismissed suggestion', claim('c3', 'LDL Cholesterol', '9.9', '2026-01-10', 'rejected')),
  ]);
  assert.deepEqual(findings, []);
});

test('incomplete dates and decimal-comma values stay literal and request clarification', () => {
  const findings = analyzeIntakeBatch([
    source('s1', 'Year-only report', claim('c1', 'LDL Cholesterol', '34', '2026')),
    source('s2', 'Undated report', claim('c2', 'LDL Cholesterol', '3,4', '2026-01')),
  ]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, 'date_uncertain_difference');
  assert.deepEqual(findings[0].values, ['34', '3,4']);
  assert.deepEqual(findings[0].eventDates, []);
});
