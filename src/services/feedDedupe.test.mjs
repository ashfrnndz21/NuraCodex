import test from 'node:test';
import assert from 'node:assert/strict';
import { groupHealthFeedItems, mergeHealthFeedItems } from './feedDedupe.mjs';

function item(overrides = {}) {
  return {
    id: 'one', title: 'Blood pressure health information', detail: 'Publisher excerpt',
    url: 'https://cdc.gov/health/blood-pressure', publisher: 'cdc.gov', topic: 'Blood pressure',
    retrievedAt: '2026-09-24T10:00:00.000Z', saved: false, dismissed: false, ...overrides,
  };
}

test('groups identical publisher, title and topic cards from different result URLs', () => {
  const groups = groupHealthFeedItems([
    item({ id: 'older', url: 'https://cdc.gov/old-path', retrievedAt: '2026-09-20T10:00:00.000Z' }),
    item({ id: 'newer', url: 'https://cdc.gov/new-path', retrievedAt: '2026-09-24T10:00:00.000Z' }),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].id, 'newer');
  assert.deepEqual(groups[0].duplicateIds, ['newer', 'older']);
});

test('canonicalizes tracking parameters and keeps saved state when grouping aliases', () => {
  const groups = groupHealthFeedItems([
    item({ id: 'saved-copy', url: 'https://cdc.gov/health/blood-pressure/?utm_source=mail#section', saved: true }),
    item({ id: 'plain-copy', url: 'https://cdc.gov/health/blood-pressure' }),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].saved, true);
  assert.deepEqual(groups[0].duplicateIds, ['saved-copy', 'plain-copy']);
});

test('combines topics for the same canonical source and keeps the card visible until every copy is dismissed', () => {
  const groups = groupHealthFeedItems([
    item({ id: 'bp', topic: 'Blood pressure', dismissed: true }),
    item({ id: 'chol', topic: 'Cholesterol', title: 'Different title', url: 'https://cdc.gov/health/cholesterol', dismissed: false }),
    item({ id: 'bp-chol', topic: 'Cholesterol', title: 'Blood pressure health information', url: 'https://www.cdc.gov/health/blood-pressure?utm_campaign=test' }),
  ]);
  assert.equal(groups.length, 2);
  const sharedSource = groups.find((group) => group.topicLabels.length === 2);
  assert.deepEqual(sharedSource.topicLabels.sort(), ['Blood pressure', 'Cholesterol']);
  assert.equal(sharedSource.dismissed, false);
});

test('does not merge distinct publishers, titles or separate-topic matches', () => {
  const groups = groupHealthFeedItems([
    item({ id: 'a' }),
    item({ id: 'b', publisher: 'nhs.uk', url: 'https://nhs.uk/health/blood-pressure' }),
    item({ id: 'c', title: 'A different blood pressure article', url: 'https://cdc.gov/health/another' }),
    item({ id: 'd', topic: 'Cholesterol', url: 'https://cdc.gov/health/cholesterol' }),
  ]);
  assert.equal(groups.length, 4);
});

test('marks a grouped entry dismissed only when all matching copies were dismissed', () => {
  const groups = groupHealthFeedItems([
    item({ id: 'dismissed', dismissed: true }),
    item({ id: 'visible', url: 'https://cdc.gov/another-path', dismissed: false }),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].dismissed, false);
  assert.deepEqual(groups[0].activeIds, ['visible']);
});

test('keeps dismissed articles in a re-enterable hidden collection after a fresh search', () => {
  const current = [
    item({ id: 'hidden', dismissed: true }),
    item({ id: 'saved', title: 'A saved article', url: 'https://cdc.gov/saved', saved: true }),
    item({ id: 'stale', title: 'An old result', url: 'https://cdc.gov/stale' }),
  ];
  const incoming = [
    item({ id: 'hidden', title: 'Updated title', retrievedAt: '2026-09-25T10:00:00.000Z' }),
    item({ id: 'new', title: 'A new result', url: 'https://cdc.gov/new' }),
  ];

  const merged = mergeHealthFeedItems(current, incoming);
  assert.deepEqual(merged.map((entry) => entry.id), ['hidden', 'new', 'saved']);
  assert.equal(merged.find((entry) => entry.id === 'hidden').dismissed, true);
  assert.equal(merged.find((entry) => entry.id === 'saved').saved, true);
  assert.equal(merged.find((entry) => entry.id === 'stale'), undefined);
  assert.equal(groupHealthFeedItems(merged).find((entry) => entry.id === 'hidden').dismissed, true);
});

test('restoring a hidden source makes it eligible for the For you view again', () => {
  const restored = mergeHealthFeedItems([item({ id: 'hidden', dismissed: true })], [item({ id: 'hidden', dismissed: false })]);
  const card = groupHealthFeedItems(restored)[0];
  assert.equal(card.dismissed, true);

  const afterRestore = restored.map((entry) => entry.id === 'hidden' ? { ...entry, dismissed: false } : entry);
  assert.equal(groupHealthFeedItems(afterRestore)[0].dismissed, false);
});
