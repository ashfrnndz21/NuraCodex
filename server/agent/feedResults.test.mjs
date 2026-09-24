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

test('keeps same-titled items from different publishers and distinct articles from one publisher', () => {
  const byUrl = new Map(); const byTitle = new Map();
  add(byUrl, byTitle, { url: 'https://cdc.gov/a', title: 'Blood pressure health information' }, 'Blood pressure');
  add(byUrl, byTitle, { url: 'https://nhs.uk/a', title: 'Blood pressure health information' }, 'Blood pressure');
  add(byUrl, byTitle, { url: 'https://cdc.gov/b', title: 'High blood pressure' }, 'Blood pressure');
  assert.equal(uniqueHealthFeedItems(byUrl).length, 3);
});

test('rejects non-HTTPS sources', () => {
  const byUrl = new Map(); const byTitle = new Map();
  assert.equal(canonicalHealthUrl('http://cdc.gov/example'), null);
  assert.equal(add(byUrl, byTitle, { url: 'http://cdc.gov/example', title: 'Health guidance' }, 'Blood pressure').item, null);
  assert.equal(byUrl.size, 0);
});
