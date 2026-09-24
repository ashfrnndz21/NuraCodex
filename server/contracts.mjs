import { randomUUID } from 'node:crypto';

export const CONTRACT_VERSION = 1;
export const DEMO_PROFILE_ID = 'demo-profile';
export const MAX_LABEL_LENGTH = 160;
export const MAX_VALUE_LENGTH = 1200;

/** @typedef {'candidate'|'needs_review'|'user_confirmed'|'rejected'|'superseded'|'user_retracted'} EvidenceState */
/** @typedef {'user_entered'|'document_extraction'|'external_source'|'agent_inference'} Origin */
/** @typedef {'selected'|'duplicate_exact'|'extracting'|'candidate_review'|'extracted_empty'|'accepted'|'rejected'|'failed'} SourceState */
/** @typedef {{page?:number|null, quote?:string|null, timestampSeconds?:number|null, locationConfidence?:'model_suggested'|'server_sampled'|'not_available'}} SourceLocation */
/** @typedef {{documentType:string|null, dates:{kind:string,value:string,page:number|null,quote:string|null}[], entities:{kind:string,value:string,page:number|null,quote:string|null}[], notes:{kind:string,value:string,page:number|null,quote:string|null}[]}|null} DocumentContext */
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
 * @property {DocumentContext} documentContext
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
 * @property {string|null} referenceRange
 * @property {string|null} method
 * @property {string|null} effectiveAt
 * @property {number|null} confidence
 * @property {SourceLocation} sourceLocation
 * @property {EvidenceState} evidenceState
 * @property {string} createdAt
 * @property {string|null} acceptedAssertionId
 * @property {string|null} retractedAt
 * @property {string|null} retractionReason
 */

const clean = (value, limit) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const nullableString = (value, limit = 120) => typeof value === 'string' && value.trim() ? value.trim().slice(0, limit) : null;

const CONTEXT_DATE_KINDS = new Set(['report_date', 'collected_at', 'received_at', 'approved_at', 'issued_at', 'effective_period']);
const CONTEXT_ENTITY_KINDS = new Set(['laboratory', 'provider', 'insurer', 'analyzer', 'technology']);
const CONTEXT_NOTE_KINDS = new Set(['fasting_guidance', 'clinical_significance', 'clinical_decision_limits', 'remarks', 'sample_notice', 'other']);

function contextItems(items, allowedKinds, maxItems, maxValueLength) {
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => {
    const kind = clean(item?.kind, 48).toLowerCase();
    const value = clean(item?.value, maxValueLength);
    if (!allowedKinds.has(kind) || !value) return [];
    const page = Number.isInteger(item?.page) && item.page > 0 ? item.page : null;
    return [{ kind, value, page, quote: nullableString(item?.quote, 600) }];
  }).slice(0, maxItems);
}

export function createDocumentContext(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const documentContext = {
    documentType: nullableString(input.documentType, 120),
    dates: contextItems(input.dates, CONTEXT_DATE_KINDS, 12, 120),
    entities: contextItems(input.entities, CONTEXT_ENTITY_KINDS, 12, 180),
    notes: contextItems(input.notes, CONTEXT_NOTE_KINDS, 16, 1200),
  };
  return documentContext.documentType || documentContext.dates.length || documentContext.entities.length || documentContext.notes.length
    ? documentContext
    : null;
}

export function createSourceRecord({ profileId = DEMO_PROFILE_ID, displayName, mediaType, sizeBytes, sha256, state = 'selected', duplicateOfSourceId = null, documentContext = null }) {
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
    documentContext: createDocumentContext(documentContext),
  };
}

export function createCandidateClaim({ profileId = DEMO_PROFILE_ID, sourceId, kind, label, value, unit, referenceRange, method, effectiveAt, confidence, sourceLocation }) {
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
    unit: nullableString(unit, 48), referenceRange: nullableString(referenceRange, 120),
    method: nullableString(method, 180), effectiveAt: nullableString(effectiveAt, 64), confidence: score,
    sourceLocation: {
      page,
      quote: nullableString(sourceLocation?.quote, 600),
      timestampSeconds: timestamp,
      locationConfidence: timestamp !== null ? 'server_sampled' : page ? 'model_suggested' : 'not_available',
    },
    evidenceState: 'needs_review', createdAt: new Date().toISOString(), acceptedAssertionId: null,
    retractedAt: null, retractionReason: null,
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
