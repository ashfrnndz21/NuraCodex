import assert from 'node:assert/strict';
import test from 'node:test';
import { formatSetupReviewDate, setupHealthFactReview } from './setupReviewPresentation.mjs';

test('formats saved ISO timestamps as a readable calendar date', () => {
  assert.equal(formatSetupReviewDate('2026-10-02T14:14:00.408Z'), '2 Oct 2026');
  assert.equal(formatSetupReviewDate('2026-10-02'), '2 Oct 2026');
});

test('keeps an unparseable saved date visible instead of discarding it', () => {
  assert.equal(formatSetupReviewDate('not-a-date'), 'not-a-date');
  assert.equal(formatSetupReviewDate(''), '');
});

test('preserves the exact HbA1c value and source while asking to confirm an unfamiliar unit', () => {
  const review = setupHealthFactReview({
    label: 'HbA1c',
    value: '5.7 mmil',
    date: '2026-10-02T14:14:00.408Z',
    source: 'Entered by you',
  });

  assert.equal(review.title, 'HbA1c');
  assert.equal(review.detail, '5.7 mmil · 2 Oct 2026 · Entered by you');
  assert.equal(review.unitNeedsConfirmation, true);
  assert.match(review.notice, /CHECK UNIT/);
  assert.match(review.notice, /original report/);
  assert.doesNotMatch(review.notice, /high|normal|diagnos|convert/i);
});

test('does not add a unit warning to supported HbA1c units or unrelated markers', () => {
  assert.equal(setupHealthFactReview({ label: 'HbA1c', value: '5.8%', source: 'Report.pdf' }).unitNeedsConfirmation, false);
  assert.equal(setupHealthFactReview({ label: 'HbA1c', value: '35 mmol/mol', source: 'Report.pdf' }).unitNeedsConfirmation, false);
  assert.equal(setupHealthFactReview({ label: 'LDL cholesterol', value: '5.7 mmil', source: 'Report.pdf' }).unitNeedsConfirmation, false);
});

test('keeps conflicting records as separate review items without normalization', () => {
  const facts = [
    { label: 'HbA1c', value: '5.7 mmil', date: '2026-10-02T14:14:00.408Z', source: 'Entered by you' },
    { label: 'HbA1c', value: '5.8%', date: '2026-10-02T14:15:00.408Z', source: 'Report.pdf' },
  ];
  const reviews = facts.map((fact) => setupHealthFactReview(fact));

  assert.equal(reviews.length, 2);
  assert.equal(reviews[0].detail, '5.7 mmil · 2 Oct 2026 · Entered by you');
  assert.equal(reviews[1].detail, '5.8% · 2 Oct 2026 · Report.pdf');
  assert.equal(reviews[0].unitNeedsConfirmation, true);
  assert.equal(reviews[1].unitNeedsConfirmation, false);
});
