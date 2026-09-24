/**
 * Scope optional Ask context to a selected record and its explicitly
 * user-authored links. The unscoped profile is returned only when the user
 * starts Ask from the general profile rather than a record.
 */
export function scopeProfileContext(profile, recordId) {
  if (!recordId) return profile;

  if (recordId.startsWith('asset:')) {
    return { facts: [], topics: [], links: [], treatments: [], visits: [] };
  }

  const links = profile.links.filter((link) => link.from === recordId || link.to === recordId);
  const relatedIds = new Set([recordId]);
  for (const link of links) {
    relatedIds.add(link.from);
    relatedIds.add(link.to);
  }

  return {
    facts: profile.facts.filter((fact) => relatedIds.has(`fact:${fact.id}`)),
    topics: profile.topics.filter((topic) => relatedIds.has(`topic:${topic.id}`)),
    links,
    treatments: profile.treatments.filter((item) => relatedIds.has(`treatment:${item.id}`)),
    visits: profile.visits.filter((item) => relatedIds.has(`visit:${item.id}`)),
  };
}
