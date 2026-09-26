/**
 * Resolve a user-authored connection endpoint to the timeline row that owns it.
 * A fact inside a grouped source event selects its own value but opens/scrolls
 * the containing event; saved files use the Documents filter, and profile
 * topics scroll to their separate chosen-area chip.
 */
export function resolveTimelineEndpointNavigation(targetId, entries, timelineEvents, topics) {
  const topic = topics.find((item) => `topic:${item.id}` === targetId);
  if (topic) {
    return {
      filter: 'Everything',
      expandedId: null,
      selectedNodeId: targetId,
      targetKind: 'topic',
      targetRenderId: targetId,
    };
  }

  let entry = entries.find((item) => item.nodeId === targetId);
  if (!entry) return null;

  const isAsset = entry.kind === 'asset';
  let resolvedTargetId = targetId;
  if (!isAsset && entry.kind === 'fact' && entry.source === 'Written by you' && !entry.sourceClaimId && entry.sourceId) {
    const representedEvent = timelineEvents.find((item) => {
      const members = item.members ?? [item];
      return members.some((member) => member.kind === 'fact'
        && member.sourceId === entry?.sourceId
        && member.sourceClaimId
        && !member.validUntil);
    });
    const representedFact = representedEvent?.members?.find((member) => member.sourceId === entry?.sourceId && member.sourceClaimId && !member.validUntil)
      ?? (representedEvent?.sourceId === entry.sourceId ? representedEvent : null);
    if (representedFact) {
      entry = representedFact;
      resolvedTargetId = representedFact.nodeId;
    }
  }
  const event = isAsset ? null : timelineEvents.find((item) =>
    item.nodeId === resolvedTargetId || item.members?.some((member) => member.nodeId === resolvedTargetId));
  const targetRenderId = isAsset ? entry.id : event?.id ?? entry.id;

  return {
    filter: isAsset ? 'Documents' : 'Everything',
    expandedId: targetRenderId,
    selectedNodeId: resolvedTargetId,
    targetKind: 'entry',
    targetRenderId,
  };
}
