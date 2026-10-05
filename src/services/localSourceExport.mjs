/** Read only local source copies and omit files that are unavailable or unreadable. */
export async function collectLocalSourceFiles(assets, { platform, readBrowserFile, readDeviceFile }) {
  const read = platform === 'web' ? readBrowserFile : readDeviceFile;
  if (typeof read !== 'function') return [];

  const sourceFiles = [];
  const seen = new Set();
  for (const asset of Array.isArray(assets) ? assets : []) {
    const assetId = typeof asset?.id === 'string' ? asset.id : '';
    const uri = typeof asset?.uri === 'string' ? asset.uri : '';
    if (!assetId || !uri || seen.has(assetId)) continue;
    seen.add(assetId);
    try {
      const contents = await read(uri);
      if (contents instanceof Uint8Array) sourceFiles.push({ assetId, bytes: contents });
      else if (contents instanceof ArrayBuffer) sourceFiles.push({ assetId, bytes: new Uint8Array(contents) });
    } catch {
      // Keep the source metadata in the manifest; it will be marked unavailable there.
    }
  }
  return sourceFiles;
}
