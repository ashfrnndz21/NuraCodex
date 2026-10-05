import { Buffer } from 'node:buffer';
import { createResponse as openAIResponse, extractDocumentClaims as openAIExtract, extractVideoFrameClaims as openAIVideoExtract, getOpenAIStatus, searchHealthArticles as openAIArticleSearch, searchHealthSources as openAISearch, suggestAudioClaims as openAISuggestAudioClaims } from './openaiResponses.mjs';
import { LanguageModelUnavailableError } from '../ports/LanguageModel.mjs';
import { sampleVideoFrames } from './videoProcessor.mjs';
import { extractLocalSampleReport, LocalSampleMismatchError, resolveLocalSampleReport, verifyLocalSampleReport } from './localSampleReports.mjs';
import { createHealthFeedSearch } from './healthFeedSearch.mjs';
import { getYouTubeVideoSearchStatus, searchYouTubeHealthVideos } from './youtubeDataApi.mjs';
import { createFallbackArticleSearch, createMedlinePlusWebService } from './medlinePlusWebService.mjs';
import { createAudioIntakeProcessor } from './audioIntake.mjs';
import { createOpenAIAudioTranscriptionPort } from './openaiAudioTranscription.mjs';

const searchExploreArticles = createFallbackArticleSearch({ searchPrimary: openAIArticleSearch, searchFallback: createMedlinePlusWebService() });
const searchExploreHealthFeed = createHealthFeedSearch({ searchArticles: searchExploreArticles, searchVideos: searchYouTubeHealthVideos });
const syntheticAudioRetryAttempts = new Map();

/** Audio requires a configured live provider and a separate, per-file user consent. */
export function getAudioIntakeProcessor() {
  if (process.env.NODE_ENV === 'test' && process.env.NURA_TEST_AUDIO_ADAPTER === 'synthetic') return createAudioIntakeProcessor({
    inspectDuration: async () => 8.5,
    transcriptionPort: { transcribe: async ({ bytes }) => {
      const key = Buffer.from(bytes).toString('hex');
      if (Buffer.from(bytes).toString('utf8') === 'synthetic-fail-once') {
        const attempts = syntheticAudioRetryAttempts.get(key) ?? 0;
        syntheticAudioRetryAttempts.set(key, attempts + 1);
        if (attempts === 0) throw new Error('Synthetic transcription service unavailable; try again.');
      }
      return {
        duration: 8.5,
        segments: [
          { start: 1.25, end: 2.8, text: 'My HbA1c was 5.8 percent.' },
          { start: 3.1, end: 5.4, text: 'My total cholesterol result was 210 mg/dL.' },
          { start: 5.7, end: 8.25, text: 'I take vitamin D, 1000 IU daily.' },
        ],
      };
    } },
    suggestClaims: async () => ({ claims: [
      { kind: 'measurement', label: 'HbA1c', value: '5.8', unit: '%', confidence: 0.9, segmentIndex: 0, quote: 'HbA1c was 5.8 percent', subject: 'self' },
      { kind: 'measurement', label: 'Total cholesterol', value: '210', unit: 'mg/dL', confidence: 0.9, segmentIndex: 1, quote: 'total cholesterol result was 210 mg/dL', subject: 'self' },
      { kind: 'medication', label: 'Vitamin D', value: '1000', unit: 'IU daily', confidence: 0.9, segmentIndex: 2, quote: 'vitamin D, 1000 IU daily', subject: 'self' },
    ] }),
  });
  if (process.env.NURA_ENABLE_AUDIO_INTAKE === 'false' || !getOpenAIStatus().configured) return null;
  return createAudioIntakeProcessor({ transcriptionPort: createOpenAIAudioTranscriptionPort(), suggestClaims: openAISuggestAudioClaims });
}

export function getLanguageModel() {
  const provider = process.env.NURA_LLM_PROVIDER || 'openai';
  if (provider === 'openai') return { ...getOpenAIStatus(), createResponse: openAIResponse };
  throw new LanguageModelUnavailableError(`Nura’s configured model provider (“${provider}”) has no adapter installed.`);
}

export function getLanguageModelStatus() {
  try { const { provider, configured, authentication, model } = getLanguageModel(); return { provider, configured, authentication, model }; }
  catch (_error) { return { provider: process.env.NURA_LLM_PROVIDER || 'openai', configured: false, model: process.env.NURA_MODEL || process.env.OPENAI_MODEL || 'gpt-5.6-luna' }; }
}

export function extractDocumentClaims(input) { return openAIExtract(input); }
export function extractLocalSampleDocument(input) { return resolveLocalSampleReport(input); }
export function verifyLocalSampleDocument(input) { return verifyLocalSampleReport(input); }
export function mapLocalSampleDocument(input) { return extractLocalSampleReport(input); }
export { LocalSampleMismatchError };
export { HealthSearchConfigurationError, HealthVideoSearchUnavailableError } from './openaiResponses.mjs';
export { getYouTubeVideoSearchStatus };
export async function extractVideoClaims({ bytes, mediaType, purpose = 'medical', signal, onFramesReady }) {
  if (purpose !== 'medical') throw new Error('Video review is only available for medical records.');
  const sampled = await sampleVideoFrames({ bytes, mediaType, signal });
  onFramesReady?.({ frameCount: sampled.frames.length, durationSeconds: sampled.durationSeconds });
  const extraction = await openAIVideoExtract({ frames: sampled.frames, purpose, signal });
  return { ...extraction, video: { durationSeconds: sampled.durationSeconds, frameCount: sampled.frames.length } };
}
export function searchHealthSources(input) { return openAISearch(input); }
export function searchHealthFeedSources(input) { return searchExploreHealthFeed(input); }
