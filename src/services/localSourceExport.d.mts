export function collectLocalSourceFiles(
  assets: Array<{ id: string; uri: string }>,
  options: {
    platform: string;
    readBrowserFile?: (uri: string) => Promise<Uint8Array | ArrayBuffer | null>;
    readDeviceFile?: (uri: string) => Promise<Uint8Array | ArrayBuffer | null>;
  },
): Promise<Array<{ assetId: string; bytes: Uint8Array }>>;
