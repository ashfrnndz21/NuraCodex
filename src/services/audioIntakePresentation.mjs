import { INTAKE_MIME_EXTENSIONS, resolveSupportedIntakeMediaType } from './intakeFileTypes.mjs';

const audioTypesByExtension = Object.freeze({
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
});

const audioMimeAliases = Object.freeze({
  'audio/mpeg': 'audio/mpeg',
  'audio/mp3': 'audio/mpeg',
  'audio/mp4': 'audio/mp4',
  'audio/x-m4a': 'audio/mp4',
  'audio/wav': 'audio/wav',
  'audio/x-wav': 'audio/wav',
  'audio/wave': 'audio/wav',
  'audio/ogg': 'audio/ogg',
  'application/ogg': 'audio/ogg',
  'audio/flac': 'audio/flac',
  'audio/x-flac': 'audio/flac',
  'audio/webm': 'audio/webm',
});
const reviewableKinds = new Set(['audio', 'pdf', 'video', 'image', 'file']);

export const AUDIO_PROCESSING_CONSENT_VERSION = 'openai-transcription-and-health-suggestions-v1';
const supportedAudioTypes = new Set(['audio/flac', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/webm']);

/** Audio can be staged by the client, but must stay outside the shared upload allowlist. */
export function resolveStagedIntakeMediaType(asset = {}) {
  const rawDeclared = typeof asset.mimeType === 'string' ? asset.mimeType.toLowerCase().split(';')[0].trim() : '';
  const declaredAudio = audioMimeAliases[rawDeclared];
  if (declaredAudio) return declaredAudio;

  // The .webm extension is shared by audio and video. Respect the selected
  // media type when present; without it, keep the existing video default.
  if (rawDeclared && INTAKE_MIME_EXTENSIONS[rawDeclared]) return resolveSupportedIntakeMediaType(asset);

  const extension = typeof asset.name === 'string' ? asset.name.split('.').pop()?.toLowerCase() ?? '' : '';
  const inferredAudio = audioTypesByExtension[extension];
  return inferredAudio ?? resolveSupportedIntakeMediaType(asset);
}

export function stagedIntakeKind(mediaType = '') {
  if (mediaType.startsWith('audio/')) return 'audio';
  if (mediaType === 'application/pdf') return 'pdf';
  if (mediaType.startsWith('video/')) return 'video';
  if (mediaType.startsWith('image/')) return 'image';
  return 'file';
}

export function isSupportedAudioMediaType(mediaType) {
  return typeof mediaType === 'string' && supportedAudioTypes.has(mediaType.toLowerCase().split(';')[0].trim());
}

export function isAudioReviewProcessable(asset) {
  return typeof asset?.kind === 'string' && reviewableKinds.has(asset.kind);
}

export function audioReviewConsentCopy(filename) {
  const safeName = typeof filename === 'string' && filename.trim() ? filename.trim() : 'this recording';
  return {
    title: 'AUDIO · SEPARATE APPROVAL',
    actionLabel: 'Review this recording',
    body: `Before Nura reviews “${safeName}”, you’ll choose whether to send it to OpenAI for transcription and health-detail suggestions. Any suggestions are linked to a timestamp and stay pending until you review them.`,
  };
}
