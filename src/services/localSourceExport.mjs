/** Prepare lazy stream readers for local source copies; file bytes are not loaded during this step. */
export async function prepareLocalSourceStreams(assets, { platform, readBrowserFile, readDeviceFile } = {}) {
  const read = platform === 'web' ? readBrowserFile : readDeviceFile;
  if (typeof read !== 'function') return [];

  const files = [];
  const seen = new Set();
  for (const asset of Array.isArray(assets) ? assets : []) {
    const assetId = typeof asset?.id === 'string' ? asset.id : '';
    const uri = typeof asset?.uri === 'string' ? asset.uri : '';
    if (!assetId || !uri || seen.has(assetId)) continue;
    seen.add(assetId);
    try {
      const file = await read(uri);
      if (!file || typeof file.stream !== 'function') continue;
      const sizeBytes = file.size;
      if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) continue;
      files.push({ assetId, sizeBytes, openStream: () => file.stream() });
    } catch {
      // Missing local originals remain in the manifest as metadata-only sources.
    }
  }
  return files;
}
