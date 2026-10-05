import assert from 'node:assert/strict';
import test from 'node:test';
import { createAskClarificationReply } from './askClarificationReply.mjs';

test('age reply requires a separate opt-in and is then attached only to Nura’s latest clarification', () => {
  const messages = [
    { role: 'user', text: 'Tell me about my overall health.' },
    { role: 'assistant', text: 'BMI categories differ for people under 20. How old are you?' },
  ];
  const pending = createAskClarificationReply('43', messages);
  assert.equal(pending?.requestText, null);
  assert.equal(pending?.requiresExplicitConsent, true);

  const result = createAskClarificationReply('43', messages, { includeReply: true });

  assert.equal(result?.clarification, 'How old are you?');
  assert.equal(result?.reply, '43');
  assert.match(result.requestText, /self-reported context for this answer only/);
  assert.match(result.requestText, /not a verified or saved health record/);
  assert.match(result.requestText, /Do not add it to the profile or propose saving it/);
  assert.doesNotMatch(result.requestText, /Tell me about my overall health/);
});

test('blood-pressure reply retains its unit/date wording without converting it into a saved measurement', () => {
  const result = createAskClarificationReply('My last reading was 128/82 mmHg yesterday.', [
    { role: 'assistant', text: 'Do you know your recent blood pressure reading?' },
  ], { includeReply: true });

  assert.equal(result?.requestedDetails, 'blood pressure');
  assert.match(result.requestText, /128\/82 mmHg yesterday/);
  assert.match(result.requestText, /not a verified or saved health record/);
});

test('an unknown answer can continue the clarification without inventing a value', () => {
  const result = createAskClarificationReply("I don't know", [
    { role: 'assistant', text: 'How old are you, and do you know your recent blood pressure?' },
  ], { includeReply: true });

  assert.equal(result?.requestedDetails, 'age and blood pressure');
  assert.match(result.requestText, /The user replied: “I don't know”/);
  assert.doesNotMatch(result.requestText, /age is \d|blood pressure is \d/);
});

test('unrelated questions, non-direct replies and stale clarifications are not contextualized', () => {
  const clarification = { role: 'assistant', text: 'How old are you?' };

  assert.equal(createAskClarificationReply('What does BMI mean?', [clarification]), null);
  assert.equal(createAskClarificationReply('43', [clarification, { role: 'user', text: 'I am asking about something else.' }]), null);
  assert.equal(createAskClarificationReply('120/80', [{ role: 'assistant', text: 'What is your age?' }]), null);
  assert.equal(createAskClarificationReply('43', [{ role: 'assistant', text: 'Your weight is saved. What would you like to know?' }]), null);
  assert.equal(createAskClarificationReply('43', []), null);
});

test('retrying a failed clarification turn retains the preceding question context', () => {
  const result = createAskClarificationReply('43', [
    { role: 'assistant', text: 'How old are you?' },
    { role: 'user', text: '43' },
  ], { includeReply: true });

  assert.equal(result?.clarification, 'How old are you?');
  assert.match(result.requestText, /The user replied: “43”/);
});
