export function parseHealthDate(value: string): Date | null;

export type ReviewEventDateResult = { ok: true; value: string | null } | { ok: false; value: null };
export function normalizeReviewEventDate(value: unknown): ReviewEventDateResult;
export function resolveFactEventDate(eventDate: string | null | undefined, recordedAt: string): string;
