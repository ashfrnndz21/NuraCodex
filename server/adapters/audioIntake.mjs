import { inspectAudioDuration } from './audioProcessor.mjs';
import { boundedTranscriptSegments, mapAudioTranscriptClaims } from './audioEvidence.mjs';
import { requireAudioTranscriptionPort } from '../ports/AudioTranscription.mjs';

/** Compose local preflight, a replaceable transcription port and quote-backed suggestions. */
export function createAudioIntakeProcessor({ transcriptionPort, suggestClaims, inspectDuration = inspectAudioDuration }) {
  const port = requireAudioTranscriptionPort(transcriptionPort);
  if (typeof suggestClaims !== 'function') throw new TypeError('A health-suggestion function is required.');

  return async function processAudioIntake({ bytes, filename, mediaType, signal, onProgress }) {
    const durationSeconds = await inspectDuration({ bytes, mediaType, signal });
    if (signal?.aborted) {
      const error = new Error('Audio review was stopped.');
      error.name = 'AbortError';
      throw error;
    }
    onProgress?.('audio_transcription_started', { durationSeconds });
    const transcription = await port.transcribe({ bytes, filename, mediaType, signal });
    if (signal?.aborted) {
      const error = new Error('Audio review was stopped.');
      error.name = 'AbortError';
      throw error;
    }
    const segments = boundedTranscriptSegments(transcription);
    if (!segments.length) throw new Error('No timestamped speech could be prepared for review.');
    onProgress?.('audio_transcription_completed', { segmentCount: segments.length });
    onProgress?.('audio_suggestions_started');
    const result = await suggestClaims({ segments, filename, mediaType, signal });
    if (signal?.aborted) {
      const error = new Error('Audio review was stopped.');
      error.name = 'AbortError';
      throw error;
    }
    const claims = mapAudioTranscriptClaims(result?.claims, segments);
    onProgress?.('audio_suggestions_completed', { suggestionCount: claims.length });
    return {
      claims,
      documentContext: null,
      audio: { durationSeconds, segmentCount: segments.length },
    };
  };
}
