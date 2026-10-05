import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createOpenAIAudioTranscriptionPort } from './openaiAudioTranscription.mjs';

const transcription = {
  text: 'My blood pressure was 118 over 76.',
  duration: 4.2,
  segments: [{ start: 0.8, end: 3.9, text: 'My blood pressure was 118 over 76.' }],
};

function configuredPort(fetchImpl) {
  return createOpenAIAudioTranscriptionPort({
    getStatus: () => ({ configured: true, provider: 'openai' }),
    getApiKey: () => 'synthetic-unit-key',
    fetchImpl,
  });
}

test('OpenAI transcription port requests timestamped segments and returns only bounded source segments', async () => {
  let captured;
  const port = configuredPort(async (url, request) => {
    captured = { url: String(url), request };
    return new Response(JSON.stringify(transcription), { status: 200, headers: { 'content-type': 'application/json' } });
  });

  const result = await port.transcribe({
    bytes: Buffer.from('synthetic audio bytes'),
    filename: 'synthetic-voice.mp3',
    mediaType: 'audio/mpeg',
  });

  assert.equal(captured.url, 'https://api.openai.com/v1/audio/transcriptions');
  assert.equal(captured.request.method, 'POST');
  assert.equal(captured.request.headers.authorization, 'Bearer synthetic-unit-key');
  const body = captured.request.body;
  assert.equal(body.get('model'), 'whisper-1');
  assert.equal(body.get('response_format'), 'verbose_json');
  assert.equal(body.get('timestamp_granularities[]'), 'segment');
  const file = body.get('file');
  assert.equal(file.name, 'synthetic-voice.mp3');
  assert.equal(file.type, 'audio/mpeg');
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), Buffer.from('synthetic audio bytes'));
  assert.deepEqual(result, { duration: 4.2, segments: transcription.segments });
});

test('OpenAI transcription port fails closed when provider credentials are absent', async () => {
  let calls = 0;
  const port = createOpenAIAudioTranscriptionPort({
    getStatus: () => ({ configured: false, provider: 'openai' }),
    getApiKey: () => '',
    fetchImpl: async () => { calls += 1; throw new Error('must not call'); },
  });
  await assert.rejects(port.transcribe({ bytes: Buffer.from('x'), filename: 'voice.wav', mediaType: 'audio/wav' }), { code: 'audio_transcription_unavailable' });
  assert.equal(calls, 0);
});

test('OpenAI transcription errors are safe and do not expose provider response content', async () => {
  const port = configuredPort(async () => new Response('sensitive provider error body', { status: 401 }));
  await assert.rejects(
    port.transcribe({ bytes: Buffer.from('synthetic'), filename: 'voice.mp3', mediaType: 'audio/mpeg' }),
    (error) => error.code === 'ai_credential_rejected' && !error.message.includes('sensitive provider error body'),
  );
});

test('OpenAI transcription refuses to make untimestamped claims', async () => {
  const port = configuredPort(async () => new Response(JSON.stringify({ text: 'some words', duration: 4 }), { status: 200 }));
  await assert.rejects(
    port.transcribe({ bytes: Buffer.from('synthetic'), filename: 'voice.mp3', mediaType: 'audio/mpeg' }),
    /timestamped speech segments/,
  );
});

test('OpenAI transcription passes cancellation through without converting it to a provider error', async () => {
  const controller = new AbortController();
  const port = configuredPort(async (_url, request) => {
    controller.abort();
    assert.equal(request.signal.aborted, true);
    const error = new Error('aborted');
    error.name = 'AbortError';
    throw error;
  });
  await assert.rejects(
    port.transcribe({ bytes: Buffer.from('synthetic'), filename: 'voice.mp3', mediaType: 'audio/mpeg', signal: controller.signal }),
    { name: 'AbortError' },
  );
});
