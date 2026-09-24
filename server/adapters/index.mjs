import { createResponse as openAIResponse, extractDocumentClaims as openAIExtract, extractVideoFrameClaims as openAIVideoExtract, getOpenAIStatus, searchHealthSources as openAISearch } from './openaiResponses.mjs';
import { LanguageModelUnavailableError } from '../ports/LanguageModel.mjs';
import { sampleVideoFrames } from './videoProcessor.mjs';

export function getLanguageModel() {
  const provider = process.env.NURA_LLM_PROVIDER || 'openai';
  if (provider === 'openai') return { ...getOpenAIStatus(), createResponse: openAIResponse };
  throw new LanguageModelUnavailableError(`Nura’s configured model provider (“${provider}”) has no adapter installed.`);
}

export function getLanguageModelStatus() {
  try { const { provider, configured, model } = getLanguageModel(); return { provider, configured, model }; }
  catch (_error) { return { provider: process.env.NURA_LLM_PROVIDER || 'openai', configured: false, model: process.env.NURA_MODEL || process.env.OPENAI_MODEL || 'gpt-5.6-luna' }; }
}

export function extractDocumentClaims(input) { return openAIExtract(input); }
export async function extractVideoClaims({ bytes, mediaType, purpose = 'medical', signal, onFramesReady }) {
  if (purpose !== 'medical') throw new Error('Video review is only available for medical records.');
  const sampled = await sampleVideoFrames({ bytes, mediaType, signal });
  onFramesReady?.({ frameCount: sampled.frames.length, durationSeconds: sampled.durationSeconds });
  const extraction = await openAIVideoExtract({ frames: sampled.frames, purpose, signal });
  return { ...extraction, video: { durationSeconds: sampled.durationSeconds, frameCount: sampled.frames.length } };
}
export function searchHealthSources(input) { return openAISearch(input); }
