import { Buffer } from 'node:buffer';
import { AudioTranscriptionUnavailableError } from '../ports/AudioTranscription.mjs';
import { getOpenAIStatus } from './openaiResponses.mjs';
import { prepareAudioForOpenAITranscription } from './audioProcessor.mjs';

export const OPENAI_AUDIO_TRANSCRIPTION_MODEL = 'whisper-1';
const MAX_TRANSCRIPTION_FILE_BYTES = 25 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 100_000;

function providerError(status) {
  const code = status === 401 ? 'ai_credential_rejected'
    : status === 403 ? 'ai_access_denied'
      : status === 404 ? 'ai_model_unavailable'
        : status === 429 ? 'ai_rate_limited'
          : status >= 500 ? 'ai_provider_unavailable'
            : 'ai_request_rejected';
  const error = new Error(status === 401
    ? 'The configured audio transcription service could not authenticate.'
    : status === 429
      ? 'The audio transcription service is busy. Try again shortly.'
      : 'The configured audio transcription service could not complete this operation.');
  error.code = code;
  return error;
}

function normalizeSegments(payload) {
  if (!Array.isArray(payload?.segments)) return [];
  return payload.segments.flatMap((segment) => {
    const start = Number(segment?.start);
    const end = Number(segment?.end);
    const text = typeof segment?.text === 'string' ? segment.text.trim().slice(0, 1200) : '';
    if (!Number.isFinite(start) || start < 0 || !Number.isFinite(end) || end <= start || !text) return [];
    return [{ start, end, text }];
  }).slice(0, 600);
}

/** OpenAI's file-transcription adapter for the AudioTranscription port. */
export function createOpenAIAudioTranscriptionPort({
  fetchImpl = globalThis.fetch,
  getStatus = getOpenAIStatus,
  getApiKey = () => process.env.OPENAI_API_KEY,
  prepareAudio = prepareAudioForOpenAITranscription,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('An audio transcription fetch implementation is required.');
  return {
    async transcribe({ bytes, filename, mediaType, signal }) {
      const status = getStatus();
      const apiKey = getApiKey();
      if (!status?.configured || !apiKey) throw new AudioTranscriptionUnavailableError('Nura’s audio service is not configured on this server. The recording was not sent.');
      if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1) throw new Error('The selected recording is empty.');
      if (signal?.aborted) {
        const error = new Error('Audio review was stopped.');
        error.name = 'AbortError';
        throw error;
      }

      const prepared = await prepareAudio({ bytes, filename, mediaType, signal });
      if (!prepared?.bytes?.byteLength || prepared.bytes.byteLength > MAX_TRANSCRIPTION_FILE_BYTES) {
        throw new Error('This recording is empty or larger than the 25 MB transcription limit. Choose a shorter or smaller copy.');
      }
      const form = new FormData();
      form.append('file', new Blob([Buffer.from(prepared.bytes)], { type: prepared.mediaType }), prepared.filename);
      form.append('model', OPENAI_AUDIO_TRANSCRIPTION_MODEL);
      form.append('response_format', 'verbose_json');
      form.append('timestamp_granularities[]', 'segment');
      const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
      const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
      let response;
      try {
        response = await fetchImpl('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: { authorization: `Bearer ${apiKey}` },
          body: form,
          signal: requestSignal,
        });
      } catch (cause) {
        if (signal?.aborted || cause?.name === 'AbortError') throw cause;
        if (timeoutSignal.aborted) {
          const error = new Error('Audio transcription took too long. Your original recording is still on this device; try a shorter file.');
          error.code = 'ai_provider_timeout';
          throw error;
        }
        const error = new Error('Nura could not reach the configured audio transcription service.');
        error.code = 'ai_provider_unreachable';
        throw error;
      }
      if (!response.ok) throw providerError(response.status);

      let payload;
      try { payload = await response.json(); }
      catch { throw new Error('The audio service returned unreadable transcription details. No claims were saved.'); }
      const segments = normalizeSegments(payload);
      if (!segments.length) throw new Error('The audio service did not return timestamped speech segments. No claims were saved.');
      return { duration: Number.isFinite(Number(payload.duration)) ? Number(payload.duration) : null, segments };
    },
  };
}
