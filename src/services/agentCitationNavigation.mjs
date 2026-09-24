const asList = (value) => Array.isArray(value) ? value : [];

function nodeExists(nodeId, context) {
  if (nodeId.startsWith('fact:')) return asList(context.facts).some((item) => item.id === nodeId.slice(5));
  if (nodeId.startsWith('topic:')) return asList(context.topics).some((item) => item.id === nodeId.slice(6));
  if (nodeId.startsWith('asset:')) return asList(context.assets).some((item) => item.id === nodeId.slice(6));
  if (nodeId.startsWith('treatment:')) return asList(context.treatments).some((item) => item.id === nodeId.slice(10));
  if (nodeId.startsWith('visit:')) return asList(context.visits).some((item) => item.id === nodeId.slice(6));
  return false;
}

function normalizeEndpoint(value, context) {
  if (typeof value !== 'string' || !value) return null;
  if (/^(fact|topic|asset|treatment|visit):/.test(value)) return nodeExists(value, context) ? value : null;
  const candidates = ['fact:' + value, 'topic:' + value, 'asset:' + value, 'treatment:' + value, 'visit:' + value];
  return candidates.find((candidate) => nodeExists(candidate, context)) ?? null;
}

function targetForNode(nodeId) {
  if (nodeId.startsWith('topic:')) return { kind: 'registry', topicId: nodeId.slice(6) };
  return { kind: 'health', focusId: nodeId };
}

export function agentCitationTarget(source, context = {}) {
  if (typeof source?.url === 'string' && /^https:\/\/[^/\s]+/i.test(source.url)) {
    return { kind: 'external', url: source.url };
  }

  const id = typeof source?.id === 'string' ? source.id : '';
  if (id.startsWith('fact:') && nodeExists(id, context)) return targetForNode(id);
  if (id.startsWith('topic:') && nodeExists(id, context)) return targetForNode(id);
  if (id.startsWith('treatment:') && nodeExists(id, context)) return targetForNode(id);
  if (id.startsWith('visit:') && nodeExists(id, context)) return targetForNode(id);

  const documentMatch = id.match(/^document:([a-zA-Z0-9-]{1,96}):\d+$/);
  if (documentMatch) {
    const asset = asList(context.assets).find((item) => item.serverSourceId === documentMatch[1]);
    if (asset) return targetForNode('asset:' + asset.id);
  }

  if (id.startsWith('link:')) {
    const link = asList(context.links).find((item) => item.id === id.slice(5));
    if (link) {
      const endpoint = normalizeEndpoint(link.from, context) ?? normalizeEndpoint(link.to, context);
      if (endpoint) return targetForNode(endpoint);
    }
  }

  return null;
}
