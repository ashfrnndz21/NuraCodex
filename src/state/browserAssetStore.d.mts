export function browserAssetUri(id: string): string;
export function browserAssetId(uri: string): string | null;
export function saveBrowserAsset(id: string, blob: Blob): Promise<void>;
export function readBrowserAsset(id: string): Promise<Blob | null>;
export function deleteBrowserAsset(id: string): Promise<void>;
export function clearBrowserAssets(): Promise<void>;
