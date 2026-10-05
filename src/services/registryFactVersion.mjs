/** Describe only version links explicitly stored on the fact; never infer versions from values or dates. */
export function getRegistryFactVersionBadge(fact, facts = []) {
  if (!fact || typeof fact.id !== 'string' || !fact.id) return null;
  if (fact.reviewState === 'user_retracted') {
    return { kind: 'retracted', label: 'RETRACTED BY YOU', relatedFactId: null };
  }

  const replacement = facts.find((candidate) => candidate?.supersedesId === fact.id && typeof candidate.id === 'string' && candidate.id);
  if (replacement) {
    return { kind: 'previous', label: 'PREVIOUS VERSION', relatedFactId: replacement.id };
  }
  if (typeof fact.supersedesId === 'string' && fact.supersedesId) {
    const priorVersionExists = facts.some((candidate) => candidate?.id === fact.supersedesId);
    return { kind: 'corrected', label: 'CORRECTED BY YOU', relatedFactId: priorVersionExists ? fact.supersedesId : null };
  }
  if (fact.validUntil != null && fact.validUntil !== '') {
    return { kind: 'ended', label: 'NO LONGER CURRENT', relatedFactId: null };
  }
  return null;
}
