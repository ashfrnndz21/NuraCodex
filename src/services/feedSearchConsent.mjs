const TOPIC_ID = /^[A-Za-z0-9:_-]{1,80}$/;
const TOPIC_LABEL = /^[\p{L}\p{N}][\p{L}\p{N} &'()+/-]{0,59}$/u;

/** Build the smallest allowed payload for one explicitly consented search. */
export function createHealthFeedSearchPayload(topics, consentConfirmed) {
  if (consentConfirmed !== true) {
    throw new Error('Please review and confirm consent before starting this search.');
  }
  if (!Array.isArray(topics) || topics.length < 1 || topics.length > 3) {
    throw new Error('Choose between one and three health areas for this search.');
  }

  const safeTopics = topics.map((topic) => {
    const id = typeof topic?.id === 'string' ? topic.id.trim() : '';
    const label = typeof topic?.label === 'string' ? topic.label.trim().replace(/\s+/g, ' ') : '';
    if (!TOPIC_ID.test(id) || !TOPIC_LABEL.test(label)) {
      throw new Error('One of the selected health areas could not be searched.');
    }
    return { id, label };
  });

  return { consentConfirmed: true, topics: safeTopics };
}
