import test from 'node:test';
import assert from 'node:assert/strict';
import { createFallbackArticleSearch, createMedlinePlusWebService } from './medlinePlusWebService.mjs';

function response(xml, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => xml };
}

const xml = `<?xml version="1.0"?>
<nlmSearchResult><list>
  <document url="https://medlineplus.gov/cholesterol.html"><content name="title">&lt;span class="qt0"&gt;Cholesterol&lt;/span&gt;</content><content name="FullSummary">&lt;p&gt;Learn about cholesterol &amp;amp; heart health.&lt;/p&gt;</content></document>
  <document url="https://medlineplus.gov/howtolowercholesterol.html"><content name="title">How to Lower Cholesterol</content><content name="FullSummary">&lt;p&gt;Ways to lower cholesterol.&lt;/p&gt;</content></document>
  <document url="https://medlineplus.gov/cholesterollevelswhatyouneedtoknow.html"><content name="title">Cholesterol Levels: What You Need to Know</content><content name="snippet">Understanding cholesterol test results.</content></document>
  <document url="http://medlineplus.gov/insecure.html"><content name="title">Insecure result</content><content name="snippet">Not accepted.</content></document>
  <document url="https://example.com/outside.html"><content name="title">Outside result</content><content name="snippet">Not accepted.</content></document>
</list></nlmSearchResult>`;

test('searches MedlinePlus with a broad topic and returns only official, readable pages', async () => {
  const calls = [];
  const search = createMedlinePlusWebService({
    fetchImpl: async (url, options) => { calls.push({ url: new URL(url), options }); return response(xml); },
    now: () => 100,
  });
  const result = await search({ query: 'Cholesterol' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.origin, 'https://wsearch.nlm.nih.gov');
  assert.equal(calls[0].url.searchParams.get('db'), 'healthTopics');
  assert.equal(calls[0].url.searchParams.get('term'), 'Cholesterol');
  assert.equal(calls[0].url.searchParams.get('retmax'), '10');
  assert.equal(calls[0].options.method, 'GET');
  assert.deepEqual(result.sources.map((source) => source.title), [
    'Cholesterol', 'How to Lower Cholesterol', 'Cholesterol Levels: What You Need to Know',
  ]);
  assert.equal(result.sources[0].detail, 'Learn about cholesterol & heart health.');
  assert.ok(result.sources.every((source) => source.publisher === 'MedlinePlus' && source.url.startsWith('https://medlineplus.gov/')));
});

test('uses the same topic cache for repeat searches', async () => {
  let requests = 0;
  const search = createMedlinePlusWebService({ fetchImpl: async () => { requests += 1; return response(xml); }, now: () => 10 });
  await search({ query: 'Cholesterol' });
  await search({ query: 'Cholesterol' });
  assert.equal(requests, 1);
});

test('falls back to MedlinePlus when the primary article search cannot authenticate', async () => {
  const error = new Error('private primary-provider error');
  const search = createFallbackArticleSearch({
    searchPrimary: async () => { throw error; },
    searchFallback: createMedlinePlusWebService({ fetchImpl: async () => response(xml) }),
  });
  const result = await search({ query: 'Cholesterol' });
  assert.equal(result.sources.length, 3);
  assert.ok(result.sources.every((source) => source.publisher === 'MedlinePlus'));
});

test('merges primary sources with MedlinePlus replacement candidates', async () => {
  const search = createFallbackArticleSearch({
    searchPrimary: async () => ({ summary: 'Primary overview.', sources: [
      { title: 'One', url: 'https://cdc.gov/one' },
      { title: 'Two', url: 'https://cdc.gov/two' },
    ] }),
    searchFallback: createMedlinePlusWebService({ fetchImpl: async () => response(xml) }),
  });
  const result = await search({ query: 'Cholesterol' });
  assert.equal(result.summary, 'Primary overview.');
  assert.equal(result.sources.length, 5);
  assert.ok(result.sources.slice(2).every((source) => source.publisher === 'MedlinePlus'));
});

test('does not return an HTML/XML response body or credentials on service errors', async () => {
  const search = createMedlinePlusWebService({ fetchImpl: async () => response('<private body>', 503) });
  await assert.rejects(search({ query: 'Cholesterol' }), (error) => {
    assert.equal(error.message, 'MedlinePlus could not complete this health-topic search. Try again later.');
    assert.doesNotMatch(error.message, /private body/);
    return true;
  });
});
