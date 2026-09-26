export type ReviewClaimGroup<T> = { kind: string; title: string; claims: T[] };
export declare function groupReviewClaims<T extends { kind: string }>(claims: readonly T[]): ReviewClaimGroup<T>[];
