const MAX_RESPONSE_LENGTH = 2000;

function validateResponse(response) {
  const cleaned = String(response ?? '').trim();
  if (!cleaned) throw new Error('Add the insurer’s reply before saving it.');
  if (cleaned.length > MAX_RESPONSE_LENGTH) throw new Error('Keep the insurer’s reply under 2,000 characters.');
  return cleaned;
}

function currentPolicyTerm({ sourceId, sourceClaimId, sourceFactId, facts = [], assets = [] }) {
  const policyAsset = assets.find((asset) => asset?.purpose === 'insurance' && asset.serverSourceId === sourceId);
  if (!policyAsset) throw new Error('The original policy source is no longer available.');
  const term = facts.find((fact) => fact?.category === 'Insurance coverage'
    && fact.sourceId === sourceId && fact.sourceClaimId === sourceClaimId
    && (!sourceFactId || fact.id === sourceFactId)
    && ['confirmed', 'reviewed'].includes(fact.status)
    && !fact.validUntil && fact.reviewState !== 'user_retracted');
  if (!term) throw new Error('This policy term is no longer in your current reviewed record.');
  return term;
}

/**
 * Build a user-reported insurer response attached to the accepted policy claim
 * it discusses. This record is deliberately separate from policy facts and is
 * never treated as policy wording or an insurer decision verified by Nura.
 */
export function createPolicyClarification(input) {
  const sourceId = String(input?.sourceId ?? '').trim();
  const sourceClaimId = String(input?.sourceClaimId ?? '').trim();
  const id = String(input?.id ?? '').trim();
  const question = String(input?.question ?? '').trim();
  const response = validateResponse(input?.response);
  if (!id || !sourceId || !sourceClaimId) throw new Error('Choose a policy term with a saved source quote first.');
  if (!question) throw new Error('The insurer question is missing. Reopen the policy wording and try again.');
  const term = currentPolicyTerm({ sourceId, sourceClaimId, facts: input.facts ?? [], assets: input.assets ?? [] });

  const reportedAt = String(input.reportedAt ?? '');
  if (!Number.isFinite(Date.parse(reportedAt))) throw new Error('The reply date is invalid.');

  return {
    id,
    sourceId,
    sourceClaimId,
    sourceFactId: term.id,
    termLabel: term.label,
    question,
    response,
    reportedAt,
    status: 'user_reported',
  };
}

/** A stored reply can be edited only while its exact accepted policy claim exists. */
export function updatePolicyClarification(input) {
  const clarification = input?.clarification;
  if (!clarification?.id || clarification.status !== 'user_reported') throw new Error('This user-reported note is no longer available to edit.');
  currentPolicyTerm({
    sourceId: clarification.sourceId,
    sourceClaimId: clarification.sourceClaimId,
    sourceFactId: clarification.sourceFactId,
    facts: input.facts ?? [],
    assets: input.assets ?? [],
  });
  return { ...clarification, response: validateResponse(input.response) };
}

/** Apply a removal to the latest state after any asynchronous persistence work. */
export function removePolicyClarificationFromList(clarifications, id) {
  const targetId = String(id ?? '').trim();
  return clarifications.filter((item) => item.id !== targetId);
}

/** Deletion stays available even when the linked source or term has gone stale. */
export function removePolicyClarification(clarifications, id) {
  const targetId = String(id ?? '').trim();
  if (!targetId || !clarifications.some((item) => item.id === targetId)) throw new Error('This insurer note is no longer in your record.');
  return removePolicyClarificationFromList(clarifications, targetId);
}

export function isPolicyClarificationSourceCurrent(input) {
  try {
    const clarification = input?.clarification;
    if (!clarification?.id || clarification.status !== 'user_reported') return false;
    currentPolicyTerm({
      sourceId: clarification.sourceId,
      sourceClaimId: clarification.sourceClaimId,
      sourceFactId: clarification.sourceFactId,
      facts: input.facts ?? [],
      assets: input.assets ?? [],
    });
    return true;
  } catch {
    return false;
  }
}
