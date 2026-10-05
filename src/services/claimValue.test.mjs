import test from 'node:test';
import assert from 'node:assert/strict';
import { formatClaimSummaryValue, formatClaimValue } from './claimValue.mjs';

test('adds a separate unit once', () => {
  assert.equal(formatClaimValue('3.4', 'mmol/L'), '3.4 mmol/L');
});

test('does not repeat unit wording already included in an extracted value', () => {
  assert.equal(formatClaimValue('MYR 60 per visit', 'MYR per visit'), 'MYR 60 per visit');
  assert.equal(formatClaimValue('8 visits per year', 'visits per year'), '8 visits per year');
  assert.equal(formatClaimValue('80 percent after deductible', 'percent after deductible'), '80 percent after deductible');
});

test('joins overlapping value and unit phrases cleanly', () => {
  assert.equal(formatClaimValue('8 visits', 'visits per year'), '8 visits per year');
});

test('handles empty values and units', () => {
  assert.equal(formatClaimValue('', 'per year'), 'per year');
  assert.equal(formatClaimValue('No limit stated', ''), 'No limit stated');
});


test('omits a unit already present in the measurement label', () => {
  assert.equal(formatClaimSummaryValue('TC / HDL Ratio', '3.3', 'Ratio'), '3.3');
  assert.equal(formatClaimSummaryValue('Total Cholesterol', '122', 'mg/dL'), '122 mg/dL');
});
