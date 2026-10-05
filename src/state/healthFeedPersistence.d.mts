import type { SQLiteDatabase } from 'expo-sqlite';

export type PersistedHealthFeedItem = {
  id: string;
  title: string;
  detail: string;
  url: string;
  publisher: string;
  topic: string;
  retrievedAt: string;
  saved: boolean;
  dismissed: boolean;
  thumbnailUrl?: string;
  publishedAt?: string;
};

export function migrateHealthFeedMetadata(database: SQLiteDatabase): Promise<void>;
export function healthFeedItemFromRow(row: Record<string, unknown>): PersistedHealthFeedItem;
export function loadHealthFeedItems(database: SQLiteDatabase): Promise<PersistedHealthFeedItem[]>;
export function persistHealthFeedItems(database: SQLiteDatabase, items: readonly (Omit<PersistedHealthFeedItem, 'saved' | 'dismissed'> & Partial<Pick<PersistedHealthFeedItem, 'saved' | 'dismissed'>>)[]): Promise<void>;
