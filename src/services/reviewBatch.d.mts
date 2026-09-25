export type ReviewBatchResult = { id: string; status: 'saved' } | { id: string; status: 'failed'; message: string };
export function commitReviewBatch<T extends { id: string }>(operations: T[], commit: (operation: T) => Promise<unknown> | unknown): Promise<ReviewBatchResult[]>;
