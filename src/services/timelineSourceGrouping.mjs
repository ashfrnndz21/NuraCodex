function validEventDateKey(value) {
  if (typeof value !== 'string') return false;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Resolve either the local asset ID or its analyzed server source ID. */
export function resolveTimelineSourceAsset(sourceId, assets) {
  if (!sourceId) return null;
  return assets.find((asset) => asset.id === sourceId || asset.serverSourceId === sourceId) ?? null;
}

/** Hide a source-file card in the main timeline once linked details represent it. */
export function omitAssetsRepresentedByDetails(entries, assets = []) {
  const sourceAliases = new Map();
  for (const asset of assets) {
    const canonical = asset.serverSourceId || asset.id;
    sourceAliases.set(asset.id, canonical);
    if (asset.serverSourceId) sourceAliases.set(asset.serverSourceId, canonical);
  }
  const canonicalSource = (sourceId) => sourceAliases.get(sourceId) ?? sourceId;
  const representedSources = new Set(entries
    .filter((entry) => entry.kind === 'fact' && entry.sourceId)
    .map((entry) => canonicalSource(entry.sourceId)));

  return entries.filter((entry) => {
    if (entry.kind !== 'asset') return true;
    const localAssetId = entry.id.startsWith('asset:') ? entry.id.slice('asset:'.length) : '';
    return ![entry.sourceId, localAssetId].filter(Boolean).some((sourceId) => representedSources.has(canonicalSource(sourceId)));
  });
}

/**
 * Show accepted facts from one source and event date as a single report event.
 * Facts with different dates remain separate, even when they came from the same file.
 */
export function groupSourceFactEvents(entries, assets = []) {
  const sourceAliases = new Map();
  for (const asset of assets) {
    const canonical = asset.serverSourceId || asset.id;
    sourceAliases.set(asset.id, canonical);
    if (asset.serverSourceId) sourceAliases.set(asset.serverSourceId, canonical);
  }

  const eventKey = (entry) => {
    if (entry.kind !== 'fact' || !entry.sourceId || !validEventDateKey(entry.eventDateKey)) return null;
    const source = sourceAliases.get(entry.sourceId) ?? entry.sourceId;
    return JSON.stringify([source, entry.eventDateKey]);
  };
  const groups = new Map();
  for (const entry of entries) {
    const key = eventKey(entry);
    if (key) groups.set(key, [...(groups.get(key) ?? []), entry]);
  }

  const emitted = new Set();
  return entries.flatMap((entry) => {
    const key = eventKey(entry);
    if (!key) return [entry];
    if (emitted.has(key)) return [];
    emitted.add(key);
    const members = groups.get(key) ?? [entry];
    if (members.length < 2) return [entry];
    const labOnly = members.every((member) => /lab|result|measurement/i.test(member.category));
    return [{
      ...entry,
      title: labOnly ? 'Blood test results' : 'Details from this source',
      category: labOnly ? 'Lab results' : 'Source details',
      detail: `${members.length} ${labOnly ? 'values' : 'details'} captured from this source.`,
      members,
    }];
  });
}
