import { randomUUID } from 'node:crypto';

export const CONTRACT_VERSION = 1;
export const DEMO_PROFILE_ID = 'demo-profile';
export const MAX_LABEL_LENGTH = 160;
export const MAX_VALUE_LENGTH = 1200;

/** @typedef {'candidate'|'needs_review'|'user_confirmed'|'rejected'|'superseded'} EvidenceState */
/** @typedef {'user_entered'|'document_extraction'|'external_source'|'agent_inference'} Origin */
/** @typedef {'selected'|'duplicate_exact'|'extracting'|'candidate_review'|'extracted_empty'|'accepted'|'rejected'|'failed'} SourceState */
/** @typedef {{page?:number|null, quote?:string|null, timestampSeconds?:number|null, locationConfidence?:'model_suggested'|'not_available'}} SourceLocation */
/**
 * @typedef {object} SourceRecord
 * @property {string} id
 * @property {number} schemaVersion
 * @property {string} profileId
 * @property {string} displayName
 * @property {string} mediaType
 * @property {number} sizeBytes
 * @property {string} sha256
 * @property {Origin} origin
 * @property {string} importedAt
 * @property {SourceState} state
 * @property {string|null} duplicateOfSourceId
 * @property {string} environment
 */
/**
 * @typedef {object} CandidateClaim
 * @property {string} id
 * @property {number} schemaVersion
 * @property {string} profileId
 * @property {string} sourceId
 * @property {string} kind
 * @property {string} label
 * @property {string} value
 * @property {string|null} unit
 * @property {string|null} effectiveAt
 * @property {number|null} confidence
 * @property {SourceLocation} sourceLocation
 * @property {EvidenceState} evidenceState
 * @property {string} createdAt
 * @property {string|null} acceptedAssertionId
 */

const clean = (value, limit) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const nullableString = (value, limit = 120) => typeof value === 'string' && value.trim() ? value.trim().slice(0, limit) : null;

export function createSourceRecord({ profileId = DEMO_PROFILE_ID, displayName, mediaType, sizeBytes, sha256, state = 'selected', duplicateOfSourceId = null }) {
  const name = clean(displayName, 180).replace(/[\\/\0-\x1f]/g, '_');
  const mime = clean(mediaType, 100).toLowerCase();
  const hash = clean(sha256, 64).toLowerCase();
  if (!name || !mime || !/^[a-f0-9]{64}$/.test(hash)) throw new Error('The source details could not be validated.');
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1) throw new Error('The source file is empty or too large.');
  return {
    id: randomUUID(), schemaVersion: CONTRACT_VERSION, profileId: clean(profileId, 80),
    displayName: name, mediaType: mime, sizeBytes, sha256: hash,
    origin: 'document_extraction', importedAt: new Date().toISOString(), state,
    duplicateOfSourceId: duplicateOfSourceId || null, environment: 'local_demo', storage: 'device_original_only',
  };
}

export function createCandidateClaim({ profileId = DEMO_PROFILE_ID, sourceId, kind, label, value, unit, effectiveAt, confidence, sourceLocation }) {
  const cleanLabel = clean(label, MAX_LABEL_LENGTH);
  const cleanValue = clean(value, MAX_VALUE_LENGTH);
  const cleanKind = clean(kind, 64).toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  if (!sourceId || !cleanLabel || !cleanValue || !cleanKind) return null;
  const score = typeof confidence === 'number' && Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : null;
  const page = Number.isInteger(sourceLocation?.page) && sourceLocation.page > 0 ? sourceLocation.page : null;
  const timestamp = typeof sourceLocation?.timestampSeconds === 'number' && sourceLocation.timestampSeconds >= 0 ? sourceLocation.timestampSeconds : null;
  return {
    id: randomUUID(), schemaVersion: CONTRACT_VERSION, profileId: clean(profileId, 80),
    sourceId: clean(sourceId, 80), kind: cleanKind, label: cleanLabel, value: cleanValue,
    unit: nullableString(unit, 48), effectiveAt: nullableString(effectiveAt, 64), confidence: score,
    sourceLocation: {
      page,
      quote: nullableString(sourceLocation?.quote, 600),
      timestampSeconds: timestamp,
      locationConfidence: page || timestamp !== null ? 'model_suggested' : 'not_available',
    },
    evidenceState: 'needs_review', createdAt: new Date().toISOString(), acceptedAssertionId: null,
  };
}

/** Public event contract deliberately excludes document text, health values, prompts and tool arguments. */
export function createRunEvent({ runId, sequence, type, stage, status, displayLabel, refs = [] }) {
  if (!runId || !Number.isSafeInteger(sequence) || sequence < 1) throw new Error('The activity event could not be validated.');
  return {
    schemaVersion: CONTRACT_VERSION, runId: clean(runId, 96), eventId: randomUUID(), sequence,
    occurredAt: new Date().toISOString(), type: clean(type, 64), stage: clean(stage, 64),
    status: ['started', 'progress', 'complete', 'failed'].includes(status) ? status : 'progress',
    display: { label: clean(displayLabel, 120) },
    refs: Array.isArray(refs) ? refs.slice(0, 20).map((ref) => ({ kind: clean(ref?.kind, 32), id: clean(ref?.id, 96) })).filter((ref) => ref.kind && ref.id) : [],
  };
}
