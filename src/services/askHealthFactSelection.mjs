export function selectAskHealthFacts(facts, enabled, excludedIds = []) {
  if (!enabled) return [];
  const excluded = new Set(excludedIds);
  return facts.filter((fact) => !excluded.has(fact.id));
}
