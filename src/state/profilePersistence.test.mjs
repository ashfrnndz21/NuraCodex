import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { persistProfileSetup } from './profilePersistence.mjs';

function createDatabase() {
  const connection = new DatabaseSync(':memory:');
  connection.exec(`
    CREATE TABLE profile (id INTEGER PRIMARY KEY CHECK(id=1), name TEXT NOT NULL, birthday TEXT NOT NULL, country TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL);
    INSERT INTO profile VALUES (1,'Old name','','','','');
    CREATE TABLE topics (id TEXT PRIMARY KEY,label TEXT NOT NULL);
    INSERT INTO topics VALUES ('bp-topic','Blood pressure'),('cholesterol','Cholesterol'),('sleep','Sleep');
    CREATE TABLE health_links (id TEXT PRIMARY KEY,from_id TEXT NOT NULL,to_id TEXT NOT NULL,label TEXT NOT NULL,relation_type TEXT NOT NULL,created_at TEXT NOT NULL);
    INSERT INTO health_links VALUES ('l1','topic:bp-topic','fact:lab','Related','related_by_me','2026-09-01T00:00:00.000Z');
    INSERT INTO health_links VALUES ('l2','topic:sleep','fact:note','Related','related_by_me','2026-09-01T00:00:00.000Z');
    CREATE TABLE health_facts (id TEXT PRIMARY KEY,label TEXT NOT NULL,value TEXT NOT NULL,date TEXT NOT NULL,category TEXT NOT NULL,source TEXT NOT NULL,status TEXT NOT NULL,note TEXT);
    CREATE TABLE memory_provenance (fact_id TEXT PRIMARY KEY,source_run_id TEXT,review_state TEXT NOT NULL,valid_from TEXT NOT NULL,valid_until TEXT,confidence REAL,permission_scope TEXT NOT NULL,source_id TEXT,source_claim_id TEXT,supersedes_fact_id TEXT);
  `);
  return {
    runAsync: async (sql, ...params) => connection.prepare(sql).run(...params),
    getAllAsync: async (sql, ...params) => connection.prepare(sql).all(...params).map((row) => ({ ...row })),
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
  facts: [{ id: 'height-1', label: 'Height', value: '170 cm', date: '2026-09-24T08:00:00.000Z', category: 'Biometrics', source: 'Entered by you', status: 'reviewed', reviewState: 'user_confirmed', validFrom: '2026-09-24T08:00:00.000Z', validUntil: null, confidence: null, permissionScope: 'profile_write' }],
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
    assert.deepEqual(provenance, [{ fact_id: 'height-1', review_state: 'user_confirmed', permission_scope: 'profile_write' }]);
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
