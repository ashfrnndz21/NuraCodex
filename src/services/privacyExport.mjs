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

export const MAX_BROWSER_EXPORT_BYTES = 64 * 1024 * 1024;

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

/** Write a standards-compliant stored ZIP incrementally to a caller-owned sink. */
export async function writeNuraExportArchive(manifest, sourceFiles = [], writeChunk) {
  if (typeof writeChunk !== 'function') throw new TypeError('A local export writer is required.');
  if (sourceFiles.some((sourceFile) => !sourceFile || !(sourceFile.bytes instanceof Uint8Array || sourceFile.bytes instanceof ArrayBuffer) && typeof sourceFile.openStream !== 'function')) {
    throw new Error('An original source file could not be opened for the export.');
  }
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
    entries.push({ name: sourceArchivePath(source), sourceFile });
  }
  if (entries.length > 0xffff) throw new Error('This export has too many files for the supported archive format.');

  const centralParts = [];
  let localOffset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    if (name.length > 0xffff) throw new Error('This export contains a file name that is too long.');
    const local = makeLocalHeader(name);
    await writeChunk(local);
    let crc = 0xffffffff;
    let size = 0;
    const emit = async (chunk) => {
      const bytes = toBytes(chunk);
      if (size + bytes.length > 0xffffffff || localOffset + local.length + size + bytes.length > 0xffffffff) {
        throw new Error('This export is too large for the supported archive format.');
      }
      crc = updateCrc32(crc, bytes);
      size += bytes.length;
      if (bytes.length) await writeChunk(bytes);
    };

    if (entry.bytes) {
      await emit(entry.bytes);
    } else if (entry.sourceFile.bytes) {
      await emit(entry.sourceFile.bytes);
    } else {
      const stream = await entry.sourceFile.openStream();
      const reader = stream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            for (let offset = 0; offset < value.length; offset += 64 * 1024) {
              await emit(value.subarray(offset, Math.min(value.length, offset + 64 * 1024)));
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    }

    crc = (crc ^ 0xffffffff) >>> 0;
    const descriptor = new Uint8Array(16);
    const descriptorView = new DataView(descriptor.buffer);
    descriptorView.setUint32(0, 0x08074b50, true);
    descriptorView.setUint32(4, crc, true);
    descriptorView.setUint32(8, size, true);
    descriptorView.setUint32(12, size, true);
    await writeChunk(descriptor);
    centralParts.push(makeCentralHeader(name, crc, size, localOffset));
    localOffset += local.length + size + descriptor.length;
  }

  const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
  if (localOffset + centralSize > 0xffffffff) throw new Error('This export is too large for the supported archive format.');
  for (const central of centralParts) await writeChunk(central);
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
  await writeChunk(end);
}

/** Calculate the stored ZIP size before a browser export allocates its output chunks. */
export function estimateNuraExportArchiveSize(manifest, sourceFiles = []) {
  const sourceById = new Map(sourceFiles.map((sourceFile) => [sourceFile.assetId, sourceFile]));
  const sources = (manifest.sources ?? []).map((source) => ({
    ...source,
    originalFileIncluded: sourceById.has(source.id),
    archivePath: sourceById.has(source.id) ? sourceArchivePath(source) : null,
  }));
  const manifestWithPaths = {
    ...manifest,
    sources,
    scope: exportScope(sources),
    sourceFilesUnavailable: sources.filter((source) => !source.originalFileIncluded).map((source) => ({
      assetId: source.id,
      name: source.name,
      reason: 'No readable original file copy was available on this device during export.',
    })),
  };
  const encoder = new TextEncoder();
  const manifestNameLength = encoder.encode('nura-export.json').length;
  let total = 22 + 30 + manifestNameLength + 16 + 46 + manifestNameLength + encoder.encode(JSON.stringify(manifestWithPaths, null, 2)).length;
  for (const sourceFile of sourceFiles) {
    const source = (manifest.sources ?? []).find((item) => item.id === sourceFile.assetId);
    if (!source) throw new Error('The export contains a file that is not linked to a saved Nura source.');
    const nameLength = encoder.encode(sourceArchivePath(source)).length;
    const fileSize = typeof sourceFile.sizeBytes === 'number'
      ? sourceFile.sizeBytes
      : sourceFile.bytes instanceof Uint8Array ? sourceFile.bytes.length
        : sourceFile.bytes instanceof ArrayBuffer ? sourceFile.bytes.byteLength : null;
    if (!Number.isSafeInteger(fileSize) || fileSize < 0) throw new Error('An original source file size could not be checked before export.');
    total += 30 + nameLength + 16 + fileSize + 46 + nameLength;
  }
  if (!Number.isSafeInteger(total) || total > 0xffffffff) throw new Error('This export is too large for the supported archive format.');
  return total;
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

function makeLocalHeader(name) {
  const header = new Uint8Array(30 + name.length);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0x0808, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0x0021, true);
  view.setUint16(26, name.length, true);
  header.set(name, 30);
  return header;
}

function makeCentralHeader(name, crc, size, localOffset) {
  const header = new Uint8Array(46 + name.length);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0x0808, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint16(14, 0x0021, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, size, true);
  view.setUint32(24, size, true);
  view.setUint16(28, name.length, true);
  view.setUint32(42, localOffset, true);
  header.set(name, 46);
  return header;
}

function updateCrc32(crc, bytes) {
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return crc >>> 0;
}
