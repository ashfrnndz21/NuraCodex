import type * as SQLite from 'expo-sqlite';
import type { HealthFact, HealthTopic } from './NuraContext';

export type ProfileSetupSnapshot = {
  profile: { name: string; birthday: string; country: string; email: string; phone: string };
  topics: HealthTopic[];
  facts: HealthFact[];
  explicitlyRemovedTopicIds: string[];
};

export declare function persistProfileSetup(database: SQLite.SQLiteDatabase, snapshot: ProfileSetupSnapshot): Promise<void>;
