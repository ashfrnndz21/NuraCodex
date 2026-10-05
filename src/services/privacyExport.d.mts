export function buildNuraLocalExport<T extends object>(input: T): Record<string, unknown>;
export const MAX_BROWSER_EXPORT_BYTES: number;
export function estimateNuraExportArchiveSize(manifest: Record<string, unknown>, sourceFiles?: Array<{ assetId: string; sizeBytes?: number; bytes?: Uint8Array | ArrayBuffer; openStream?: () => ReadableStream<Uint8Array> }>): number;
export function writeNuraExportArchive(manifest: Record<string, unknown>, sourceFiles: Array<{ assetId: string; sizeBytes?: number; bytes?: Uint8Array | ArrayBuffer; openStream?: () => ReadableStream<Uint8Array> }>, writeChunk: (chunk: Uint8Array) => void | Promise<void>): Promise<void>;
