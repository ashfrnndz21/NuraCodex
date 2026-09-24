import test from 'node:test';
import assert from 'node:assert/strict';
import { agentCitationTarget } from './agentCitationNavigation.mjs';

const context = {
  facts: [{ id: 'fact-1' }, { id: 'historical-fact' }],
  topics: [{ id: 'topic-1' }],
  links: [{ id: 'link-1', from: 'fact:fact-1', to: 'topic:topic-1' }],
  treatments: [{ id: 'treatment-1' }],
  visits: [{ id: 'visit-1' }],
  assets: [{ id: 'asset-1', serverSourceId: 'source-1' }],
};

test('fact citations focus the exact saved history record', () => {
  assert.deepEqual(agentCitationTarget({ id: 'fact:fact-1' }, context), { kind: 'health', focusId: 'fact:fact-1' });
});

test('older fact citations remain navigable after they leave current Ask context', () => {
  assert.deepEqual(agentCitationTarget({ id: 'fact:historical-fact' }, context), { kind: 'health', focusId: 'fact:historical-fact' });
});

test('topic citations open their Medical Registry page', () => {
  assert.deepEqual(agentCitationTarget({ id: 'topic:topic-1' }, context), { kind: 'registry', topicId: 'topic-1' });
});

test('treatment and visit citations open the matching timeline item', () => {
  assert.deepEqual(agentCitationTarget({ id: 'treatment:treatment-1' }, context), { kind: 'health', focusId: 'treatment:treatment-1' });
  assert.deepEqual(agentCitationTarget({ id: 'visit:visit-1' }, context), { kind: 'health', focusId: 'visit:visit-1' });
});

test('document detail citations open their locally saved source file', () => {
  assert.deepEqual(agentCitationTarget({ id: 'document:source-1:2' }, context), { kind: 'health', focusId: 'asset:asset-1' });
});

test('user-authored relationship citations open a resolved endpoint', () => {
  assert.deepEqual(agentCitationTarget({ id: 'link:link-1' }, context), { kind: 'health', focusId: 'fact:fact-1' });
});

test('https public citations open externally while unsafe urls are rejected', () => {
  assert.deepEqual(agentCitationTarget({ id: 'web:W1', url: 'https://health.example/article' }, context), { kind: 'external', url: 'https://health.example/article' });
  assert.equal(agentCitationTarget({ id: 'web:W1', url: 'javascript:alert(1)' }, context), null);
});

test('missing or out-of-scope citations have no navigation target', () => {
  assert.equal(agentCitationTarget({ id: 'fact:other-person-fact' }, context), null);
  assert.equal(agentCitationTarget({ id: 'link:missing' }, context), null);
});
