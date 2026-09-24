export function registryEvidenceSnapshot(topicId, records, links) {
  const orderedRecords = records.map((record) => ({
    id: String(record.id || ''),
    kind: String(record.kind || ''),
    date: String(record.date || ''),
    revision: String(record.revision || ''),
    status: String(record.status || ''),
    sourceIdentity: String(record.sourceIdentity || ''),
  })).sort((left, right) => left.id.localeCompare(right.id));
  const orderedLinks = links.map((link) => ({
    id: String(link.id || ''),
    relationType: String(link.relationType || ''),
    label: String(link.label || ''),
    createdAt: String(link.createdAt || ''),
  })).sort((left, right) => left.id.localeCompare(right.id));
  return JSON.stringify({ version: 1, topicId: String(topicId || ''), records: orderedRecords, links: orderedLinks });
}

export function registryBriefIsCurrent(brief, sourceSignature) {
  return Boolean(brief && sourceSignature && brief.sourceSignature === sourceSignature);
}

export function registryCitationTargetId(citation, connected) {
  const citationId = String(citation?.id || '');
  if (!citationId) return null;

  const exactRecord = connected.find((record) => record.id === citationId);
  if (exactRecord) return exactRecord.id;

  const documentDetail = /^document:(.*):\d+$/.exec(citationId);
  if (documentDetail) {
    const sourceFile = connected.find((record) => record.kind === 'asset' && record.sourceIdentity === documentDetail[1]);
    if (sourceFile) return sourceFile.id;
  }

  if (citationId.startsWith('link:')) {
    const linkId = citationId.slice('link:'.length);
    const linkedRecord = connected.find((record) => record.link?.id === linkId);
    if (linkedRecord) return linkedRecord.id;
  }

  return null;
}

export function registryBriefCitations(answer, availableSources) {
  const allowed = new Set(availableSources.map((source) => source.reference).filter(Boolean));
  const references = new Set(answer.citations.filter((reference) => allowed.has(reference)));
  return availableSources.filter((source) => references.has(source.reference));
}

export function registryBriefDisplayText(markdown) {
  return String(markdown || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line
      .replace(/^\s{0,3}#{1,6}\s+/, '')
      .replace(/^\s*>\s?/, '')
      .replace(/^\s*(?:[-*]|\d+\.)\s+/, '• ')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/__(.*?)__/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/_(.*?)_/g, '$1')
      .trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
