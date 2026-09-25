import test from 'node:test';
import assert from 'node:assert/strict';
import { groupLabEvents } from './labEventGrouping.mjs';

function fact(id, { sourceId = 'report-a', eventDateKey = '2025-01-21', category = 'Measurement', kind = 'fact' } = {}) {
  return {
    id,
    nodeId: `${kind}:${id}`,
    kind,
    title: `Analyte ${id}`,
    detail: `${id} result`,
    date: '21 Jan 2025',
    timestamp: Date.parse('2025-01-21T00:00:00Z'),
    source: 'Report PL0005',
    category,
    sourceId,
    eventDateKey,
  };
}

test('groups same-source, same-date, same-category lab facts into one report event', () => {
  const first = fact('cholesterol');
  const second = fact('triglyceride', { category: 'measurement' });

  const [event] = groupLabEvents([first, second]);

  assert.equal(event.title, 'Blood test results');
  assert.equal(event.detail, '2 values captured from your report.');
  assert.deepEqual(event.members, [first, second]);
});

test('keeps facts separate across sources, dates, categories, or invalid dates', () => {
  const entries = [
    fact('cholesterol'),
    fact('triglyceride'),
    fact('other-source', { sourceId: 'report-b' }),
    fact('other-date', { eventDateKey: '2025-01-22' }),
    fact('other-category', { category: 'Lab results' }),
    fact('invalid-date', { eventDateKey: '2025-02-30' }),
    fact('unknown-date', { eventDateKey: null }),
    fact('non-fact', { kind: 'asset' }),
  ];

  const grouped = groupLabEvents(entries);

  assert.equal(grouped.length, 7);
  assert.deepEqual(grouped[0].members, [entries[0], entries[1]]);
  assert.deepEqual(grouped.slice(1), entries.slice(2));
});

test('does not group a single eligible result or a source-less result', () => {
  const single = fact('single');
  const withoutSource = fact('manual', { sourceId: '' });

  assert.deepEqual(groupLabEvents([single]), [single]);
  assert.deepEqual(groupLabEvents([withoutSource]), [withoutSource]);
});

test('groups mixed extracted categories from one source and event date without merging other records', async () => {
  const { groupSourceFactEvents } = await import('./timelineSourceGrouping.mjs');
  const sourceAssets = [{ id: 'report-local', serverSourceId: 'source-report', name: 'PL0005.pdf' }];
  const first = { ...fact('ldl', { sourceId: 'report-local', category: 'Measurement' }), sourceAssetName: 'PL0005.pdf' };
  const second = { ...fact('fasting-note', { sourceId: 'source-report', category: 'Condition' }), title: 'Fasting guidance', sourceAssetName: 'PL0005.pdf' };
  const later = fact('historical-result', { sourceId: 'source-report', eventDateKey: '2024-01-21', category: 'Measurement' });
  const otherSource = fact('other-report', { sourceId: 'source-other', category: 'Condition' });
  const invalidDate = fact('invalid-date', { sourceId: 'source-report', eventDateKey: '2025-02-30', category: 'Condition' });
  const manual = fact('manual', { sourceId: '', category: 'Self-reported' });

  const grouped = groupSourceFactEvents([first, second, later, otherSource, invalidDate, manual], sourceAssets);

  assert.equal(grouped.length, 5);
  assert.equal(grouped[0].title, 'Details from this source');
  assert.equal(grouped[0].category, 'Source details');
  assert.equal(grouped[0].detail, '2 details captured from this source.');
  assert.deepEqual(grouped[0].members, [first, second]);
  assert.deepEqual(grouped.slice(1), [later, otherSource, invalidDate, manual]);
});

test('keeps an analyzed source represented once while leaving standalone files and unsourced facts visible', async () => {
  const { omitAssetsRepresentedByDetails, resolveTimelineSourceAsset } = await import('./timelineSourceGrouping.mjs');
  const sourceAsset = { id: 'report-local', serverSourceId: 'source-report', name: 'PL0005.pdf' };
  const representedFile = { id: 'asset:report-local', nodeId: 'asset:report-local', kind: 'asset', sourceId: 'source-report' };
  const sameServerSourceCopy = { id: 'asset:report-copy', nodeId: 'asset:report-copy', kind: 'asset', sourceId: 'source-report' };
  const extractedFact = { ...fact('ldl', { sourceId: 'report-local' }), sourceAssetName: 'PL0005.pdf' };
  const localIdFact = fact('note', { sourceId: 'report-local', category: 'Condition' });
  const standaloneFile = { id: 'asset:unread', nodeId: 'asset:unread', kind: 'asset', title: 'unread.pdf' };
  const manualFact = fact('manual', { sourceId: '' });
  const treatmentOnlyFile = { id: 'asset:treatment-source', nodeId: 'asset:treatment-source', kind: 'asset', sourceId: 'source-treatment' };
  const treatmentOnly = { id: 'treatment:t1', nodeId: 'treatment:t1', kind: 'treatment', sourceId: 'source-treatment' };

  const sourceCopy = { id: 'report-copy', serverSourceId: 'source-report', name: 'PL0005 copy.pdf' };
  assert.deepEqual(omitAssetsRepresentedByDetails([representedFile, sameServerSourceCopy, extractedFact, standaloneFile, localIdFact, manualFact, treatmentOnlyFile, treatmentOnly], [sourceAsset, sourceCopy]), [extractedFact, standaloneFile, localIdFact, manualFact, treatmentOnlyFile, treatmentOnly]);
  assert.equal(resolveTimelineSourceAsset('source-report', [sourceAsset]), sourceAsset);
  assert.equal(resolveTimelineSourceAsset('report-local', [sourceAsset]), sourceAsset);
});
