export const familyRelationships: readonly string[];
export function withAreaTopicId<T extends { id: string; label: string }>(areaId: string, topic: T): T;
export function createFamilyHistoryTopic(areaId: string, signalId: string, signalLabel: string, relationship: string): { id: string; label: string };
