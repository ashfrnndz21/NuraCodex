export const familyRelationships = Object.freeze([
  'Mother', 'Father', 'Sibling', 'Child', 'Grandparent', 'Aunt or uncle', 'Other relative',
]);

const relationshipIds = new Map(familyRelationships.map((label) => [
  label,
  label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
]));

/** Qualify a topic once, even when its creator already returned a complete area ID. */
export function withAreaTopicId(areaId, topic) {
  const prefix = `${areaId}::`;
  return topic.id.startsWith(prefix) ? topic : { ...topic, id: `${prefix}${topic.id}` };
}

/** Store a family-history signal as a relationship and condition, never as a bare person picker. */
export function createFamilyHistoryTopic(areaId, signalId, signalLabel, relationship) {
  if (typeof areaId !== 'string' || !/^[a-z0-9-]{1,40}$/i.test(areaId)
    || typeof signalId !== 'string' || !/^[a-z0-9-]{1,40}$/i.test(signalId)
    || typeof signalLabel !== 'string' || !signalLabel.trim()
    || !relationshipIds.has(relationship)) {
    throw new Error('Choose a family relationship and a health area before saving family-history context.');
  }
  return {
    id: `${areaId}::${signalId}::${relationshipIds.get(relationship)}`,
    label: `${relationship} · ${signalLabel.trim().toLowerCase()}`,
  };
}
