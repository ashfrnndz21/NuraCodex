export type SourceDeletionIds = {
  assetIds: string[];
  factIds: string[];
  treatmentIds: string[];
  removedMessageIds: string[];
  removedBriefIds: string[];
  removedClarificationIds: string[];
  removedReplacementIds: string[];
  removedLinkIds: string[];
  claimIds: string[];
  assertionIds: string[];
};

export type LocalPreviewDeletionReceipt = {
  source: number;
  claims: number;
  assertions: number;
  activityEvents: number;
  claimIds: string[];
  assertionIds: string[];
  alreadyRemoved: boolean;
};

export type SourceDeletionServiceStatus = 'removed' | 'already_removed' | 'not_needed';

export class SourceDeletionIncompleteError extends Error {
  serviceDeletionCompleted: true;
  cause: unknown;
}

export function removeSourceLinkedData<Snapshot extends Record<string, any>>(
  snapshot: Snapshot,
  selection: { sourceId?: string | null; assetId?: string | null; claimIds?: string[]; assertionIds?: string[] },
): { snapshot: Snapshot; removed: Record<string, number>; ids: SourceDeletionIds };

export function removeSourceAcrossLocalStores<Snapshot extends Record<string, any>>(input: {
  snapshot: Snapshot;
  selection: { sourceId?: string | null; assetId?: string | null };
  removeServiceSource?: (sourceId: string) => Promise<LocalPreviewDeletionReceipt>;
  removeOriginalFiles?: (assetIds: string[]) => Promise<void> | void;
  persistLocalSnapshot?: (snapshot: Snapshot, ids: SourceDeletionIds) => Promise<void> | void;
}): Promise<{
  snapshot: Snapshot;
  local: { snapshot: Snapshot; removed: Record<string, number>; ids: SourceDeletionIds };
  service: {
    status: SourceDeletionServiceStatus;
    removed: { sources: number; claims: number; assertions: number; activityEvents: number } | null;
  };
  alreadyRemoved: boolean;
}>;
