import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { PDFDocument } from 'pdf-lib';
import { createResponse, excludeDocumentContextDuplicates, extractDocumentClaims, healthAreaContextInstruction, HEALTH_SEARCH_DOMAINS, HealthSearchConfigurationError, HealthVideoSearchUnavailableError, mapVideoFrameClaims, searchHealthSources, separateGeneralMedicalNotes } from './openaiResponses.mjs';
import { INTAKE_MEDIA_TYPES_BY_EXTENSION, INTAKE_MIME_EXTENSIONS, resolveSupportedIntakeMediaType } from '../../src/services/intakeFileTypes.mjs';

const emptyDocumentExtraction = () => ({
  claims: [],
  documentContext: { documentType: null, dates: [], entities: [], notes: [] },
  documentAssessment: { category: 'medical_record', confidence: 0.95 },
});

test('uses one supported document map for PDF, Word, RTF, OpenDocument and text files', () => {
  for (const [extension, mediaType] of Object.entries(INTAKE_MEDIA_TYPES_BY_EXTENSION)) {
    assert.ok(INTAKE_MIME_EXTENSIONS[mediaType]?.includes(`.${extension}`), `${extension} must be accepted by the server for ${mediaType}`);
    assert.equal(resolveSupportedIntakeMediaType({ name: `record.${extension}`, mimeType: 'application/octet-stream' }), mediaType);
  }
  assert.equal(resolveSupportedIntakeMediaType({ name: 'policy.rtf', mimeType: 'text/rtf' }), 'text/rtf');
});

test('sends PDFs and rich documents through the shared file extraction path', async () => {
  const previousFetch = globalThis.fetch;
  const previousApiKey = process.env.OPENAI_API_KEY;
  const requests = [];
  process.env.OPENAI_API_KEY = 'synthetic-test-key';
  globalThis.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ status: 'completed', output_text: JSON.stringify(emptyDocumentExtraction()) }) };
  };
  try {
    for (const [filename, mediaType] of [
      ['policy.pdf', 'application/pdf'],
      ['visit.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      ['note.rtf', 'application/rtf'],
      ['summary.odt', 'application/vnd.oasis.opendocument.text'],
      ['note.txt', 'text/plain'],
    ]) {
      await extractDocumentClaims({ bytes: Buffer.from('synthetic document'), filename, mediaType, purpose: 'medical' });
    }
    for (const [index, request] of requests.entries()) {
      const part = request.input[0].content.find((item) => item.type === 'input_file');
      assert.ok(part, `${request.input[0].content[1]?.filename} should use input_file`);
      assert.match(part.file_data, /^data:(application\/pdf|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|application\/rtf|application\/vnd\.oasis\.opendocument\.text|text\/plain);base64,/);
      assert.equal(request.input[0].content.some((item) => item.type === 'input_image'), false);
      assert.equal(part.detail, index === 0 ? 'high' : undefined);
    }
  } finally {
    globalThis.fetch = previousFetch;
    if (previousApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousApiKey;
  }
});

test('image health extraction separates personal lipid results from the printed interpretation table', async () => {
  const previousFetch = globalThis.fetch;
  const previousApiKey = process.env.OPENAI_API_KEY;
  const requests = [];
  const claims = [
    ['Total Cholesterol', '156', 'mg/dL', '0 - 200'],
    ['Triglycerides level', '150', 'mg/dL', '0 - 170'],
    ['HDL Cholesterol', '45', 'mg/dL', '40 - 70'],
    ['LDL Cholesterol', '81.00', 'mg/dL', '0 - 100'],
    ['VLDL Cholesterol', '30.00', 'mg/dL', '6 - 38'],
    ['LDL/HDL Ratio', '1.80', null, '2.5 - 3.5'],
    ['Total Cholesterol/HDL Ratio', '3.47', null, '3.5 - 5'],
  ].map(([label, value, unit, referenceRange]) => ({
    kind: 'measurement', label, value, unit, referenceRange, method: null,
    effectiveAt: '2023-06-24', confidence: 0.98, page: null,
    quote: `${label} ${value}${unit ? ` ${unit}` : ''}`,
  }));
  process.env.OPENAI_API_KEY = 'synthetic-test-key';
  globalThis.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ status: 'completed', output_text: JSON.stringify({
      claims,
      documentContext: { documentType: 'Biochemistry Lipid Profile', dates: [{ kind: 'report_date', value: '2023-06-24', page: null, quote: 'Report Date: 24/06/2023' }], entities: [], notes: [{ kind: 'clinical_decision_limits', value: 'General desirable, borderline high and high categories.', page: null, quote: 'Desirable Levels · Borderline High · High' }] },
      documentAssessment: { category: 'medical_record', confidence: 0.98 },
    }) }) };
  };
  try {
    const result = await extractDocumentClaims({ bytes: Buffer.from('synthetic image bytes'), filename: 'lipid.png', mediaType: 'image/png' });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].store, false);
    assert.ok(requests[0].input[0].content.some((part) => part.type === 'input_image' && part.detail === 'high'));
    const prompt = requests[0].input[0].content.find((part) => part.type === 'input_text')?.text ?? '';
    assert.match(prompt, /RESULT column row by row/);
    assert.match(prompt, /Do not mistake desirable\/borderline\/high decision-limit tables/);
    assert.deepEqual(result.claims.map(({ label, value, unit }) => [label, value, unit]), claims.map(({ label, value, unit }) => [label, value, unit]));
    assert.equal(result.claims.every((claim) => claim.referenceRange), true);
    assert.equal(result.documentContext.notes[0].kind, 'clinical_decision_limits');
    assert.deepEqual(result.documentPurposeSegments, [{ category: 'medical_record', confidence: 0.98 }]);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousApiKey;
  }
});

test('retries an incomplete long document once with a larger output allowance', async () => {
  const previousFetch = globalThis.fetch;
  const previousApiKey = process.env.OPENAI_API_KEY;
  const outputCaps = [];
  process.env.OPENAI_API_KEY = 'synthetic-test-key';
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    outputCaps.push(request.max_output_tokens);
    return {
      ok: true,
      json: async () => outputCaps.length === 1
        ? { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output_text: '' }
        : { status: 'completed', output_text: JSON.stringify(emptyDocumentExtraction()) },
    };
  };
  try {
    const result = await extractDocumentClaims({ bytes: Buffer.from('synthetic policy'), filename: 'policy.pdf', mediaType: 'application/pdf', purpose: 'insurance' });
    assert.deepEqual(outputCaps, [4000, 8000]);
    assert.deepEqual(result.claims, []);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousApiKey;
  }
});

test('reports a clear split-file recovery when a document still exceeds the bounded retry', async () => {
  const previousFetch = globalThis.fetch;
  const previousApiKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'synthetic-test-key';
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output_text: '' }) });
  try {
    await assert.rejects(
      extractDocumentClaims({ bytes: Buffer.from('synthetic'), filename: 'long.pdf', mediaType: 'application/pdf' }),
      /Split it into smaller documents and retry\. No claims were saved\./,
    );
  } finally {
    globalThis.fetch = previousFetch;
    if (previousApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousApiKey;
  }
});

test('splits long insurance PDFs into page batches and combines all candidate terms before returning', async () => {
  const previousFetch = globalThis.fetch;
  const previousApiKey = process.env.OPENAI_API_KEY;
  const sourcePdf = await PDFDocument.create();
  for (let index = 0; index < 7; index += 1) sourcePdf.addPage([612, 792]);
  const bytes = Buffer.from(await sourcePdf.save());
  const batches = [];
  const requests = [];
  process.env.OPENAI_API_KEY = 'synthetic-test-key';
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    requests.push(request);
    const parts = request.input[0].content;
    const file = parts.find((part) => part.type === 'input_file');
    const batchPdf = await PDFDocument.load(Buffer.from(file.file_data.split(',')[1], 'base64'));
    batches.push({ pages: batchPdf.getPageCount(), note: parts.find((part) => part.type === 'input_text')?.text });
    const number = batches.length;
    const page = number === 1 ? 2 : 6;
    return { ok: true, json: async () => ({ status: 'completed', output_text: JSON.stringify({
      claims: [{ kind: 'coverage_term', label: `Term ${number}`, value: `Value ${number}`, unit: null, referenceRange: null, method: null, effectiveAt: null, confidence: 0.9, page, quote: `Printed policy quote ${number}` }],
      documentContext: { documentType: 'Insurance policy', dates: [{ kind: 'issued_at', value: `2026-09-0${number}`, page, quote: `Issued ${number}` }], entities: [{ kind: 'insurer', value: 'Example insurer', page: null, quote: null }], notes: [] },
      documentAssessment: { category: 'insurance_policy', confidence: 0.95 },
    }) }) };
  };
  try {
    const result = await extractDocumentClaims({ bytes, filename: 'policy.pdf', mediaType: 'application/pdf', purpose: 'insurance' });
    assert.deepEqual(batches.map((batch) => batch.pages), [5, 2]);
    assert.match(batches[0].note, /original PDF pages 1–5/);
    assert.match(batches[1].note, /original PDF pages 6–7/);
    assert.equal(requests.every((request) => request.store === false), true);
    assert.equal(requests.every((request) => request.input[0].content.some((part) => part.type === 'input_text' && part.text.includes('insurance policy'))), true);
    assert.deepEqual(result.claims.map((claim) => claim.label), ['Term 1', 'Term 2']);
    assert.deepEqual(result.claims.map((claim) => claim.page), [2, 6]);
    assert.equal(result.documentContext.documentType, 'Insurance policy');
    assert.equal(result.documentContext.dates.length, 2);
    assert.equal(result.documentContext.entities.length, 1);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousApiKey;
  }
});

test('maps video evidence to trusted sampled frame timestamps and drops unsupported locations', () => {
  const frames = [{ timestampSeconds: 12.375 }, { timestampSeconds: 38.5 }];
  const claims = [
    { frameIndex: 1, kind: 'measurement', label: 'Heart rate', value: '72', unit: 'bpm', quote: 'Heart rate 72 bpm' },
    { frameIndex: 7, kind: 'measurement', label: 'Unsupported', value: '1', quote: 'Unsupported 1' },
    { frameIndex: 0, kind: 'measurement', label: 'Unquoted', value: '2', quote: null },
  ];
  const mapped = mapVideoFrameClaims(claims, frames);
  assert.equal(mapped.length, 1);
  assert.equal(mapped[0].timestampSeconds, 38.5);
  assert.equal(mapped[0].page, null);
  assert.equal(mapped[0].frameIndex, undefined);
});

test('keeps source-wide guidance with the document instead of returning it as a profile claim', () => {
  const claims = [
    { label: 'Triglyceride', value: '184 mg/dL', quote: 'Triglyceride 184 mg/dL <150' },
    { label: 'Lipid profile fasting condition', value: 'Reports are best obtained with 10 hours fasting.', quote: 'Reports of Lipid Profile are best obtained with 10 hours fasting.' },
  ];
  const notes = [{ kind: 'fasting_guidance', value: 'Reports of Lipid Profile are best obtained with 10 hours fasting.', quote: 'Reports of Lipid Profile are best obtained with 10 hours fasting.' }];
  assert.deepEqual(excludeDocumentContextDuplicates(claims, notes), [claims[0]]);
});

test('does not discard a measured result merely because its note category is similar', () => {
  const result = { label: 'Fasting glucose', value: '5.4 mmol/L', quote: 'Fasting glucose 5.4 mmol/L' };
  assert.deepEqual(excludeDocumentContextDuplicates([result], [{ kind: 'fasting_guidance', value: 'Fast for 10 hours before collection.' }]), [result]);
});

test('moves generic lipid-panel fasting instructions out of personal health claims', () => {
  const guidance = {
    kind: 'other', label: 'Lipid profile fasting condition',
    value: 'Reports of Lipid Profile are best obtained with 10 hours fasting',
    page: 1, quote: 'Reports of Lipid Profile are best obtained with 10 hours fasting.',
  };
  const result = separateGeneralMedicalNotes([guidance], { notes: [] });
  assert.deepEqual(result.claims, []);
  assert.deepEqual(result.documentContext.notes, [{
    kind: 'fasting_guidance', value: guidance.value, page: 1, quote: guidance.quote,
  }]);
});

test('keeps explicit lab measurements while moving educational guidance into document context', () => {
  const measurement = { kind: 'measurement', label: 'Triglyceride', value: '184', unit: 'mg/dL', quote: 'Triglyceride 184 mg/dL <150', page: 1 };
  const note = { kind: 'other', label: 'Clinical significance', value: 'This text is for educational purposes.', quote: 'Clinical significance: for educational purposes only.', page: 1 };
  const result = separateGeneralMedicalNotes([measurement, note], { notes: [] });
  assert.deepEqual(result.claims, [measurement]);
  assert.equal(result.documentContext.notes[0].kind, 'other');
  assert.equal(result.documentContext.notes[0].page, 1);
});

test('health-area context is only a relevance hint and does not replace exact source evidence', () => {
  const instruction = healthAreaContextInstruction('Blood pressure');
  assert.match(instruction, /organization area/);
  assert.match(instruction, /never treat the selection as a diagnosis/);
  assert.match(instruction, /exact quote from this document/);
  assert.equal(healthAreaContextInstruction('x'.repeat(1000)).length < 400, true);
});

test('health search runs separate allowlisted article and YouTube searches, so videos reach the thumbnail feed', async () => {
  const previousFetch = globalThis.fetch;
  const previousApiKey = process.env.OPENAI_API_KEY;
  const requestPayloads = [];
  process.env.OPENAI_API_KEY = 'synthetic-test-key';
  globalThis.fetch = async (_url, options) => {
    const requestPayload = JSON.parse(options.body);
    requestPayloads.push(requestPayload);
    const videoSearch = requestPayload.tools[0].filters.allowed_domains.includes('youtube.com');
    return {
      ok: true,
      json: async () => ({
        output_text: videoSearch ? 'Official video source results.' : 'Overview: general health information. Key points: use trusted guidance.',
        output: [
          ...(videoSearch ? [{ type: 'message', content: [{ type: 'output_text', text: 'An official blood sugar video.', annotations: [{ type: 'url_citation', url_citation: { title: 'Blood sugar basics · Published CDC video', url: 'https://www.youtube.com/watch?v=01cDEF123_-', start_index: 0, end_index: 31 } }] }] }] : []),
          { type: 'web_search_call', action: { sources: [
            ...(videoSearch
              ? [
                { url: 'https://www.youtube.com/watch?v=01cDEF123_-' },
                ...Array.from({ length: 3 }, (_, index) => ({
                  title: `Blood sugar basics · Official health video ${index + 2}`,
                  url: `https://www.youtube.com/watch?v=${String(index + 2).padStart(2, '0')}cDEF123_-`,
                })),
                { title: 'Channel page', url: 'https://www.youtube.com/@cdc' },
              ]
              : [...Array.from({ length: 8 }, (_, index) => ({ title: `Trusted article ${index + 1}`, url: `https://www.cdc.gov/health/article-${index + 1}` })), { title: 'Unapproved source', url: 'https://example.com/health-video' }]),
          ] } },
        ],
      }),
    };
  };
  try {
    const result = await searchHealthSources({ query: 'Blood sugar', signal: new AbortController().signal });
    assert.ok(HEALTH_SEARCH_DOMAINS.includes('youtube.com'));
    assert.ok(HEALTH_SEARCH_DOMAINS.includes('youtu.be'));
    assert.equal(result.sources.length, 6);
    assert.equal(result.sources.filter(({ url }) => !url.includes('youtube.com')).length, 3);
    assert.equal(result.sources.filter(({ url }) => url.includes('youtube.com')).length, 3);
    assert.equal(result.sources.at(-1).title, 'Blood sugar basics · Official health video 3');
    assert.equal(result.sources[3].title, 'Blood sugar basics · Published CDC video');
    assert.equal(requestPayloads.length, 2);
    assert.ok(requestPayloads.every((requestPayload) => requestPayload.store === false && requestPayload.tool_choice === 'required'));
    const articleRequest = requestPayloads.find((requestPayload) => !requestPayload.tools[0].filters.allowed_domains.includes('youtube.com'));
    const videoRequest = requestPayloads.find((requestPayload) => requestPayload.tools[0].filters.allowed_domains.includes('youtube.com'));
    assert.ok(articleRequest);
    assert.ok(videoRequest);
    assert.match(articleRequest.input, /Do not include videos in this search/);
    assert.deepEqual(articleRequest.tools[0].filters.allowed_domains, HEALTH_SEARCH_DOMAINS.filter((domain) => domain !== 'youtube.com' && domain !== 'youtu.be'));
    assert.match(videoRequest.input, /Search YouTube for up to three relevant health education videos/);
    assert.deepEqual(videoRequest.tools[0].filters.allowed_domains, ['youtube.com', 'youtu.be']);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousApiKey;
  }
});

test('health search repeats a targeted YouTube search when the first video search returns no playable video', async () => {
  const previousFetch = globalThis.fetch;
  const previousApiKey = process.env.OPENAI_API_KEY;
  let videoSearchCount = 0;
  process.env.OPENAI_API_KEY = 'synthetic-test-key';
  globalThis.fetch = async (_url, options) => {
    const requestPayload = JSON.parse(options.body);
    const videoSearch = requestPayload.tools[0].filters.allowed_domains.includes('youtube.com');
    if (videoSearch) videoSearchCount += 1;
    return {
      ok: true,
      json: async () => ({
        output_text: videoSearch ? 'Video search.' : 'Overview: trusted information. Key points: consult public guidance.',
        output: [{ type: 'web_search_call', action: { sources: videoSearch
          ? (videoSearchCount === 1 ? [{ title: 'YouTube channel', url: 'https://www.youtube.com/@cdc' }] : [{ title: 'Heart health basics · CDC video', url: 'https://youtu.be/01cDEF123_-' }])
          : [{ title: 'Heart health information', url: 'https://www.cdc.gov/heart-disease/about/' }],
        } }],
      }),
    };
  };
  try {
    const result = await searchHealthSources({ query: 'Heart health', signal: new AbortController().signal });
    assert.equal(videoSearchCount, 2);
    assert.equal(result.sources.filter(({ url }) => url.includes('youtu.be')).length, 1);
    assert.equal(result.sources[0].title, 'Heart health information');
  } finally {
    globalThis.fetch = previousFetch;
    if (previousApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousApiKey;
  }
});

test('health search does not report a complete edition when no playable video is found after the focused retry', async () => {
  const previousFetch = globalThis.fetch;
  const previousApiKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'synthetic-test-key';
  globalThis.fetch = async (_url, options) => {
    const requestPayload = JSON.parse(options.body);
    const videoSearch = requestPayload.tools[0].filters.allowed_domains.includes('youtube.com');
    return {
      ok: true,
      json: async () => ({
        output_text: videoSearch ? 'No video result.' : 'Overview: general health education.',
        output: [{ type: 'web_search_call', action: { sources: videoSearch
          ? [{ title: 'YouTube channel', url: 'https://www.youtube.com/@cdc' }]
          : [{ title: 'Heart health information', url: 'https://www.cdc.gov/heart-disease/about/' }],
        } }],
      }),
    };
  };
  try {
    await assert.rejects(
      searchHealthSources({ query: 'Heart health', signal: new AbortController().signal }),
      (error) => error instanceof HealthVideoSearchUnavailableError && error.code === 'trusted_health_videos_unavailable',
    );
  } finally {
    globalThis.fetch = previousFetch;
    if (previousApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousApiKey;
  }
});

test('health search gives a safe configuration message when the provider rejects its API credential', async () => {
  const previousFetch = globalThis.fetch;
  const previousApiKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'synthetic-test-key';
  globalThis.fetch = async () => ({ ok: false, status: 401 });
  try {
    await assert.rejects(
      searchHealthSources({ query: 'Cholesterol', signal: new AbortController().signal }),
      (error) => error instanceof HealthSearchConfigurationError
        && error.code === 'health_search_authentication_failed'
        && !error.message.includes('synthetic-test-key'),
    );
  } finally {
    globalThis.fetch = previousFetch;
    if (previousApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousApiKey;
  }
});

test('Ask provider failures return safe diagnostic codes without exposing provider bodies or credentials', async () => {
  const previousFetch = globalThis.fetch;
  const previousApiKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'synthetic-private-test-key';
  const failures = [
    [401, 'ai_credential_rejected'],
    [403, 'ai_access_denied'],
    [404, 'ai_model_unavailable'],
    [429, 'ai_rate_limited'],
    [503, 'ai_provider_unavailable'],
    [400, 'ai_request_rejected'],
  ];
  try {
    for (const [status, code] of failures) {
      globalThis.fetch = async () => ({ ok: false, status, text: async () => 'private provider response body' });
      await assert.rejects(createResponse({ input: [], instructions: 'test', tools: [], toolChoice: 'auto' }), (error) => {
        assert.equal(error.code, code);
        assert.doesNotMatch(error.message, /private provider response body|synthetic-private-test-key/);
        return true;
      });
    }
    globalThis.fetch = async () => {
      const requestFailure = new TypeError('private network detail');
      requestFailure.cause = Object.assign(new Error('private socket detail'), { code: 'ECONNRESET' });
      throw requestFailure;
    };
    await assert.rejects(createResponse({ input: [], instructions: 'test', tools: [], toolChoice: 'auto' }), (error) => {
      assert.equal(error.code, 'ai_provider_unreachable');
      assert.equal(error.causeCode, 'ECONNRESET');
      assert.doesNotMatch(error.message, /private network detail|synthetic-private-test-key/);
      return true;
    });
  } finally {
    globalThis.fetch = previousFetch;
    if (previousApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousApiKey;
  }
});
