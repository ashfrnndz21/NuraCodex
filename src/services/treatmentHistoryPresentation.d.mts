export type TreatmentHistorySnapshot = {
  status?: 'current' | 'past';
  endedOn?: string;
  source?: string;
  sourceId?: string;
};

export type TreatmentHistoryEvent = { snapshot?: TreatmentHistorySnapshot };
export type TreatmentHistoryAsset = { id: string; name: string };
export type TreatmentHistoryPresentation = {
  statusLabel: 'CURRENT AT THIS CHANGE' | 'PAST AT THIS CHANGE';
  statusDate: string | null;
  sourceLabel: string;
  sourceKind: 'attached_source' | 'source_unavailable' | 'user_entered';
  sourceAssetId: string | null;
};

export declare function presentTreatmentHistoryEvent(
  event: TreatmentHistoryEvent,
  assets?: readonly TreatmentHistoryAsset[],
): TreatmentHistoryPresentation;
