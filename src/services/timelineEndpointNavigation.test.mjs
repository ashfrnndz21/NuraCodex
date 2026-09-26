import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTimelineEndpointNavigation } from './timelineEndpointNavigation.mjs';

const entries = [
  { id: 'fact:bp', nodeId: 'fact:bp', kind: 'fact' },
  { id: 'fact:hdl', nodeId: 'fact:hdl', kind: 'fact' },
  { id: 'asset:policy', nodeId: 'asset:policy', kind: 'asset' },
];
const timelineEvents = [
  { ...entries[0], members: [entries[0], entries[1]] },
];
const topics = [{ id: 'sleep' }];

test('a linked member fact selects its value and opens the containing grouped event', () => {
  assert.deepEqual(
    resolveTimelineEndpointNavigation('fact:hdl', entries, timelineEvents, topics),
    {
      filter: 'Everything',
      expandedId: 'fact:bp',
      selectedNodeId: 'fact:hdl',
      targetKind: 'entry',
      targetRenderId: 'fact:bp',
    },
  );
});

test('a linked file opens its document card, while a chosen topic targets its separate chip', () => {
  assert.deepEqual(
    resolveTimelineEndpointNavigation('asset:policy', entries, timelineEvents, topics),
    {
      filter: 'Documents',
      expandedId: 'asset:policy',
      selectedNodeId: 'asset:policy',
      targetKind: 'entry',
      targetRenderId: 'asset:policy',
    },
  );
  assert.deepEqual(
    resolveTimelineEndpointNavigation('topic:sleep', entries, timelineEvents, topics),
    {
      filter: 'Everything',
      expandedId: null,
      selectedNodeId: 'topic:sleep',
      targetKind: 'topic',
      targetRenderId: 'topic:sleep',
    },
  );
});

test('stale connection endpoints do not target an unrelated timeline row', () => {
  assert.equal(resolveTimelineEndpointNavigation('fact:removed', entries, timelineEvents, topics), null);
});

test('a connection to a written note represented by an accepted detail opens that dated detail', () => {
  const note = { id: 'fact:note', nodeId: 'fact:note', kind: 'fact', source: 'Written by you', sourceId: 'self-report-1' };
  const acceptedDetail = { id: 'fact:bp', nodeId: 'fact:bp', kind: 'fact', sourceId: 'self-report-1', sourceClaimId: 'claim-bp' };
  const representedEvent = { ...acceptedDetail, members: [acceptedDetail] };

  assert.deepEqual(
    resolveTimelineEndpointNavigation('fact:note', [note, acceptedDetail], [representedEvent], topics),
    {
      filter: 'Everything',
      expandedId: 'fact:bp',
      selectedNodeId: 'fact:bp',
      targetKind: 'entry',
      targetRenderId: 'fact:bp',
    },
  );
});
