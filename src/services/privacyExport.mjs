const INCLUDED = Object.freeze([
  'Profile details and setup progress',
  'Selected health areas and saved health details',
  'Source file names and saved source metadata',
  'Written notes, treatment history and care visits',
  'Record links, policy relationships and insurer replies',
  'Saved health reading and registry summaries',
  'Titled Ask conversations, their messages, saved questions and local consent receipts',
  'Local AI and public-search processing preferences',
]);

const NOT_INCLUDED = Object.freeze([
  'Original document contents for which no readable local copy was available; see sourceFilesUnavailable',
  'Unreviewed extraction workspace held separately by the preview service',
  'Information retained by an AI, search, or other external provider',
  'Cloud-account data or other profiles (this preview has no account sync)',
]);

export function buildNuraLocalExport(input) {
  const {
    exportedAt,
    profile,
    setupProgress,
    topics = [],
    assets = [],
    intakeNotes = [],
    facts = [],
    treatments = [],
    treatmentEvents = [],
    visits = [],
    visitEvents = [],
    links = [],
    policyReplacements = [],
    policyClarifications = [],
    feedItems = [],
    savedQuestions = [],
    agentMessages = [],
    askConversations = [],
    registryBriefs = [],
    consentReceipts = [],
    processingPreferences = null,
    sourceFiles = [],
  } = input;

  const filesByAssetId = new Map(sourceFiles.map((sourceFile) => [sourceFile.assetId, sourceFile]));
  const exportedSources = assets.map(({ uri: _privateUri, ...asset }) => {
    const sourceFile = filesByAssetId.get(asset.id);
    return {
      ...asset,
      originalFileIncluded: Boolean(sourceFile),
      archivePath: sourceFile ? sourceArchivePath(asset) : null,
    };
  });

  return {
    format: 'nura-local-record-export',
    formatVersion: 3,
    exportedAt,
    storage: 'local-device-preview',
    scope: exportScope(exportedSources),
    profile,
    setupProgress,
    healthAreas: topics,
    sources: exportedSources,
    sourceFilesUnavailable: exportedSources.filter((source) => !source.originalFileIncluded).map((source) => ({
      assetId: source.id,
      name: source.name,
      reason: 'No readable original file copy was available on this device during export.',
    })),
    writtenNotes: intakeNotes,
    healthRecords: facts,
    treatments,
    treatmentHistory: treatmentEvents,
    visits,
    visitHistory: visitEvents,
    recordLinks: links,
    policyReplacements,
    insurerReplies: policyClarifications,
    healthReading: feedItems,
    savedQuestions,
    askHistory: agentMessages,
    askConversations,
    registrySummaries: registryBriefs,
    perRunApprovals: consentReceipts,
    processingPreferences,
  };
}

/** Create a standards-compliant, uncompressed ZIP containing the export manifest and saved source files. */
export function createNuraExportArchive(manifest, sourceFiles = []) {
  const sourceById = new Map(sourceFiles.map((sourceFile) => [sourceFile.assetId, sourceFile]));
  if (sourceById.size !== sourceFiles.length) throw new Error('The export contains a duplicate source-file reference.');

  const manifestWithPaths = {
    ...manifest,
    sources: (manifest.sources ?? []).map((source) => {
      const sourceFile = sourceById.get(source.id);
      return {
        ...source,
        originalFileIncluded: Boolean(sourceFile),
        archivePath: sourceFile ? sourceArchivePath(source) : null,
      };
    }),
  };
  manifestWithPaths.scope = exportScope(manifestWithPaths.sources);
  manifestWithPaths.sourceFilesUnavailable = manifestWithPaths.sources.filter((source) => !source.originalFileIncluded).map((source) => ({
    assetId: source.id,
    name: source.name,
    reason: 'No readable original file copy was available on this device during export.',
  }));

  const encoder = new TextEncoder();
  const entries = [{ name: 'nura-export.json', bytes: encoder.encode(JSON.stringify(manifestWithPaths, null, 2)) }];
  for (const sourceFile of sourceFiles) {
    const source = (manifest.sources ?? []).find((item) => item.id === sourceFile.assetId);
    if (!source) throw new Error('The export contains a file that is not linked to a saved Nura source.');
    entries.push({ name: sourceArchivePath(source), bytes: toBytes(sourceFile.bytes) });
  }
  return zipStoredEntries(entries);
}

function exportScope(sources) {
  const includedFiles = sources.filter((source) => source.originalFileIncluded).length;
  return {
    included: [
      ...INCLUDED,
      ...(includedFiles ? [`Original file bytes for ${includedFiles} saved source${includedFiles === 1 ? '' : 's'}`] : []),
    ],
    notIncluded: [
      ...NOT_INCLUDED,
      ...(sources.length > includedFiles ? [`${sources.length - includedFiles} original source file${sources.length - includedFiles === 1 ? ' is' : 's are'} metadata-only; see the source list`] : []),
    ],
  };
}

function sourceArchivePath(asset) {
  const id = String(asset.id ?? 'source').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || 'source';
  const originalName = String(asset.name ?? 'original-file').split(/[\\/]/).pop() ?? 'original-file';
  const safeName = originalName
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[^\p{L}\p{N}._ -]/gu, '_')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 120) || 'original-file';
  return `original-files/${id}-${safeName}`;
}

function toBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new Error('An original source file could not be added to the export.');
}

function zipStoredEntries(entries) {
  if (entries.length > 0xffff) throw new Error('This export has too many files for the supported archive format.');
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const bytes = toBytes(entry.bytes);
    if (name.length > 0xffff || bytes.length > 0xffffffff || localOffset > 0xffffffff) {
      throw new Error('This export is too large for the supported archive format.');
    }
    const crc = crc32(bytes);
    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 0x0021, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, bytes.length, true);
    localView.setUint32(22, bytes.length, true);
    localView.setUint16(26, name.length, true);
    localView.setUint16(28, 0, true);
    local.set(name, 30);
    localParts.push(local, bytes);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 0x0021, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, bytes.length, true);
    centralView.setUint32(24, bytes.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, localOffset, true);
    central.set(name, 46);
    centralParts.push(central);
    localOffset += local.length + bytes.length;
  }

  const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
  if (localOffset + centralSize > 0xffffffff) throw new Error('This export is too large for the supported archive format.');
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, localOffset, true);
  endView.setUint16(20, 0, true);
  return concatBytes([...localParts, ...centralParts, end]);
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concatBytes(parts) {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}
