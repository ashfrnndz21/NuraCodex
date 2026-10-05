export type StagedIntakeKind = 'audio' | 'image' | 'pdf' | 'video' | 'file';
export const AUDIO_PROCESSING_CONSENT_VERSION: 'openai-transcription-and-health-suggestions-v1';
export function resolveStagedIntakeMediaType(asset?: { name?: string; mimeType?: string }): string;
export function stagedIntakeKind(mediaType?: string): StagedIntakeKind;
export function isSupportedAudioMediaType(mediaType?: string): boolean;
export function isAudioReviewProcessable(asset?: { kind?: string }): boolean;
export function audioReviewConsentCopy(filename?: string): { title: string; actionLabel: string; body: string };
