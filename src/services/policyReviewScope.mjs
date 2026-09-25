const isPolicyTerm = (fact) => /^(insurance coverage|coverage_term|coverage term)$/i.test(String(fact?.category ?? '').trim());

export function resolvePolicyReviewSourceIds(requestedSourceIds, facts) {
  const activeSourceIds = new Set((Array.isArray(facts) ? facts : [])
    .filter((fact) => isPolicyTerm(fact) && !fact.validUntil && typeof fact.sourceId === 'string' && fact.sourceId)
    .map((fact) => fact.sourceId));
  return [...new Set((Array.isArray(requestedSourceIds) ? requestedSourceIds : [])
    .filter((sourceId) => typeof sourceId === 'string' && sourceId.trim())
    .map((sourceId) => sourceId.trim()))]
    .filter((sourceId) => activeSourceIds.has(sourceId))
    .slice(0, 2);
}

export function selectPolicyReviewFacts(facts, sourceIds, includePolicyTerms, selectedHealthFactIds) {
  const policySources = new Set(Array.isArray(sourceIds) ? sourceIds : []);
  const selectedHealthIds = new Set(Array.isArray(selectedHealthFactIds) ? selectedHealthFactIds : []);
  return (Array.isArray(facts) ? facts : []).filter((fact) => {
    if (fact.validUntil) return false;
    if (isPolicyTerm(fact)) return includePolicyTerms === true && policySources.has(fact.sourceId);
    return selectedHealthIds.has(fact.id);
  });
}
