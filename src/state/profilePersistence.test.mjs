import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { loadProfileSetup, persistApprovedMemoryFact, persistProfileSetup } from './profilePersistence.mjs';

function createDatabase(filename = ':memory:', seed = true) {
  const connection = new DatabaseSync(filename);
  connection.exec(`
    CREATE TABLE IF NOT EXISTS profile (id INTEGER PRIMARY KEY CHECK(id=1), name TEXT NOT NULL, birthday TEXT NOT NULL, country TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS topics (id TEXT PRIMARY KEY,label TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS health_links (id TEXT PRIMARY KEY,from_id TEXT NOT NULL,to_id TEXT NOT NULL,label TEXT NOT NULL,relation_type TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS health_facts (id TEXT PRIMARY KEY,label TEXT NOT NULL,value TEXT NOT NULL,date TEXT NOT NULL,category TEXT NOT NULL,source TEXT NOT NULL,status TEXT NOT NULL,note TEXT);
    CREATE TABLE IF NOT EXISTS memory_provenance (fact_id TEXT PRIMARY KEY,source_run_id TEXT,review_state TEXT NOT NULL,valid_from TEXT NOT NULL,valid_until TEXT,confidence REAL,permission_scope TEXT NOT NULL,source_id TEXT,source_claim_id TEXT,supersedes_fact_id TEXT);
  `);
  if (seed) {
    connection.exec(`
      INSERT OR IGNORE INTO profile VALUES (1,'Old name','','','','');
      INSERT OR IGNORE INTO topics VALUES ('bp-topic','Blood pressure'),('cholesterol','Cholesterol'),('sleep','Sleep');
      INSERT OR IGNORE INTO health_links VALUES ('l1','topic:bp-topic','fact:lab','Related','related_by_me','2026-09-01T00:00:00.000Z');
      INSERT OR IGNORE INTO health_links VALUES ('l2','topic:sleep','fact:note','Related','related_by_me','2026-09-01T00:00:00.000Z');
    `);
  }
  return {
    runAsync: async (sql, ...params) => connection.prepare(sql).run(...params),
    getAllAsync: async (sql, ...params) => connection.prepare(sql).all(...params).map((row) => ({ ...row })),
    getFirstAsync: async (sql, ...params) => {
      const row = connection.prepare(sql).get(...params);
      return row ? { ...row } : null;
    },
    withTransactionAsync: async (task) => {
      connection.exec('BEGIN');
      try {
        await task();
        connection.exec('COMMIT');
      } catch (error) {
        connection.exec('ROLLBACK');
        throw error;
      }
    },
    close: () => connection.close(),
  };
}

const snapshot = {
  profile: { name: 'Riley Sample', birthday: '1990-01-15', country: 'Singapore', email: '', phone: '' },
  topics: [{ id: 'cholesterol', label: 'Cholesterol' }, { id: 'heart', label: 'Heart health' }],
  facts: [{ id: 'height-1', label: 'Height', value: '170 cm', date: '2026-09-24T08:00:00.000Z', category: 'Biometrics', source: 'Entered by you', status: 'reviewed', sourceRunId: 'run-synthetic-1', sourceId: 'source-synthetic-1', sourceClaimId: 'claim-synthetic-1', supersedesId: 'fact-height-prior', reviewState: 'user_confirmed', validFrom: '2026-09-24T08:00:00.000Z', validUntil: null, confidence: 0.9, permissionScope: 'profile_memory_write' }],
  explicitlyRemovedTopicIds: ['bp-topic'],
};

test('profile commit saves the selected snapshot and removes only explicitly deselected topics', async () => {
  const database = createDatabase();
  try {
    await persistProfileSetup(database, snapshot);
    const [profile] = await database.getAllAsync('SELECT * FROM profile WHERE id=1');
    assert.equal(profile.name, 'Riley Sample');
    assert.equal(profile.country, 'Singapore');
    const topics = await database.getAllAsync('SELECT id FROM topics ORDER BY id');
    assert.deepEqual(topics.map((item) => item.id), ['cholesterol', 'heart', 'sleep']);
    const facts = await database.getAllAsync('SELECT id,label,value FROM health_facts');
    assert.deepEqual(facts, [{ id: 'height-1', label: 'Height', value: '170 cm' }]);
    const provenance = await database.getAllAsync('SELECT fact_id,review_state,permission_scope FROM memory_provenance');
    assert.deepEqual(provenance, [{ fact_id: 'height-1', review_state: 'user_confirmed', permission_scope: 'profile_memory_write' }]);
    const links = await database.getAllAsync('SELECT id FROM health_links ORDER BY id');
    assert.deepEqual(links.map((item) => item.id), ['l2']);
  } finally {
    database.close();
  }
});

test('profile commit is idempotent when onboarding retries after a save error', async () => {
  const database = createDatabase();
  try {
    await persistProfileSetup(database, snapshot);
    await persistProfileSetup(database, snapshot);
    const [factCount] = await database.getAllAsync('SELECT COUNT(*) AS count FROM health_facts');
    const [provenanceCount] = await database.getAllAsync('SELECT COUNT(*) AS count FROM memory_provenance');
    assert.equal(factCount.count, 1);
    assert.equal(provenanceCount.count, 1);
  } finally {
    database.close();
  }
});

test('profile setup and fact provenance hydrate after the database is reopened', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'nura-profile-restart-'));
  const filename = join(directory, 'profile.db');
  try {
    const firstSession = createDatabase(filename);
    try {
      await persistProfileSetup(firstSession, snapshot);
    } finally {
      firstSession.close();
    }

    const restartedSession = createDatabase(filename, false);
    try {
      const restored = await loadProfileSetup(restartedSession);
      assert.deepEqual(restored.profile, snapshot.profile);
      assert.deepEqual(restored.topics.map((topic) => topic.id).sort(), ['cholesterol', 'heart', 'sleep']);
      assert.deepEqual(restored.facts.map((fact) => ({
        id: fact.id,
        label: fact.label,
        value: fact.value,
        date: fact.date,
        category: fact.category,
        source: fact.source,
        status: fact.status,
        sourceRunId: fact.sourceRunId,
        sourceId: fact.sourceId,
        sourceClaimId: fact.sourceClaimId,
        supersedesId: fact.supersedesId,
        reviewState: fact.reviewState,
        validFrom: fact.validFrom,
        validUntil: fact.validUntil,
        confidence: fact.confidence,
        permissionScope: fact.permissionScope,
      })), [{
        id: 'height-1',
        label: 'Height',
        value: '170 cm',
        date: '2026-09-24T08:00:00.000Z',
        category: 'Biometrics',
        source: 'Entered by you',
        status: 'reviewed',
        sourceRunId: 'run-synthetic-1',
        sourceId: 'source-synthetic-1',
        sourceClaimId: 'claim-synthetic-1',
        supersedesId: 'fact-height-prior',
        reviewState: 'user_confirmed',
        validFrom: '2026-09-24T08:00:00.000Z',
        validUntil: null,
        confidence: 0.9,
        permissionScope: 'profile_memory_write',
      }]);
    } finally {
      restartedSession.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('profile commit rolls back the entire snapshot when provenance writing fails', async () => {
  const database = createDatabase();
  const run = database.runAsync;
  database.runAsync = async (sql, ...params) => {
    if (sql.startsWith('INSERT INTO memory_provenance')) throw new Error('synthetic provenance failure');
    return run(sql, ...params);
  };
  try {
    await assert.rejects(persistProfileSetup(database, snapshot), /synthetic provenance failure/);
    const [profile] = await database.getAllAsync('SELECT * FROM profile WHERE id=1');
    assert.equal(profile.name, 'Old name');
    const topics = await database.getAllAsync('SELECT id FROM topics ORDER BY id');
    assert.deepEqual(topics.map((item) => item.id), ['bp-topic', 'cholesterol', 'sleep']);
    const [factCount] = await database.getAllAsync('SELECT COUNT(*) AS count FROM health_facts');
    assert.equal(factCount.count, 0);
  } finally {
    database.close();
  }
});

test('approved Ask memory fact commits its fact and provenance together', async () => {
  const database = createDatabase();
  const fact = {
    id: 'ask-memory-1', label: 'Morning routine', value: 'Walks before breakfast',
    date: '2026-09-26T08:00:00.000Z', category: 'User-approved memory',
    source: 'Nura suggestion · confirmed by you', status: 'reviewed',
    note: 'User requested that Nura remember this.', sourceRunId: 'ask-run-1',
    reviewState: 'user_confirmed', validFrom: '2026-09-26T08:00:00.000Z',
    validUntil: null, confidence: null, permissionScope: 'profile_memory_write',
  };
  try {
    await persistApprovedMemoryFact(database, fact);
    assert.deepEqual(await database.getAllAsync('SELECT id,label,value FROM health_facts'), [
      { id: 'ask-memory-1', label: 'Morning routine', value: 'Walks before breakfast' },
    ]);
    assert.deepEqual(await database.getAllAsync('SELECT fact_id,source_run_id,review_state,permission_scope FROM memory_provenance'), [
      { fact_id: 'ask-memory-1', source_run_id: 'ask-run-1', review_state: 'user_confirmed', permission_scope: 'profile_memory_write' },
    ]);
  } finally {
    database.close();
  }
});

test('approved Ask memory fact leaves no partial fact when provenance commit fails', async () => {
  const database = createDatabase();
  const run = database.runAsync;
  database.runAsync = async (sql, ...params) => {
    if (sql.startsWith('INSERT INTO memory_provenance')) throw new Error('synthetic provenance failure');
    return run(sql, ...params);
  };
  const fact = {
    id: 'ask-memory-failed', label: 'Morning routine', value: 'Walks before breakfast',
    date: '2026-09-26T08:00:00.000Z', category: 'User-approved memory',
    source: 'Nura suggestion · confirmed by you', status: 'reviewed',
    sourceRunId: 'ask-run-1', reviewState: 'user_confirmed',
    validFrom: '2026-09-26T08:00:00.000Z', permissionScope: 'profile_memory_write',
  };
  try {
    await assert.rejects(persistApprovedMemoryFact(database, fact), /synthetic provenance failure/);
    const [factCount] = await database.getAllAsync('SELECT COUNT(*) AS count FROM health_facts');
    const [provenanceCount] = await database.getAllAsync('SELECT COUNT(*) AS count FROM memory_provenance');
    assert.equal(factCount.count, 0);
    assert.equal(provenanceCount.count, 0);
  } finally {
    database.close();
  }
});
