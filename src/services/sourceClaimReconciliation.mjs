export function findMissingAcceptedClaims(claims, facts, sourceId) {
  if (!sourceId) return [];
  const registered = new Set(facts
    .filter((fact) => fact.sourceId === sourceId && fact.sourceClaimId && !fact.validUntil)
    .map((fact) => fact.sourceClaimId));
  const seen = new Set();
  return claims.filter((claim) => {
    if (claim.sourceId !== sourceId
      || claim.evidenceState !== 'user_confirmed'
      || !claim.acceptedAssertionId
      || registered.has(claim.id)
      || seen.has(claim.id)) return false;
    seen.add(claim.id);
    return true;
  });
}

function calendarDay(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString().slice(0, 10) : null;
}

export function findMisdatedAcceptedClaims(claims, facts, sourceId) {
  if (!sourceId) return [];
  const currentFacts = new Map(facts
    .filter((fact) => fact.sourceId === sourceId && fact.sourceClaimId && !fact.validUntil)
    .map((fact) => [fact.sourceClaimId, fact]));
  const seen = new Set();
  return claims.flatMap((claim) => {
    if (claim.sourceId !== sourceId
      || claim.evidenceState !== 'user_confirmed'
      || !claim.acceptedAssertionId
      || !claim.effectiveAt
      || seen.has(claim.id)) return [];
    seen.add(claim.id);
    const fact = currentFacts.get(claim.id);
    if (!fact || calendarDay(fact.date) === calendarDay(claim.effectiveAt)) return [];
    return [{ claim, factId: fact.id, effectiveAt: claim.effectiveAt }];
  });
}


export function findMissingRetractions(claims, facts, sourceId) {
  if (!sourceId) return [];
  const activeFacts = new Map(facts
    .filter((fact) => fact.sourceId === sourceId && fact.sourceClaimId && !fact.validUntil)
    .map((fact) => [fact.sourceClaimId, fact]));
  const seen = new Set();
  return claims.flatMap((claim) => {
    if (claim.sourceId !== sourceId
      || claim.evidenceState !== 'user_retracted'
      || !claim.retractedAt
      || seen.has(claim.id)) return [];
    seen.add(claim.id);
    const fact = activeFacts.get(claim.id);
    return fact?.id ? [{ claim, factId: fact.id, retractedAt: claim.retractedAt }] : [];
  });
}
