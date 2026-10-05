import assert from 'node:assert/strict';
import test from 'node:test';
import { addHealthFeedCandidate, canonicalHealthUrl, uniqueHealthFeedItems } from './feedResults.mjs';

function add(byUrl, byTitle, source, topic, title = source.title) {
  return addHealthFeedCandidate({ byUrl, byTitle, source, topic, title, detail: source.detail, retrievedAt: '2026-09-24T00:00:00.000Z' });
}

test('normalizes tracking parameters, fragments and trailing slashes for the same publisher page', () => {
  assert.equal(canonicalHealthUrl('https://www.cdc.gov/example/?utm_source=nura#section'), 'https://www.cdc.gov/example');
  const byUrl = new Map(); const byTitle = new Map();
  add(byUrl, byTitle, { url: 'https://www.cdc.gov/example?utm_source=nura', title: 'Health guidance', detail: 'First' }, 'Blood pressure');
  const duplicate = add(byUrl, byTitle, { url: 'https://www.cdc.gov/example/#section', title: 'Health guidance', detail: 'Second' }, 'Cholesterol');
  assert.equal(duplicate.added, false);
  assert.equal(uniqueHealthFeedItems(byUrl).length, 1);
  assert.equal(duplicate.item.topic, 'Blood pressure · Cholesterol');
});

test('suppresses same-publisher duplicate titles within one selected topic even when search returns alternate URLs', () => {
  const byUrl = new Map(); const byTitle = new Map();
  add(byUrl, byTitle, { url: 'https://cdc.gov/a', title: 'Blood pressure health information', detail: 'A' }, 'Blood pressure');
  const duplicate = add(byUrl, byTitle, { url: 'https://cdc.gov/b', title: 'Blood pressure health information', detail: 'B' }, 'Blood pressure');
  assert.equal(duplicate.added, false);
  assert.equal(uniqueHealthFeedItems(byUrl).length, 1);
});

test('suppresses the same article title across publishers but keeps distinct headlines', () => {
  const byUrl = new Map(); const byTitle = new Map();
  add(byUrl, byTitle, { url: 'https://cdc.gov/a', title: 'Blood pressure health information' }, 'Blood pressure');
  const duplicate = add(byUrl, byTitle, { url: 'https://nhs.uk/a', title: 'Blood pressure health information' }, 'Blood pressure');
  add(byUrl, byTitle, { url: 'https://cdc.gov/b', title: 'High blood pressure' }, 'Blood pressure');
  assert.equal(duplicate.added, false);
  assert.equal(uniqueHealthFeedItems(byUrl).length, 2);
});

test('suppresses repeated material across related selected topics and retains both labels', () => {
  const byUrl = new Map(); const byTitle = new Map();
  add(byUrl, byTitle, { url: 'https://cdc.gov/cholesterol', title: 'Cholesterol health information' }, 'Cholesterol');
  const duplicate = add(byUrl, byTitle, { url: 'https://heart.org/cholesterol', title: 'Cholesterol health information' }, 'LDL and HDL');
  assert.equal(duplicate.added, false);
  assert.equal(uniqueHealthFeedItems(byUrl).length, 1);
  assert.equal(duplicate.item.topic, 'Cholesterol · LDL and HDL');
});

test('suppresses near-identical article headlines from different publishers', () => {
  const byUrl = new Map(); const byTitle = new Map();
  add(byUrl, byTitle, { url: 'https://cdc.gov/a', title: 'Questions About Cholesterol and Your Heart' }, 'Cholesterol');
  const duplicate = add(byUrl, byTitle, { url: 'https://heart.org/b', title: 'Cholesterol Questions and Your Heart' }, 'Cholesterol');
  assert.equal(duplicate.added, false);
  assert.equal(uniqueHealthFeedItems(byUrl).length, 1);
});

test('suppresses distinct headlines that repeat the same detailed source explanation', () => {
  const byUrl = new Map(); const byTitle = new Map();
  const detail = 'Cholesterol is a waxy substance carried in the blood. A lipid panel measures LDL, HDL, and triglycerides to help explain cardiovascular health.';
  add(byUrl, byTitle, { url: 'https://heart.org/first', title: 'Questions About Cholesterol', detail }, 'Cholesterol');
  const duplicate = add(byUrl, byTitle, { url: 'https://medlineplus.gov/second', title: 'Cholesterol health information', detail }, 'Cholesterol');
  assert.equal(duplicate.added, false);
  assert.equal(uniqueHealthFeedItems(byUrl).length, 1);
});

test('does not deduplicate a video against an article with the same title', () => {
  const byUrl = new Map(); const byTitle = new Map();
  add(byUrl, byTitle, { url: 'https://cdc.gov/heart-health', title: 'Heart health basics for adults' }, 'Heart health');
  add(byUrl, byTitle, { url: 'https://www.youtube.com/watch?v=abcDEF123_-', title: 'Heart health basics for adults' }, 'Heart health');
  assert.equal(uniqueHealthFeedItems(byUrl).length, 2);
});

test('retains expandable source descriptions up to the full feed excerpt limit', () => {
  const byUrl = new Map(); const byTitle = new Map();
  const detail = 'source detail '.repeat(220);
  const { item } = add(byUrl, byTitle, { url: 'https://example.org/health', title: 'Health guidance', detail }, 'Health');
  assert.equal(item.detail.length, 2000);
});

test('preserves an unmodified YouTube API thumbnail and rejects unrelated thumbnail hosts', () => {
  const byUrl = new Map(); const byTitle = new Map();
  const valid = add(byUrl, byTitle, {
    url: 'https://www.youtube.com/watch?v=abcDEF123_-', title: 'A health video',
    thumbnailUrl: 'https://i.ytimg.com/vi/abcDEF123_-/hqdefault.jpg',
  }, 'Heart health');
  assert.equal(valid.item.thumbnailUrl, 'https://i.ytimg.com/vi/abcDEF123_-/hqdefault.jpg');
  const unsafe = add(byUrl, byTitle, {
    url: 'https://www.youtube.com/watch?v=abcDEF123_1', title: 'Another health video',
    thumbnailUrl: 'https://example.com/tracker.jpg',
  }, 'Heart health');
  assert.equal(unsafe.item.thumbnailUrl, undefined);
  const article = add(byUrl, byTitle, {
    url: 'https://cdc.gov/heart-health', title: 'An article',
    thumbnailUrl: 'https://i.ytimg.com/vi/abcDEF123_-/hqdefault.jpg',
  }, 'Heart health');
  assert.equal(article.item.thumbnailUrl, undefined);
});

test('rejects non-HTTPS sources', () => {
  const byUrl = new Map(); const byTitle = new Map();
  assert.equal(canonicalHealthUrl('http://cdc.gov/example'), null);
  assert.equal(add(byUrl, byTitle, { url: 'http://cdc.gov/example', title: 'Health guidance' }, 'Blood pressure').item, null);
  assert.equal(byUrl.size, 0);
});
