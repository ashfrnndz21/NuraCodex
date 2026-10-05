const HEALTH_FEED_COLUMNS = `id,title,detail,url,publisher,topic,retrieved_at,saved,dismissed,thumbnail_url,published_at`;

/** Add the optional public-media metadata columns to existing native databases. */
export async function migrateHealthFeedMetadata(database) {
  const columns = await database.getAllAsync('PRAGMA table_info(health_feed)');
  if (!columns.some((column) => column.name === 'thumbnail_url')) {
    await database.execAsync('ALTER TABLE health_feed ADD COLUMN thumbnail_url TEXT');
  }
  if (!columns.some((column) => column.name === 'published_at')) {
    await database.execAsync('ALTER TABLE health_feed ADD COLUMN published_at TEXT');
  }
}

export function healthFeedItemFromRow(row) {
  return {
    id: row.id,
    title: row.title,
    detail: row.detail,
    url: row.url,
    publisher: row.publisher,
    topic: row.topic,
    retrievedAt: row.retrieved_at,
    saved: row.saved === 1,
    dismissed: row.dismissed === 1,
    ...(typeof row.thumbnail_url === 'string' && row.thumbnail_url ? { thumbnailUrl: row.thumbnail_url } : {}),
    ...(typeof row.published_at === 'string' && row.published_at ? { publishedAt: row.published_at } : {}),
  };
}

/** Load saved feed metadata from the device database. */
export async function loadHealthFeedItems(database) {
  const rows = await database.getAllAsync(`SELECT ${HEALTH_FEED_COLUMNS} FROM health_feed ORDER BY retrieved_at DESC`);
  return rows.map(healthFeedItemFromRow);
}

/** Persist search results without clearing saved/dismissed state or known media metadata. */
export async function persistHealthFeedItems(database, items) {
  if (!Array.isArray(items) || items.length === 0) return;
  await database.withTransactionAsync(async () => {
    for (const item of items) {
      await database.runAsync(
        `INSERT INTO health_feed (${HEALTH_FEED_COLUMNS}) VALUES (?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET
           title=excluded.title,
           detail=excluded.detail,
           url=excluded.url,
           publisher=excluded.publisher,
           topic=excluded.topic,
           retrieved_at=excluded.retrieved_at,
           thumbnail_url=COALESCE(excluded.thumbnail_url, health_feed.thumbnail_url),
           published_at=COALESCE(excluded.published_at, health_feed.published_at)`,
        item.id,
        item.title,
        item.detail,
        item.url,
        item.publisher,
        item.topic,
        item.retrievedAt,
        item.saved === true ? 1 : 0,
        item.dismissed === true ? 1 : 0,
        item.thumbnailUrl ?? null,
        item.publishedAt ?? null,
      );
    }
  });
}
