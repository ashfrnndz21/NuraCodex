type PresentedDocumentAsset = { name?: string; kind?: string; purpose?: string; localSampleFixtureId?: string; serverSourceId?: string; documentType?: string; healthAreaId?: string };
type PresentedDocumentFact = { sourceId?: string; category?: string; label?: string; date?: string; validUntil?: string | null; reviewState?: string };
export function documentDisplayName(asset?: PresentedDocumentAsset, facts?: PresentedDocumentFact[]): string;
export function documentIsInsurance(asset?: PresentedDocumentAsset): boolean;
export function documentOriginalName(asset?: PresentedDocumentAsset): string;
