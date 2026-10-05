import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeFeedQuestionCue, selectRecentFeedQuestionContext } from './feedQuestionContext.mjs';

test('uses only user questions in the most recently active conversation', () => {
  const context = selectRecentFeedQuestionContext([
    { id: 'older', title: 'Older chat', updatedAt: '2026-10-01T10:00:00Z' },
    { id: 'latest', title: 'Cholesterol follow-up', updatedAt: '2026-10-04T10:00:00Z' },
  ], [
    { conversationId: 'older', role: 'user', text: 'How does blood sugar work?' },
    { conversationId: 'latest', role: 'user', text: 'What should I know about cholesterol?' },
    { conversationId: 'latest', role: 'assistant', text: 'Your cholesterol record shows 8.5 mmol/L.' },
  ]);

  assert.deepEqual(context, { title: 'Cholesterol follow-up', questions: ['cholesterol'] });
});

test('removes identifiers, values, dates, contact data, links and family attribution from question cues', () => {
  const cue = sanitizeFeedQuestionCue('Ashley, is my LDL 190 mg/dL from 2026-10-03 high? email ashley@example.com https://example.com', ['Ashley']);

  assert.equal(cue, 'ldl high');
  assert.doesNotMatch(cue, /190|2026|ashley|example|mg|https/i);
});

test('caps question cues at three, removes duplicates, and does not use another conversation', () => {
  const context = selectRecentFeedQuestionContext(
    [{ id: 'active', title: 'Recent', updatedAt: '2026-10-05T10:00:00Z' }],
    [
      { conversationId: 'active', role: 'user', text: 'Why is my cholesterol high?' },
      { conversationId: 'active', role: 'user', text: 'What affects cholesterol levels?' },
      { conversationId: 'active', role: 'user', text: 'What should I know about cholesterol?' },
      { conversationId: 'other', role: 'user', text: 'How is my blood pressure?' },
    ],
  );

  assert.equal(context.questions.length, 3);
  assert.equal(context.questions.includes('blood pressure'), false);
});
