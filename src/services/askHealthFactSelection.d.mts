export function selectAskHealthFacts<T extends { id: string }>(facts: T[], enabled: boolean, excludedIds?: string[]): T[];
