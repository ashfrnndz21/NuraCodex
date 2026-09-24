import test from 'node:test';
import assert from 'node:assert/strict';
import { appendRegistryBrief } from './registryBriefPersistence.mjs';

function createDatabase() {
  let rows = [];
  let shouldFailInsert = false;
  return {
    rows: () => rows,
    failInsert(value) { shouldFailInsert = value; },
    async withTransactionAsync(operation) {
      const before = rows;
      rows = rows.map((row) => ({ ...row }));
      try { await operation(); } catch (error) { rows = before; throw error; }
    },
    async getAllAsync(_query, topicId) {
      return rows.filter((row) => row.topic_id === topicId).slice(-1).map((row) => ({ id: row.id, created_at: row.created_at }));
    },
    async runAsync(_query, id, topicId, topicLabel, answer, unknownsJson, citationsJson, sourceSignature, runId, createdAt, supersedesId) {
      if (shouldFailInsert) throw new Error('synthetic database failure');
      rows.push({ id, topic_id: topicId, topic_label: topicLabel, answer, unknowns_json: unknownsJson, citations_json: citationsJson, source_signature: sourceSignature, run_id: runId, created_at: createdAt, supersedes_brief_id: supersedesId });
    },
  };
}

function brief(id, topicId, createdAt) {
  return { id, topicId, topicLabel: topicId, answer: `Summary ${id}`, unknowns: ['unknown'], citations: [{ reference: 'R1', id: 'source-1', title: 'Report' }], sourceSignature: 'a'.repeat(64), runId: `run-${id}`, createdAt };
}

test('Registry brief versions chain from the latest persisted row per topic', async () => {
  const db = createDatabase();
  const first = await appendRegistryBrief(db, brief('brief-1', 'cholesterol', '2026-09-24T00:00:00.000Z'));
  const second = await appendRegistryBrief(db, brief('brief-2', 'cholesterol', '2026-09-24T00:00:00.000Z'));
  const otherTopic = await appendRegistryBrief(db, brief('brief-3', 'blood-pressure', '2026-09-24T00:00:00.000Z'));
  assert.equal(first.supersedesBriefId, undefined);
  assert.equal(second.supersedesBriefId, first.id);
  assert.equal(second.createdAt, '2026-09-24T00:00:00.001Z');
  assert.equal(otherTopic.supersedesBriefId, undefined);
  assert.equal(db.rows().length, 3);
});

test('Registry brief transaction rolls back when its insert fails', async () => {
  const db = createDatabase();
  await appendRegistryBrief(db, brief('brief-1', 'cholesterol', '2026-09-24T00:00:00.000Z'));
  db.failInsert(true);
  await assert.rejects(appendRegistryBrief(db, brief('brief-2', 'cholesterol', '2026-09-24T00:01:00.000Z')), /synthetic database failure/);
  assert.deepEqual(db.rows().map((row) => row.id), ['brief-1']);
});
