import { AUDIO_PROCESSING_CONSENT_VERSION } from '../../src/services/audioIntakePresentation.mjs';

/**
 * Port contract for a transcription implementation.
 * Implementations expose transcribe({ bytes, filename, mediaType, signal }) and
 * return { duration, segments: [{ start, end, text }] }.
 */
export const OPENAI_AUDIO_PROCESSING_CONSENT = AUDIO_PROCESSING_CONSENT_VERSION;

export class AudioTranscriptionUnavailableError extends Error {
  constructor(message = 'Nura’s audio transcription service is not enabled on this development server.') {
    super(message);
    this.name = 'AudioTranscriptionUnavailableError';
    this.code = 'audio_transcription_unavailable';
  }
}

export function requireAudioTranscriptionPort(port) {
  if (!port || typeof port.transcribe !== 'function') {
    throw new TypeError('An audio transcription port with transcribe() is required.');
  }
  return port;
}

/** Exact-version gate: broad document consent does not authorize audio processing. */
export function hasAudioProcessingConsent(value) {
  return value === OPENAI_AUDIO_PROCESSING_CONSENT;
}
