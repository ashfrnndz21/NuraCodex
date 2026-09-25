/** Canonicalize a value only when its source claim proves the exact legacy concatenation. */
export function canonicalSourceFactValue(fact, { factId, sourceId, sourceClaimId, expectedValue, normalizedValue }) {
  if (!fact || fact.id !== factId || fact.sourceId !== sourceId || fact.sourceClaimId !== sourceClaimId || fact.validUntil) return null;
  if (typeof expectedValue !== 'string' || fact.value !== expectedValue) return null;
  const value = typeof normalizedValue === 'string' ? normalizedValue.trim() : '';
  if (!value || value === fact.value) return null;
  return { ...fact, value };
}
