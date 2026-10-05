import assert from 'node:assert/strict';
import test from 'node:test';
import { runAgent } from './orchestrator.mjs';

test('Ask record-quality run preserves unit variants and replaces an overall-health refusal', async () => {
  const previousEnv = {
    provider: process.env.NURA_LLM_PROVIDER,
    apiKey: process.env.OPENAI_API_KEY,
  };
  const originalFetch = globalThis.fetch;
  const requests = [];
  process.env.NURA_LLM_PROVIDER = 'openai';
  process.env.OPENAI_API_KEY = 'synthetic-test-key-never-send';
  globalThis.fetch = async (input, options = {}) => {
    const url = typeof input === 'string' ? input : input?.url;
    assert.equal(url, 'https://api.openai.com/v1/responses', 'the test must not make external requests');
    const request = JSON.parse(options.body);
    requests.push(request);
    if (requests.length === 1) return new Response(JSON.stringify({ output: [{
      type: 'function_call', call_id: 'synthetic-quality-search', name: 'search_profile',
      arguments: JSON.stringify({ query: 'health records quality' }),
    }] }), { status: 200, headers: { 'content-type': 'application/json' } });

    const searchCall = request.input.find((item) => item.type === 'function_call_output');
    const search = searchCall ? JSON.parse(searchCall.output) : { results: [] };
    const a1c = search.results.filter((item) => item.title === 'HbA1c');
    const cholesterol = search.results.filter((item) => item.title === 'Total cholesterol');
    assert.equal(a1c.length, 2);
    assert.equal(cholesterol.length, 2);
    const answer = {
      answer: 'I can’t rate your overall health from these records alone. The current records show two HbA1c entries—5.7 mmol/mol and 5.8%—and a total cholesterol entry of 8.5 mmol/L. The cholesterol value of 8.5 mg/dL is an earlier saved version, not the current record.',
      citations: search.results.map((item) => item.reference), meaning: { text: '', citations: [] },
      unknowns: [], nextSteps: [],
      memoryProposal: { proposed: false, label: '', value: '', reason: '', sourceReferences: [] },
    };
    return new Response(JSON.stringify({ output_text: JSON.stringify(answer) }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const events = [];
    await runAgent({
      runId: 'synthetic-record-quality-review',
      question: 'Tell me how is good is my health records?',
      consentConfirmed: true, externalSearchConsent: false,
      treatmentContextConsent: false, visitContextConsent: false, sourceContextConsent: false,
      historyContextConsent: false, history: [],
      context: {
        facts: [
          { id: 'a1c-mmol-mol', label: 'HbA1c', value: '5.7 mmol/mol', date: '2026-10-02', category: 'Blood sugar', source: 'Provided by you for this answer', status: 'confirmed' },
          { id: 'a1c-percent', label: 'HbA1c', value: '5.8%', date: '2026-10-01', category: 'Blood sugar', source: 'Provided by you for this answer', status: 'confirmed' },
          { id: 'cholesterol-mmol-l', label: 'Total cholesterol', value: '8.5 mmol/L', date: '2026-10-02', category: 'Cholesterol', source: 'Provided by you for this answer', status: 'confirmed' },
          { id: 'cholesterol-mg-dl', label: 'Total cholesterol', value: '8.5 mg/dL', date: '2026-10-01', category: 'Cholesterol', source: 'Provided by you for this answer', status: 'confirmed' },
        ],
        topics: [], links: [], treatments: [], visits: [],
      },
    }, (type, data) => events.push({ type, data }), new AbortController().signal);

    const answer = events.find((event) => event.type === 'answer')?.data;
    const evidence = events.filter((event) => event.type === 'evidence').flatMap((event) => event.data.sources || []);
    assert.ok(answer);
    assert.match(answer.answer, /useful starting point/);
    assert.match(answer.answer, /HbA1c and total cholesterol entries use different units/);
    assert.doesNotMatch(answer.answer, /can’t rate|current records|earlier saved version/i);
    assert.deepEqual(answer.citations, ['R1', 'R2', 'R3', 'R4']);
    assert.deepEqual([...new Map(evidence.filter((source) => answer.citations.includes(source.reference)).map((source) => [source.reference, source])).values()].map((source) => source.title), ['HbA1c', 'HbA1c', 'Total cholesterol', 'Total cholesterol']);
    assert.deepEqual(answer.nextSteps, [
      'Check the HbA1c units against the original report',
      'Check the total cholesterol units against the original report',
    ]);
    assert.equal(requests.length, 2);
    assert.match(requests[0].instructions, /Classified intent: health record quality review/);
    assert.match(requests[1].instructions, /Never answer that you cannot rate their health/);
    const retrievedEvidence = requests[1].input.find((item) => item.type === 'function_call_output')?.output ?? '';
    assert.match(retrievedEvidence, /5\.7 mmol\/mol/);
    assert.match(retrievedEvidence, /5\.8%/);
    assert.equal(events.some((event) => event.type === 'run_error'), false);
    assert.equal(events.at(-1).type, 'run_finished');
  } finally {
    globalThis.fetch = originalFetch;
    if (previousEnv.provider === undefined) delete process.env.NURA_LLM_PROVIDER;
    else process.env.NURA_LLM_PROVIDER = previousEnv.provider;
    if (previousEnv.apiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousEnv.apiKey;
  }
});
