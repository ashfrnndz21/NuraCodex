import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createConversationTitle,
  selectLinkedConversationContext,
  selectRecentConversationMessages,
  sortConversationsByLatestActivity,
} from './conversationHistory.mjs';

test('conversation title is deterministic, short, and omits result values and identifying contact details', () => {
  const question = 'What does my HbA1c 5.8% from 2026-10-02 mean? Email me at sam@example.com';
  const title = createConversationTitle(question);
  assert.equal(title, 'HbA1c');
  assert.equal(createConversationTitle(question), title);
  assert.doesNotMatch(title, /5\.8|2026|sam@example\.com/i);
});

test('conversation title sanitizes markup and limits words and characters without inventing profile details', () => {
  assert.equal(createConversationTitle('**What is my cholesterol?**'), 'Cholesterol');
  assert.equal(createConversationTitle('Can you explain sleep and activity patterns for my routine?', { maxWords: 3 }), 'Sleep and activity');
  assert.ok(createConversationTitle('A very long topic title for this conversation', { maxChars: 18 }).length <= 18);
  assert.doesNotMatch(createConversationTitle('My result is 88 kg at age 42'), /88|42|kg/i);
});

test('empty or non-text opening questions get a stable fallback title', () => {
  assert.equal(createConversationTitle('   ?!  '), 'New conversation');
  assert.equal(createConversationTitle(null), 'New conversation');
  assert.equal(createConversationTitle('What does my LDL mean?'), 'LDL');
  assert.equal(createConversationTitle('What do you know of me'), 'Your health profile');
  assert.equal(createConversationTitle('What do you know about me?'), 'Your health profile');
});

test('conversation sorting uses latest activity, preserves stable ties, and does not mutate input', () => {
  const conversations = [
    { id: 'old', updatedAt: '2026-10-01T10:00:00Z' },
    { id: 'tie-a', lastMessageAt: '2026-10-02T10:00:00Z' },
    { id: 'tie-b', createdAt: '2026-10-02T10:00:00Z' },
    { id: 'new', createdAt: '2026-10-01T11:00:00Z', updatedAt: '2026-10-03T10:00:00Z' },
  ];
  const sorted = sortConversationsByLatestActivity(conversations);
  assert.deepEqual(sorted.map(({ id }) => id), ['new', 'tie-a', 'tie-b', 'old']);
  assert.deepEqual(conversations.map(({ id }) => id), ['old', 'tie-a', 'tie-b', 'new']);
});

const messages = [
  { id: 'a1', conversationId: 'A', role: 'user', text: 'First question' },
  { id: 'b1', conversationId: 'B', role: 'user', text: 'Unrelated private conversation' },
  { id: 'a2', conversationId: 'A', role: 'assistant', text: 'First answer' },
  { id: 'a3', conversationId: 'A', role: 'user', text: 'Second question' },
  { id: 'b2', conversationId: 'B', role: 'assistant', text: 'Unrelated answer' },
  { id: 'a4', conversationId: 'A', role: 'assistant', text: 'Second answer' },
  { id: 'a5', conversationId: 'A', role: 'user', text: 'Third question' },
  { id: 'a6', conversationId: 'A', role: 'assistant', text: 'Third answer' },
];

test('recent messages are scoped to exactly one conversation and capped by turns', () => {
  const selected = selectRecentConversationMessages(messages, 'A', { maxTurns: 2 });
  assert.deepEqual(selected.map(({ id }) => id), ['a3', 'a4', 'a5', 'a6']);
  assert.ok(selected.every(({ conversationId }) => conversationId === 'A'));
  assert.equal(selectRecentConversationMessages(messages, 'missing').length, 0);
});

test('recent messages respect the character cap and explicitly mark a shortened oversized message', () => {
  const selected = selectRecentConversationMessages([
    { conversationId: 'A', role: 'user', text: 'x'.repeat(40) },
  ], 'A', { maxChars: 24 });
  assert.equal(selected[0].text.length, 24);
  assert.ok(selected[0].text.endsWith('[message shortened]'));
});

test('linked context requires an explicit existing different conversation and never includes unrelated threads', () => {
  const conversations = [
    { id: 'A', title: 'Earlier cholesterol question' },
    { id: 'B', title: 'Separate topic' },
    { id: 'current', title: 'New conversation' },
  ];
  const linked = selectLinkedConversationContext({
    conversations,
    messages,
    currentConversationId: 'current',
    linkedConversationId: 'A',
    maxTurns: 1,
  });

  assert.equal(linked?.sourceConversationId, 'A');
  assert.equal(linked?.sourceTitle, 'Earlier cholesterol question');
  assert.equal(linked?.isHealthEvidence, false);
  assert.deepEqual(linked?.messages.map(({ id }) => id), ['a5', 'a6']);
  assert.ok(linked?.messages.every(({ conversationId }) => conversationId === 'A'));
  assert.equal(selectLinkedConversationContext({ conversations, messages, currentConversationId: 'current', linkedConversationId: 'missing' }), null);
  assert.equal(selectLinkedConversationContext({ conversations, messages, currentConversationId: 'A', linkedConversationId: 'A' }), null);
  assert.equal(selectLinkedConversationContext({ conversations, messages: [], currentConversationId: 'current', linkedConversationId: 'A' }), null);
});
