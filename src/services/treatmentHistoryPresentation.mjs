/** Build a truthful display model for one dated treatment snapshot. */
export function presentTreatmentHistoryEvent(event, assets = []) {
  const snapshot = event?.snapshot ?? {};
  const attachedAsset = snapshot.sourceId
    ? assets.find((asset) => asset.id === snapshot.sourceId)
    : null;
  const hasSavedSourceReference = Boolean(snapshot.sourceId);
  const origin = attachedAsset
    ? 'attached_source'
    : hasSavedSourceReference
      ? 'source_unavailable'
      : 'user_entered';

  return {
    statusLabel: snapshot.status === 'past' ? 'PAST AT THIS CHANGE' : 'CURRENT AT THIS CHANGE',
    statusDate: snapshot.status === 'past' ? snapshot.endedOn ?? null : null,
    sourceLabel: attachedAsset?.name
      ?? (snapshot.source?.trim() || (hasSavedSourceReference ? 'Previously attached source' : 'Entered by you')),
    sourceKind: origin,
    sourceAssetId: attachedAsset?.id ?? null,
  };
}
