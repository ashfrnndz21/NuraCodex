const HEALTH_TOPIC_ID = /^[A-Za-z0-9:_-]{1,80}$/;
const HEALTH_TOPIC_LABEL = /^[\p{L}\p{N}][\p{L}\p{N} &'()+/\-·]{0,59}$/u;
const FAMILY_SEARCH_LABELS = Object.freeze({
  'family:heart-family': { id: 'family::heart-family', label: 'Family history · heart conditions' },
  'family:sugar-family': { id: 'family::sugar-family', label: 'Family history · diabetes' },
  'family:cancer-family': { id: 'family::cancer-family', label: 'Family history · cancer' },
  'heart:family-heart': { id: 'family::heart-family', label: 'Family history · heart conditions' },
});

/** Keep persisted or imported profile areas unique before any list renders them. */
export function normalizeHealthTopics(topics) {
  const unique = new Map();
  for (const topic of Array.isArray(topics) ? topics : []) {
    const id = typeof topic?.id === 'string' ? topic.id.trim() : '';
    const normalizedId = FAMILY_SEARCH_LABELS[id]?.id ?? id;
    if (!id || unique.has(normalizedId)) continue;
    unique.set(normalizedId, { ...topic, id: normalizedId });
  }
  return [...unique.values()];
}

/** Keep submitted search topics readable and bounded while allowing labels such as "Medicine · Insulin". */
export function isValidHealthSearchTopic(topic) {
  return Boolean(topic
    && typeof topic.id === 'string'
    && HEALTH_TOPIC_ID.test(topic.id.trim())
    && typeof topic.label === 'string'
    && HEALTH_TOPIC_LABEL.test(topic.label.trim().replace(/\s+/g, ' ')));
}

/** Remove medicine, symptom, diagnosis, and relative-specific details before a topic is sent to public search providers. */
export function publicHealthSearchTopic(topic) {
  const id = typeof topic?.id === 'string' ? topic.id.trim() : '';
  const label = typeof topic?.label === 'string' ? topic.label.trim().replace(/\s+/g, ' ') : '';
  const [areaId = '', detailId = ''] = id.split('::');
  if (/^(?:medicines?|medications?)\s*[·:-]\s*.+/i.test(label)
    || /^(?:medicines?|medications?)(?:::|:|$)/i.test(id)) {
    return { id: 'medicine:general', label: 'Medication information' };
  }
  if (/^symptom\s*[·:-]\s*.+/i.test(label) || /^(?:symptom|symptoms)(?:::|:|$)/i.test(id)) {
    return { id: 'symptom:general', label: 'Symptom information' };
  }
  if (/^(?:condition|diagnosis|allergy)\s*[·:-]\s*.+/i.test(label) || /^(?:condition|diagnosis|allergy)(?:::|:|$)/i.test(id)) {
    return { id: 'condition:general', label: 'Condition information' };
  }
  if (!id.includes('::')) return { id, label };
  const familyContext = FAMILY_SEARCH_LABELS[`${areaId}:${detailId}`];
  if (familyContext) return familyContext;
  if (areaId === 'family') return { id: 'family::family-history', label: 'Family history' };
  return { id, label };
}

/** Generalize and deduplicate topics before a public search; distinct relatives can share one safe topic. */
export function sanitizePublicHealthTopics(topics) {
  const safeById = new Map();
  for (const topic of topics) {
    const safeTopic = publicHealthSearchTopic(topic);
    if (!isValidHealthSearchTopic(safeTopic)) {
      throw new Error('One of the selected health areas could not be searched.');
    }
    if (!safeById.has(safeTopic.id)) safeById.set(safeTopic.id, safeTopic);
  }
  return [...safeById.values()];
}
