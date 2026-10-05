import { formatClaimValue } from '../../src/services/claimValue.mjs';

const clean = (value, limit = 500) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const validScopeId = (value) => /^[a-zA-Z0-9-]{1,96}$/.test(value);
const normalize = (value) => clean(value, 500).normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const validDateRange = (validFrom, validUntil) => Number.isFinite(Date.parse(validFrom)) && Number.isFinite(Date.parse(validUntil)) && Date.parse(validFrom) < Date.parse(validUntil);

export class AskEvidenceSelectionError extends Error {
  constructor() {
    super('One of the selected report details is no longer available for review. Refresh the profile and choose it again.');
    this.name = 'AskEvidenceSelectionError';
  }
}

function reviewedClaimDetails(assertion) {
  const page = Number.isInteger(assertion?.sourceLocation?.page) && assertion.sourceLocation.page > 0 ? assertion.sourceLocation.page : null;
  return {
    referenceRange: clean(assertion?.referenceRange, 120),
    method: clean(assertion?.method, 180),
    sourceQuote: clean(assertion?.sourceLocation?.quote, 400),
    page,
  };
}

function resolveSelectedFact(fact, { profileId, assertionsByClaimId, historyAssertionsByClaimId, sourcesById, historyRequested }) {
  const sourceId = clean(fact?.sourceId, 96);
  const sourceClaimId = clean(fact?.sourceClaimId, 96);
  const id = clean(fact?.id, 96);
  if (fact?.reviewState === 'user_retracted') throw new AskEvidenceSelectionError();
  if (fact?.validUntil) {
    if (!historyRequested || !validDateRange(clean(fact?.validFrom, 64), clean(fact?.validUntil, 64))) throw new AskEvidenceSelectionError();
    if (!sourceId && !sourceClaimId) {
      return {
        id, label: clean(fact?.label, 140), value: clean(fact?.value, 500), date: clean(fact?.date, 64),
        category: clean(fact?.category, 80), source: 'Provided by you for this answer', status: 'confirmed',
        validFrom: clean(fact?.validFrom, 64), validUntil: clean(fact?.validUntil, 64), versionStatus: 'earlier',
      };
    }
    if (!validScopeId(sourceId) || !validScopeId(sourceClaimId)) throw new AskEvidenceSelectionError();
    const source = sourcesById.get(sourceId);
    const requestedValue = normalize(fact?.value);
    const requestedLabel = normalize(fact?.label);
    const requestedDate = normalize(clean(fact?.date, 64).slice(0, 10));
    const candidates = historyAssertionsByClaimId.get(sourceClaimId) ?? [];
    const assertion = candidates
      .filter((item) => item.sourceId === sourceId && normalize(item.label) === requestedLabel &&
        normalize(formatClaimValue(item.value, item.unit)) === requestedValue &&
        (!requestedDate || normalize(clean(item.effectiveAt || item.recordedAt, 64).slice(0, 10)) === requestedDate))
      .sort((a, b) => {
        const requestedStart = Date.parse(clean(fact?.validFrom, 64));
        if (!Number.isFinite(requestedStart)) return Date.parse(b.validUntil) - Date.parse(a.validUntil);
        return Math.abs(Date.parse(a.validFrom) - requestedStart) - Math.abs(Date.parse(b.validFrom) - requestedStart);
      })[0];
    if (!source || source.profileId !== profileId || !assertion || assertion.profileId !== profileId ||
      assertion.sourceId !== sourceId || assertion.evidenceState !== 'superseded' || !assertion.validUntil ||
      !validDateRange(assertion.validFrom || assertion.recordedAt, assertion.validUntil)) throw new AskEvidenceSelectionError();
    return {
      id, label: clean(assertion.label, 140),
      value: formatClaimValue(assertion.value, assertion.unit),
      date: clean(assertion.effectiveAt || assertion.recordedAt, 64),
      category: /^coverage[_ ]term$/i.test(clean(assertion.kind, 64)) ? 'Insurance coverage' : clean(assertion.kind, 80),
      source: clean(source.displayName, 120), status: 'reviewed',
      ...reviewedClaimDetails(assertion),
      validFrom: clean(assertion.validFrom || assertion.recordedAt, 64), validUntil: clean(assertion.validUntil, 64), versionStatus: 'earlier',
    };
  }
  if (!sourceId && !sourceClaimId) {
    return {
      id, label: clean(fact?.label, 140), value: clean(fact?.value, 500), date: clean(fact?.date, 64),
      category: clean(fact?.category, 80), source: 'Provided by you for this answer', status: 'confirmed',
    };
  }

  if (!validScopeId(sourceId) || !validScopeId(sourceClaimId)) {
    // A user-authored note can be stored on device and linked to its source
    // without being a parsed claim. Keep it explicitly user-provided; never
    // treat a document extraction as confirmed this way.
    const source = validScopeId(sourceId) ? sourcesById.get(sourceId) : null;
    if (!source || source.profileId !== profileId || source.origin !== 'user_entered' || sourceClaimId) throw new AskEvidenceSelectionError();
    return {
      id, label: clean(fact?.label, 140), value: clean(fact?.value, 500), date: clean(fact?.date, 64),
      category: clean(fact?.category, 80), source: 'Written by you', status: 'confirmed',
    };
  }

  const source = sourcesById.get(sourceId);
  const assertion = assertionsByClaimId.get(sourceClaimId);
  if (!source || source.profileId !== profileId || !assertion || assertion.profileId !== profileId ||
    assertion.sourceId !== sourceId || assertion.evidenceState !== 'user_confirmed' || assertion.validUntil) {
    throw new AskEvidenceSelectionError();
  }

  return {
    id, label: clean(assertion.label, 140),
    value: [clean(assertion.value, 500), clean(assertion.unit, 48)].filter(Boolean).join(' '),
    date: clean(assertion.effectiveAt || assertion.recordedAt, 64),
    category: /^coverage[_ ]term$/i.test(clean(assertion.kind, 64)) ? 'Insurance coverage' : clean(assertion.kind, 80),
    source: clean(source.displayName, 120), status: 'reviewed',
    ...reviewedClaimDetails(assertion),
  };
}

function resolveSelectedDocument(document, { profileId, sourcesById }) {
  const id = clean(document?.id, 96);
  const source = validScopeId(id) ? sourcesById.get(id) : null;
  const context = source?.documentContext;
  if (!source || source.profileId !== profileId || !context) throw new AskEvidenceSelectionError();
  return {
    id: source.id,
    title: clean(source.displayName, 180),
    documentType: clean(context.documentType, 120),
    dates: Array.isArray(context.dates) ? context.dates : [],
    entities: Array.isArray(context.entities) ? context.entities : [],
    notes: Array.isArray(context.notes) ? context.notes : [],
  };
}

/** Replace client-supplied document assertions and extracted source details with the exact server-held versions. */
export function resolveAuthorizedAskContext(input, { profileId, assertions = [], sources = [] }) {
  const sourcesById = new Map(sources.filter((source) => source?.profileId === profileId).map((source) => [source.id, source]));
  const assertionsByClaimId = new Map(assertions
    .filter((assertion) => assertion?.profileId === profileId && assertion.evidenceState === 'user_confirmed' && !assertion.validUntil)
    .map((assertion) => [assertion.claimId, assertion]));
  const historyAssertionsByClaimId = new Map();
  for (const assertion of assertions.filter((item) => item?.profileId === profileId && item.evidenceState === 'superseded' && item.validUntil)) {
    const versions = historyAssertionsByClaimId.get(assertion.claimId) ?? [];
    versions.push(assertion);
    historyAssertionsByClaimId.set(assertion.claimId, versions);
  }
  const context = input?.context && typeof input.context === 'object' ? input.context : {};
  const historyRequested = input?.historyContextConsent === true;
  const facts = Array.isArray(context.facts) ? context.facts.slice(0, 100).map((fact) => resolveSelectedFact(fact, { profileId, assertionsByClaimId, historyAssertionsByClaimId, sourcesById, historyRequested })) : [];
  const documentSources = input?.sourceContextConsent === true && Array.isArray(context.documentSources)
    ? context.documentSources.slice(0, 5).map((document) => resolveSelectedDocument(document, { profileId, sourcesById }))
    : [];
  return { ...input, context: { ...context, facts, documentSources } };
}
