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

  const entry = entries.find((item) => item.nodeId === targetId);
  if (!entry) return null;

  const isAsset = entry.kind === 'asset';
  const event = isAsset ? null : timelineEvents.find((item) =>
    item.nodeId === targetId || item.members?.some((member) => member.nodeId === targetId));
  const targetRenderId = isAsset ? entry.id : event?.id ?? entry.id;

  return {
    filter: isAsset ? 'Documents' : 'Everything',
    expandedId: targetRenderId,
    selectedNodeId: targetId,
    targetKind: 'entry',
    targetRenderId,
  };
}
