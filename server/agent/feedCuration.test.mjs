import test from 'node:test';
import assert from 'node:assert/strict';
import { curateHealthFeedItems } from './feedCuration.mjs';

const topic = { id: 'cholesterol', label: 'Cholesterol' };
const article = (id) => ({ id, topic: 'Cholesterol', url: `https://medlineplus.gov/${id}`, title: id });
const video = (id) => ({ id, topic: 'Cholesterol', url: `https://www.youtube.com/watch?v=${id.padEnd(11, 'x')}`, title: id });

test('curates at most three distinct articles and three YouTube videos for each topic', () => {
  const items = [article('a1'), video('v1'), article('a2'), video('v2'), article('a3'), video('v3'), article('a4'), video('v4')];
  const curated = curateHealthFeedItems(items, [topic]);
  assert.deepEqual(curated.map((item) => item.id), ['a1', 'v1', 'a2', 'v2', 'a3', 'v3']);
});

test('applies the limits separately to each selected topic and preserves result order', () => {
  const items = [
    ...Array.from({ length: 4 }, (_, index) => ({ ...article(`c${index}`), id: `c${index}`, topic: 'Cholesterol' })),
    ...Array.from({ length: 4 }, (_, index) => ({ ...article(`b${index}`), id: `b${index}`, topic: 'Blood pressure' })),
  ];
  const curated = curateHealthFeedItems(items, [topic, { id: 'bp', label: 'Blood pressure' }]);
  assert.deepEqual(curated.map((item) => item.id), ['c0', 'c1', 'c2', 'b0', 'b1', 'b2']);
});

test('keeps a cross-topic duplicate once while counting it for each selected topic', () => {
  const mergedVideo = { ...video('shared'), topic: 'Cholesterol · LDL and HDL' };
  const curated = curateHealthFeedItems([mergedVideo], [topic, { id: 'ldl', label: 'LDL and HDL' }]);
  assert.deepEqual(curated.map((item) => item.id), ['shared']);
});

test('counts a non-YouTube video-like URL as an article', () => {
  const items = [
    { id: 'external', topic: 'Cholesterol', url: 'https://example.org/watch?v=abcdefghijk' },
    ...Array.from({ length: 4 }, (_, index) => article(`a${index}`)),
  ];
  assert.deepEqual(curateHealthFeedItems(items, [topic]).map((item) => item.id), ['external', 'a0', 'a1']);
});
