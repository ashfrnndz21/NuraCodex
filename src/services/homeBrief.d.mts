import type { HealthFact, HealthVisit } from '../state/NuraContext';

export type HomeCarePreviewItem = { id: string; visitId: string; title: string; detail: string; date: string; kind: 'VISIT' | 'FOLLOW-UP' };
export declare function buildHomeCarePreview(visits: HealthVisit[], now?: Date): HomeCarePreviewItem[];
export declare function firstUserContextFact(facts: HealthFact[], excludedFactId?: string): HealthFact | undefined;
