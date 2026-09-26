import type * as SQLite from 'expo-sqlite';
import type { HealthFact, HealthTopic } from './NuraContext';

export type PersistedProfileSetup = {
  profile: { name: string; birthday: string; country: string; email: string; phone: string } | null;
  topics: HealthTopic[];
  facts: HealthFact[];
};

export type ProfileSetupSnapshot = {
  profile: { name: string; birthday: string; country: string; email: string; phone: string };
  topics: HealthTopic[];
  facts: HealthFact[];
  explicitlyRemovedTopicIds: string[];
};

export declare function persistProfileSetup(database: SQLite.SQLiteDatabase, snapshot: ProfileSetupSnapshot): Promise<void>;
export declare function persistApprovedMemoryFact(database: SQLite.SQLiteDatabase, fact: HealthFact): Promise<void>;
export declare function loadProfileSetup(database: SQLite.SQLiteDatabase): Promise<PersistedProfileSetup>;
