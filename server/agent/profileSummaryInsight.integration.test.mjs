import assert from 'node:assert/strict';
import test from 'node:test';
import { runAgent } from './orchestrator.mjs';

test('broad health Ask connects BMI, cholesterol and HbA1c without generic health-rating refusals', async () => {
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
      type: 'function_call', call_id: 'synthetic-health-summary-search', name: 'search_profile',
      arguments: JSON.stringify({ query: 'overall health' }),
    }] }), { status: 200, headers: { 'content-type': 'application/json' } });

    const toolOutput = request.input.find((item) => item.type === 'function_call_output')?.output ?? '{}';
    const search = JSON.parse(toolOutput);
    assert.equal(search.derivedMeasurements[0].value, '33.1 kg/m²');
    assert.equal(search.derivedMeasurements[0].ageAtMeasurement, 38);
    assert.ok(search.derivedMeasurements[0].educationalReference);
    assert.ok(search.healthEducationSources.some((item) => /Cholesterol Levels/.test(item.title)));
    assert.ok(search.healthEducationSources.some((item) => /A1C Test/.test(item.title)));
    return new Response(JSON.stringify({ output_text: JSON.stringify({
      answer: 'I can’t rate your overall health from these records alone. The records reviewed show weight, height, cholesterol and blood sugar entries.',
      citations: search.results.map((item) => item.reference)
        .concat(search.derivedMeasurements.map((item) => item.educationalReference).filter(Boolean))
        .concat(search.derivedMeasurements.map((item) => item.a1cEducationalReference).filter(Boolean))
        .concat(search.healthEducationSources.map((item) => item.reference)),
      meaning: { text: '', citations: [] }, unknowns: ['Other details were not returned.'], nextSteps: [],
      memoryProposal: { proposed: false, label: '', value: '', reason: '', sourceReferences: [] },
    }) }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  try {
    const events = [];
    await runAgent({
      runId: 'synthetic-overall-health-review',
      question: 'Tell me how good my health is',
      consentConfirmed: true, externalSearchConsent: false,
      derivedAgeConsent: true,
      treatmentContextConsent: false, visitContextConsent: false, sourceContextConsent: false,
      historyContextConsent: false, history: [],
      context: {
        facts: [
          { id: 'weight-1', label: 'Weight', value: '88 kg', date: '2026-10-03', category: 'Body measurement', source: 'Provided by you', status: 'confirmed' },
          { id: 'height-1', label: 'Height', value: '163 cm', date: '2026-10-03', category: 'Body measurement', source: 'Provided by you', status: 'confirmed' },
          { id: 'a1c-1', label: 'HbA1c', value: '5.7 mmol/mol', date: '2026-10-03', category: 'Blood sugar', source: 'Provided by you', status: 'confirmed' },
          { id: 'a1c-2', label: 'HbA1c', value: '5.8%', date: '2026-10-03', category: 'Blood sugar', source: 'Provided by you', status: 'confirmed' },
          { id: 'chol-1', label: 'Total cholesterol', value: '7.9 mg/dL', date: '2026-10-03', category: 'Cholesterol', source: 'Provided by you', status: 'confirmed' },
        ],
        topics: [], links: [], treatments: [], visits: [],
        demographics: { ageAtMeasurement: 38, measurementDate: '2026-10-03' },
      },
    }, (type, data) => events.push({ type, data }), new AbortController().signal);

    const answer = events.find((event) => event.type === 'answer')?.data;
    assert.ok(answer);
    assert.match(answer.answer, /BMI is 33\.1.*adult obesity screening range/);
    assert.match(answer.answer, /total cholesterol entry \(7\.9 mg\/dL\).*unusual or unclear value\/unit pairing/);
    assert.doesNotMatch(answer.answer, /7\.9 mmol\/L|if the report says/);
    assert.match(answer.answer, /HbA1c result of 5\.8% is in the range commonly used to flag increased diabetes risk/);
    assert.match(answer.answer, /average blood sugar over about three months/);
    assert.match(answer.answer, /HbA1c history includes 5\.7 mmol\/mol.*unusually low for mmol\/mol/i);
    assert.match(answer.answer, /Could you confirm the cholesterol unit on the original report\?/);
    assert.doesNotMatch(answer.answer, /I can’t rate|records reviewed show|not enough to rate overall health/i);
    assert.deepEqual(answer.unknowns, []);
    assert.deepEqual(answer.nextSteps, ['How do I confirm the cholesterol unit?', 'What does a full lipid panel show?']);
    for (const reference of ['R1', 'R2', 'R3', 'R4', 'R5', 'W1', 'W2', 'W3']) assert.ok(answer.citations.includes(reference), 'missing ' + reference + ' in ' + JSON.stringify(answer.citations));
    assert.equal(requests.length, 2);
    assert.match(requests[1].instructions, /do not stop at “there is not enough information” when a supported measurement can be explained/);
    assert.match(requests[1].instructions, /LDL is above the common adult guide/);
    assert.match(requests[1].instructions, /two short paragraphs/);
    assert.match(requests[1].instructions, /Never infer age from weight or height/);
    assert.match(requests[1].instructions, /specific Keep exploring questions/);
    assert.doesNotMatch(requests[1].instructions, /Say once that the available details are only a partial picture/);
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
