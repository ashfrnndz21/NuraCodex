export type LocalExportSource = { assetId: string; sizeBytes: number; openStream: () => ReadableStream<Uint8Array> };
export function prepareLocalSourceStreams(
  assets: Array<{ id: string; uri: string }>,
  readers: {
    platform: string;
    readBrowserFile?: (uri: string) => Promise<Blob | null>;
    readDeviceFile?: (uri: string) => Promise<{ size: number | null; stream: () => ReadableStream<Uint8Array> } | null>;
  },
): Promise<LocalExportSource[]>;
