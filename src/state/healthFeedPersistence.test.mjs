import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadHealthFeedItems, migrateHealthFeedMetadata, persistHealthFeedItems } from './healthFeedPersistence.mjs';

function databaseAdapter(connection) {
  return {
    execAsync: async (sql) => connection.exec(sql),
    getAllAsync: async (sql) => connection.prepare(sql).all().map((row) => ({ ...row })),
    runAsync: async (sql, ...params) => connection.prepare(sql).run(...params),
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
  };
}

const legacySchema = `CREATE TABLE health_feed (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, detail TEXT NOT NULL, url TEXT NOT NULL,
  publisher TEXT NOT NULL, topic TEXT NOT NULL, retrieved_at TEXT NOT NULL,
  saved INTEGER NOT NULL DEFAULT 0, dismissed INTEGER NOT NULL DEFAULT 0
)`;

test('native feed media metadata survives migration, upsert and database reopen', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'nura-health-feed-persistence-'));
  const filename = join(directory, 'profile.db');
  try {
    const initialConnection = new DatabaseSync(filename);
    initialConnection.exec(legacySchema);
    initialConnection.prepare('INSERT INTO health_feed (id,title,detail,url,publisher,topic,retrieved_at,saved,dismissed) VALUES (?,?,?,?,?,?,?,?,?)')
      .run('legacy-video', 'Older title', 'Description', 'https://www.youtube.com/watch?v=abcDEF123_1', 'YouTube', 'Cholesterol', '2026-10-01T12:00:00.000Z', 1, 0);
    const initialDatabase = databaseAdapter(initialConnection);

    await migrateHealthFeedMetadata(initialDatabase);
    await migrateHealthFeedMetadata(initialDatabase);
    await persistHealthFeedItems(initialDatabase, [{
      id: 'legacy-video', title: 'Updated title', detail: 'Updated description',
      url: 'https://www.youtube.com/watch?v=abcDEF123_1', publisher: 'YouTube', topic: 'Cholesterol',
      retrievedAt: '2026-10-02T12:00:00.000Z', saved: true, dismissed: false,
      thumbnailUrl: 'https://i.ytimg.com/vi/abcDEF123_1/hqdefault.jpg', publishedAt: '2026-09-30T09:00:00.000Z',
    }]);
    initialConnection.close();

    const reopenedConnection = new DatabaseSync(filename);
    const reopenedDatabase = databaseAdapter(reopenedConnection);
    const [saved] = await loadHealthFeedItems(reopenedDatabase);
    assert.deepEqual(saved, {
      id: 'legacy-video', title: 'Updated title', detail: 'Updated description',
      url: 'https://www.youtube.com/watch?v=abcDEF123_1', publisher: 'YouTube', topic: 'Cholesterol',
      retrievedAt: '2026-10-02T12:00:00.000Z', saved: true, dismissed: false,
      thumbnailUrl: 'https://i.ytimg.com/vi/abcDEF123_1/hqdefault.jpg', publishedAt: '2026-09-30T09:00:00.000Z',
    });

    await persistHealthFeedItems(reopenedDatabase, [{
      id: 'legacy-video', title: 'Refreshed without thumbnail metadata', detail: 'Updated description',
      url: 'https://www.youtube.com/watch?v=abcDEF123_1', publisher: 'YouTube', topic: 'Cholesterol',
      retrievedAt: '2026-10-03T12:00:00.000Z', saved: true, dismissed: false,
    }]);
    const [refreshed] = await loadHealthFeedItems(reopenedDatabase);
    assert.equal(refreshed.thumbnailUrl, saved.thumbnailUrl);
    assert.equal(refreshed.publishedAt, saved.publishedAt);
    assert.equal(refreshed.saved, true);
    reopenedConnection.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
