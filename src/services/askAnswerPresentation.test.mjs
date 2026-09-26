import test from 'node:test';
import assert from 'node:assert/strict';
import { answerFirstView } from './askAnswerPresentation.mjs';

test('short answers remain complete and do not get an unnecessary disclosure control', () => {
  const answer = 'The selected report lists a cholesterol result of 4.8 mmol/L.';
  assert.deepEqual(answerFirstView(answer), { text: answer, expandable: false });
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
