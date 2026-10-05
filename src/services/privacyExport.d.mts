export function buildNuraLocalExport<T extends object>(input: T): Record<string, unknown>;
export function createNuraExportArchive(manifest: Record<string, unknown>, sourceFiles?: Array<{ assetId: string; bytes: Uint8Array | ArrayBuffer }>): Uint8Array;
