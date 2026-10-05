import assert from 'node:assert/strict';
import test from 'node:test';
import { buildNuraLocalExport, createNuraExportArchive } from './privacyExport.mjs';

test('local export contains the saved profile, history, citations, approvals, and preferences', () => {
  const result = buildNuraLocalExport({
    exportedAt: '2026-09-30T10:00:00.000Z',
    profile: { name: 'Riley', birthday: '1990-01-02' },
    setupProgress: { complete: true },
    topics: [{ id: 'heart', label: 'Heart health' }],
    assets: [{ id: 'source-1', name: 'lab.pdf', uri: 'file:///private/path/lab.pdf', serverSourceId: 'doc-1' }],
    intakeNotes: [{ id: 'note-1', text: 'User-authored note' }],
    facts: [{ id: 'fact-1', value: '118/76', sourceId: 'source-1', confidence: 0.9 }],
    treatments: [{ id: 'treatment-1', name: 'Medicine' }],
    treatmentEvents: [{ id: 'treatment-event-1', kind: 'added' }],
    visits: [{ id: 'visit-1', purpose: 'Follow-up' }],
    visitEvents: [{ id: 'visit-event-1', kind: 'created' }],
    links: [{ id: 'link-1', from: 'fact-1', to: 'source-1' }],
    policyReplacements: [{ id: 'policy-link-1' }],
    policyClarifications: [{ id: 'reply-1', response: 'User reported' }],
    feedItems: [{ id: 'reading-1', saved: true }],
    savedQuestions: ['What changed?'],
    agentMessages: [{ id: 'message-1', text: 'What changed?', citations: [{ id: 'fact-1' }] }],
    askConversations: [{ id: 'chat-1', title: 'Blood test overview', linkedConversationIds: ['chat-older'] }],
    registryBriefs: [{ id: 'brief-1', citations: [{ id: 'source-1' }] }],
    consentReceipts: [{ id: 'approval-1', purpose: 'ask' }],
    processingPreferences: { settings: { aiProcessing: false }, events: [] },
    sourceFiles: [{ assetId: 'source-1', bytes: new Uint8Array([37, 80, 68, 70]) }],
  });

  assert.equal(result.format, 'nura-local-record-export');
  assert.equal(result.formatVersion, 3);
  assert.equal(result.exportedAt, '2026-09-30T10:00:00.000Z');
  assert.deepEqual(result.profile, { name: 'Riley', birthday: '1990-01-02' });
  assert.deepEqual(result.healthRecords, [{ id: 'fact-1', value: '118/76', sourceId: 'source-1', confidence: 0.9 }]);
  assert.deepEqual(result.askHistory, [{ id: 'message-1', text: 'What changed?', citations: [{ id: 'fact-1' }] }]);
  assert.deepEqual(result.askConversations, [{ id: 'chat-1', title: 'Blood test overview', linkedConversationIds: ['chat-older'] }]);
  assert.deepEqual(result.perRunApprovals, [{ id: 'approval-1', purpose: 'ask' }]);
  assert.deepEqual(result.processingPreferences, { settings: { aiProcessing: false }, events: [] });
  assert.equal(result.sources[0].serverSourceId, 'doc-1');
  assert.equal('uri' in result.sources[0], false);
  assert.equal(result.sources[0].originalFileIncluded, true);
  assert.equal(result.sources[0].archivePath, 'original-files/source-1-lab.pdf');
  assert.equal(result.scope.included.includes('Original file bytes for 1 saved source'), true);
  assert.equal(result.sourceFilesUnavailable.length, 0);
});

test('local export works for a truly empty profile and labels its storage boundary', () => {
  const result = buildNuraLocalExport({ exportedAt: '2026-09-30T10:00:00.000Z', profile: {}, setupProgress: null });
  assert.equal(result.storage, 'local-device-preview');
  assert.deepEqual(result.healthAreas, []);
  assert.deepEqual(result.sources, []);
  assert.deepEqual(result.healthRecords, []);
  assert.deepEqual(result.askHistory, []);
});

test('export archive contains a readable manifest and exact original file bytes', () => {
  const bytes = new Uint8Array([0, 1, 2, 37, 80, 68, 70, 255]);
  const manifest = buildNuraLocalExport({
    exportedAt: '2026-09-30T10:00:00.000Z',
    profile: { name: 'Riley' },
    assets: [
      { id: 'source-1', name: 'lab.pdf', uri: 'file:///private/path/lab.pdf', kind: 'pdf' },
      { id: 'source-2', name: 'scan.png', uri: 'nura-local-asset://source-2', kind: 'image' },
    ],
  });
  const archive = createNuraExportArchive(manifest, [{ assetId: 'source-1', bytes }]);
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const endOffset = archive.length - 22;
  assert.equal(view.getUint32(endOffset, true), 0x06054b50);
  assert.equal(view.getUint16(endOffset + 10, true), 2);

  const decoder = new TextDecoder();
  const centralOffset = view.getUint32(endOffset + 16, true);
  const names = [];
  let cursor = centralOffset;
  const dataByName = new Map();
  for (let index = 0; index < view.getUint16(endOffset + 10, true); index += 1) {
    assert.equal(view.getUint32(cursor, true), 0x02014b50);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const name = decoder.decode(archive.slice(cursor + 46, cursor + 46 + nameLength));
    names.push(name);
    const localOffset = view.getUint32(cursor + 42, true);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const size = view.getUint32(localOffset + 22, true);
    dataByName.set(name, archive.slice(dataOffset, dataOffset + size));
    cursor += 46 + nameLength + extraLength + commentLength;
  }

  assert.deepEqual(names, [
    'nura-export.json',
    'original-files/source-1-lab.pdf',
  ]);
  assert.deepEqual(dataByName.get('original-files/source-1-lab.pdf'), bytes);
  const exportedManifest = JSON.parse(decoder.decode(dataByName.get('nura-export.json')));
  assert.equal(exportedManifest.sources[0].archivePath, 'original-files/source-1-lab.pdf');
  assert.equal(exportedManifest.sources[0].originalFileIncluded, true);
  assert.equal(exportedManifest.sources[1].originalFileIncluded, false);
  assert.equal(exportedManifest.sourceFilesUnavailable[0].assetId, 'source-2');
  assert.equal(JSON.stringify(exportedManifest).includes('file:///private/path'), false);
});

test('archive paths cannot escape the source folder and duplicate source bytes fail closed', () => {
  const manifest = buildNuraLocalExport({
    exportedAt: '2026-09-30T10:00:00.000Z',
    assets: [{ id: '../source', name: '../../private/identity.pdf', uri: 'file:///private/identity.pdf' }],
  });
  const archive = createNuraExportArchive(manifest, [{ assetId: '../source', bytes: new Uint8Array([1]) }]);
  assert.deepEqual(zipEntryNames(archive), ['nura-export.json', 'original-files/source-identity.pdf']);
  assert.throws(() => createNuraExportArchive(manifest, [
    { assetId: '../source', bytes: new Uint8Array([1]) },
    { assetId: '../source', bytes: new Uint8Array([2]) },
  ]), /duplicate source-file reference/);
});

function zipEntryNames(archive) {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const endOffset = archive.length - 22;
  let cursor = view.getUint32(endOffset + 16, true);
  const count = view.getUint16(endOffset + 10, true);
  const names = [];
  const decoder = new TextDecoder();
  for (let index = 0; index < count; index += 1) {
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    names.push(decoder.decode(archive.slice(cursor + 46, cursor + 46 + nameLength)));
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return names;
}
