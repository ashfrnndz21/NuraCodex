import test from 'node:test';
import assert from 'node:assert/strict';
import { groupHealthFeedCategories, groupHealthFeedItems, mergeHealthFeedItems } from './feedDedupe.mjs';

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

test('merges exact duplicate headlines across publishers but keeps distinct cross-topic material', () => {
  const groups = groupHealthFeedItems([
    item({ id: 'a' }),
    item({ id: 'b', publisher: 'nhs.uk', url: 'https://nhs.uk/health/blood-pressure' }),
    item({ id: 'c', title: 'A different blood pressure article', url: 'https://cdc.gov/health/another' }),
    item({ id: 'd', topic: 'Cholesterol', title: 'Cholesterol report guide', url: 'https://cdc.gov/health/cholesterol' }),
  ]);
  assert.equal(groups.length, 3);
  assert.deepEqual(groups.find((group) => group.duplicateIds.includes('a')).duplicateIds, ['a', 'b']);
});

test('merges near-identical editorial headlines across publishers within one topic', () => {
  const groups = groupHealthFeedItems([
    item({ id: 'a', publisher: 'cdc.gov', title: 'Questions About Cholesterol and Your Heart', url: 'https://cdc.gov/a' }),
    item({ id: 'b', publisher: 'heart.org', title: 'Cholesterol Questions and Your Heart', url: 'https://heart.org/b' }),
  ]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].duplicateIds, ['a', 'b']);
});

test('merges cross-publisher cards that repeat the same source explanation', () => {
  const groups = groupHealthFeedItems([
    item({ id: 'first', title: 'Questions About Cholesterol', detail: 'Cholesterol is a waxy substance carried in the blood. A lipid panel measures LDL, HDL, and triglycerides to help explain cardiovascular health.', url: 'https://heart.org/first' }),
    item({ id: 'second', publisher: 'medlineplus.gov', title: 'Cholesterol health information', detail: 'Cholesterol is a waxy substance carried in the blood. A lipid panel measures LDL, HDL, and triglycerides to help explain cardiovascular health.', url: 'https://medlineplus.gov/second' }),
  ]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].duplicateIds, ['first', 'second']);
});

test('keeps separately titled pages from one publisher when their summaries share boilerplate', () => {
  const detail = 'Cholesterol is a waxy substance carried in the blood. A lipid panel measures LDL, HDL, and triglycerides to help explain cardiovascular health.';
  const groups = groupHealthFeedItems([
    item({ id: 'overview', publisher: 'medlineplus.gov', title: 'Cholesterol', detail, url: 'https://medlineplus.gov/cholesterol.html' }),
    item({ id: 'diet', publisher: 'medlineplus.gov', title: 'How to Lower Cholesterol with Diet', detail, url: 'https://medlineplus.gov/cholesterol/diet.html' }),
  ]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((group) => group.duplicateIds), [['overview'], ['diet']]);
});

test('merges the same material surfaced under two selected cholesterol topics', () => {
  const groups = groupHealthFeedItems([
    item({ id: 'cholesterol', topic: 'Cholesterol', title: 'Cholesterol health information', url: 'https://cdc.gov/cholesterol' }),
    item({ id: 'ldl', topic: 'LDL and HDL', title: 'Cholesterol health information', publisher: 'heart.org', url: 'https://heart.org/cholesterol' }),
  ]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].topicLabels, ['Cholesterol', 'LDL and HDL']);
  assert.deepEqual(groups[0].duplicateIds, ['cholesterol', 'ldl']);
});

test('does not merge an article with a video even if their titles are the same', () => {
  const groups = groupHealthFeedItems([
    item({ id: 'article', title: 'Heart health questions and answers', url: 'https://cdc.gov/heart' }),
    item({ id: 'video', title: 'Heart health questions and answers', publisher: 'youtube.com', url: 'https://youtube.com/watch?v=abcDEF123_-' }),
  ]);
  assert.equal(groups.length, 2);
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

test('groups feed sources into ordered, expandable topic categories without duplicating items', () => {
  const items = [
    item({ id: 'sleep', topic: 'Sleep', title: 'Sleep guidance' }),
    item({ id: 'cholesterol', topic: 'Cholesterol', title: 'Cholesterol guide' }),
    item({ id: 'heart', topic: 'Heart health · Family history · heart conditions', title: 'Heart guide' }),
  ];
  const categories = groupHealthFeedCategories(items, ['Heart health', 'Cholesterol', 'Sleep']);
  assert.deepEqual(categories.map((category) => category.label), ['Heart health', 'Cholesterol', 'Sleep']);
  assert.deepEqual(categories.map((category) => category.items.map((entry) => entry.id)), [['heart'], ['cholesterol'], ['sleep']]);
  assert.equal(categories.flatMap((category) => category.items).length, items.length);
});
