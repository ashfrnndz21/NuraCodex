import test from 'node:test';
import assert from 'node:assert/strict';
import { detectUserHealthSignal } from './userHealthSignal.mjs';

test('captures only direct first-person condition, medicine, and allergy statements', () => {
  assert.deepEqual(detectUserHealthSignal('I was diagnosed with type 2 diabetes.'), {
    label: 'Self-reported condition',
    value: 'type 2 diabetes',
    statement: 'I was diagnosed with type 2 diabetes',
    reason: 'You mentioned “I was diagnosed with type 2 diabetes” in your question. Review it before saving; this is your self-reported context, not a verified medical conclusion.',
  });
  assert.equal(detectUserHealthSignal('I take metformin 500 mg twice daily, could that be in my records?')?.value, 'metformin 500 mg twice daily');
  assert.equal(detectUserHealthSignal("I'm allergic to penicillin.")?.label, 'Self-reported allergy');
});

test('does not turn questions, hypotheticals, negations, or symptoms into health registry signals', () => {
  for (const question of [
    'Could I have diabetes?',
    'I might have diabetes.',
    'I do not take metformin.',
    'I am not allergic to penicillin.',
    'I have been having headaches.',
    'What if I was diagnosed with asthma?',
  ]) assert.equal(detectUserHealthSignal(question), null, question);
});

test('does not infer a personal fact from non-first-person text or an oversized message', () => {
  assert.equal(detectUserHealthSignal('My father was diagnosed with diabetes.'), null);
  assert.equal(detectUserHealthSignal(`I was diagnosed with asthma. ${'More context. '.repeat(200)}`), null);
});
