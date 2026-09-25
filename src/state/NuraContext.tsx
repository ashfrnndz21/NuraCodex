import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Directory, File, Paths } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import { loadProfileSetup, persistProfileSetup } from './profilePersistence.mjs';
import { appendRegistryBrief } from './registryBriefPersistence.mjs';
import { readBrowserDemoSnapshot, writeBrowserDemoSnapshot } from './browserDemoPersistence.mjs';
import { browserAssetUri, clearBrowserAssets, deleteBrowserAsset, saveBrowserAsset } from './browserAssetStore.mjs';
import { validatePolicyReplacement } from '../services/policyReplacement.mjs';
import { canonicalSourceFactValue } from '../services/sourceFactNormalization.mjs';

export type HealthTopic = { id: string; label: string };
export type IntakeAsset = { id: string; name: string; kind: 'image' | 'pdf' | 'video' | 'file'; uri: string; size?: number; mimeType?: string; purpose?: 'medical' | 'insurance'; serverSourceId?: string; possibleRepeat?: boolean; addedAt: string };
export type HealthIntakeNote = { id: string; text: string; topicId?: string; topicLabel?: string; createdAt: string };
export type HealthFact = { id: string; label: string; value: string; date: string; category: string; source: string; status: 'confirmed' | 'reviewed'; note?: string; sourceRunId?: string; sourceId?: string; sourceClaimId?: string; supersedesId?: string; reviewState?: 'user_confirmed' | 'user_retracted'; validFrom?: string; validUntil?: string | null; confidence?: number | null; permissionScope?: string };
export type TreatmentStatus = 'current' | 'past';
export type TreatmentRecord = { id: string; name: string; dose: string; schedule: string; purpose: string; prescriber: string; careLocation: string; pharmacy: string; status: TreatmentStatus; startedOn: string; endedOn?: string; source: string; sourceId?: string; createdAt: string; updatedAt: string };
export type TreatmentEvent = { id: string; treatmentId: string; kind: 'added' | 'details_updated' | 'marked_past'; summary: string; snapshot: TreatmentRecord; occurredAt: string };
export type TreatmentInput = Omit<TreatmentRecord, 'id' | 'createdAt' | 'updatedAt' | 'endedOn'> & { endedOn?: string };
export type VisitStatus = 'upcoming' | 'completed';
export type VisitFollowUpAction = { id: string; title: string; dueOn: string; status: 'open' | 'done'; source: string; sourceAssetIds: string[]; createdAt: string; updatedAt: string; completedAt?: string };
export type HealthVisit = { id: string; appointmentAt: string; purpose: string; clinician: string; location: string; status: VisitStatus; briefFactIds: string[]; briefAssetIds: string[]; briefTreatmentIds: string[]; questions: string[]; outcome: string; followUp: string; followUpActions?: VisitFollowUpAction[]; outcomeSourceAssetIds: string[]; source: string; createdAt: string; updatedAt: string };
export type VisitEvent = { id: string; visitId: string; kind: 'created' | 'brief_saved' | 'outcome_saved' | 'follow_up_updated' | 'details_updated'; summary: string; snapshot: HealthVisit; occurredAt: string };
export type VisitInput = Omit<HealthVisit, 'id' | 'createdAt' | 'updatedAt'>;
export type HealthLinkRelation = 'same_source' | 'happened_around' | 'measured_during' | 'treatment_for' | 'related_by_me' | 'user_note';
export type HealthLink = { id: string; from: string; to: string; relationType: HealthLinkRelation; label: string; createdAt: string };
export type PolicyReplacement = { id: string; newerSourceId: string; olderSourceId: string; createdAt: string };
export type HealthFeedItem = { id: string; title: string; detail: string; url: string; publisher: string; topic: string; retrievedAt: string; saved: boolean; dismissed: boolean };
export type AgentCitation = { reference: string; id: string; title: string; detail: string; date: string; source: string; status: string; kind: string; category?: string; url?: string; publisher?: string };
export type AgentTrace = { id: string; label: string; status: 'started' | 'complete'; detail?: string };
export type CoverageAssessment = { kind: 'explicit_benefit' | 'explicit_limit' | 'explicit_exclusion' | 'unclear'; policyReference: string; detail: string; relatedHealthReferences: string[] };
export type ProfileSummarySnapshot = { answer: string; citations: string[]; unknowns: string[]; nextSteps: string[]; memoryProposal: { label: string; value: string; reason: string } | null; revision: boolean };
export type AgentMessage = { id: string; runId: string; role: 'user' | 'assistant'; text: string; citations: AgentCitation[]; trace: AgentTrace[]; coverageAssessments?: CoverageAssessment[]; profileSummary?: ProfileSummarySnapshot; createdAt: string };
type AgentMessageRow = { id: string; run_id: string; role: AgentMessage['role']; text: string; citations_json: string; trace_json: string; created_at: string; answer_metadata_json: string };
function agentMessageFromRow(row: AgentMessageRow): AgentMessage {
  const metadata = JSON.parse(row.answer_metadata_json || '{}') as { coverageAssessments?: CoverageAssessment[]; profileSummary?: ProfileSummarySnapshot };
  return {
    id: row.id,
    runId: row.run_id,
    role: row.role,
    text: row.text,
    citations: JSON.parse(row.citations_json) as AgentCitation[],
    trace: JSON.parse(row.trace_json) as AgentTrace[],
    coverageAssessments: metadata.coverageAssessments,
    profileSummary: metadata.profileSummary,
    createdAt: row.created_at,
  };
}
export type RegistryBrief = { id: string; topicId: string; topicLabel: string; answer: string; unknowns: string[]; citations: AgentCitation[]; sourceSignature: string; runId: string; createdAt: string; supersedesBriefId?: string };
export type RegistryBriefInput = Omit<RegistryBrief, 'id' | 'createdAt' | 'supersedesBriefId'>;
export type AddFactMetadata = { source?: string; category?: string; note?: string; sourceRunId?: string; sourceId?: string; sourceClaimId?: string; supersedesId?: string; reviewState?: 'user_confirmed'; validFrom?: string; validUntil?: string | null; confidence?: number | null; permissionScope?: string };
type NuraState = {
  ready: boolean; storageError: string | null; name: string; birthday: string; country: string; email: string; phone: string;
  topics: HealthTopic[]; assets: IntakeAsset[]; intakeNotes: HealthIntakeNote[]; facts: HealthFact[]; treatments: TreatmentRecord[]; treatmentEvents: TreatmentEvent[]; visits: HealthVisit[]; visitEvents: VisitEvent[]; links: HealthLink[]; policyReplacements: PolicyReplacement[]; feedItems: HealthFeedItem[]; savedQuestions: string[]; agentMessages: AgentMessage[]; registryBriefs: RegistryBrief[];
  updateProfile: (patch: Partial<Pick<NuraState, 'name' | 'birthday' | 'country' | 'email' | 'phone'>>) => void;
  commitProfileSetup: () => Promise<void>;
  toggleTopic: (topic: HealthTopic) => void; addFact: (label: string, value: string, metadata?: AddFactMetadata) => void; correctFact: (id: string, label: string, value: string) => Promise<HealthFact | null>; retractFact: (id: string, retractedAt: string) => Promise<boolean>; removeFact: (id: string) => void; addAssets: (assets: Omit<IntakeAsset, 'addedAt'>[]) => Promise<void>; saveIntakeNote: (note: { id?: string; text: string; topicId?: string; topicLabel?: string }) => Promise<HealthIntakeNote>; commitIntakeNote: (id: string, text?: string) => Promise<HealthFact>; removeIntakeNote: (id: string) => Promise<void>; attachSourceToAsset: (assetId: string, sourceId: string | null) => void;
  reconcileSourceFactDate: (factId: string, sourceId: string, sourceClaimId: string, effectiveAt: string) => boolean;
  reconcileSourceFactValue: (factId: string, sourceId: string, sourceClaimId: string, expectedValue: string, normalizedValue: string) => Promise<boolean>;
  addTreatment: (input: TreatmentInput) => TreatmentRecord | null; updateTreatment: (id: string, patch: Partial<TreatmentInput>) => TreatmentRecord | null; markTreatmentPast: (id: string, endedOn?: string) => TreatmentRecord | null;
  addVisit: (input: VisitInput) => HealthVisit | null; updateVisit: (id: string, patch: Partial<VisitInput>) => HealthVisit | null;
  addLink: (from: string, to: string, label: string, relationType?: HealthLinkRelation) => HealthLink | null; removeLink: (id: string) => void; mergeFeedItems: (items: Omit<HealthFeedItem, 'saved' | 'dismissed'>[]) => void; setFeedSaved: (id: string, saved: boolean) => void; setFeedDismissed: (id: string, dismissed: boolean) => void;
  addPolicyReplacement: (newerSourceId: string, olderSourceId: string) => Promise<PolicyReplacement | null>; removePolicyReplacement: (id: string) => Promise<void>;
  addQuestion: (question: string) => void; addAgentMessage: (message: Omit<AgentMessage, 'id' | 'createdAt'>) => AgentMessage; saveRegistryBrief: (brief: RegistryBriefInput) => Promise<RegistryBrief>; clearAgentMessages: () => void; clearAllLocalData: () => Promise<{ fileCleanupFailed: boolean }>; resetDemo: () => void;
};
const NuraContext = createContext<NuraState | null>(null);
const DB_NAME = 'nura-private.db';
const WEB_DEMO_KEY = 'nura-local-demo-v1';
const DEMO_NOTE = 'Synthetic demo example · not your health information.';
const FILES = Platform.OS === 'web' ? null : new Directory(Paths.document, 'nura-health-files');
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
type BrowserDemoSnapshot = { version: 1; demoOnly: true; name: string; birthday: string; country: string; email: string; phone: string; topics: HealthTopic[]; assets: IntakeAsset[]; intakeNotes: HealthIntakeNote[]; facts: HealthFact[]; treatments: TreatmentRecord[]; treatmentEvents: TreatmentEvent[]; visits: HealthVisit[]; visitEvents: VisitEvent[]; links: HealthLink[]; policyReplacements: PolicyReplacement[]; feedItems: HealthFeedItem[]; savedQuestions: string[]; agentMessages: AgentMessage[]; registryBriefs: RegistryBrief[] };
function demoSnapshot(): BrowserDemoSnapshot {
  return {
    version: 1, demoOnly: true, name: '', birthday: '', country: '', email: '', phone: '',
    // A new profile starts with no selected health areas. Sample records remain
    // available in the demo, but they must never look like the user's choices.
    topics: [],
    intakeNotes: [],
    assets: [{ id: 'demo-source-lab', name: 'Example blood test.pdf', kind: 'pdf', uri: 'demo://example-blood-test.pdf', mimeType: 'application/pdf', size: 128000, possibleRepeat: false, addedAt: '2026-09-12T09:00:00.000Z' }],
    facts: [
      { id: 'demo-fact-lab', label: 'Example blood test', value: 'Five values listed in a sample report', date: '2026-09-12T09:00:00.000Z', category: 'Lab results', source: 'Synthetic demo report · page 2', status: 'reviewed', note: DEMO_NOTE, reviewState: 'user_confirmed', validFrom: '2026-09-12T09:00:00.000Z', confidence: 1, permissionScope: 'demo_only' },
      { id: 'demo-fact-care', label: 'Example clinic visit', value: 'Follow-up note from a sample visit', date: '2026-09-02T09:00:00.000Z', category: 'Care', source: 'Synthetic demo clinic note', status: 'reviewed', note: DEMO_NOTE, reviewState: 'user_confirmed', validFrom: '2026-09-02T09:00:00.000Z', confidence: 1, permissionScope: 'demo_only' },
      { id: 'demo-fact-treatment', label: 'Example medicine entry', value: 'A sample medicine note, not a treatment instruction', date: '2026-08-18T09:00:00.000Z', category: 'Treatment', source: 'Synthetic demo medicine list', status: 'reviewed', note: DEMO_NOTE, reviewState: 'user_confirmed', validFrom: '2026-08-18T09:00:00.000Z', confidence: 1, permissionScope: 'demo_only' },
    ],
    treatments: [{ id: 'demo-treatment-01', name: 'Sample medicine', dose: 'Example 10 mg', schedule: 'Example · once daily', purpose: 'Sample treatment note', prescriber: 'Sample clinician', careLocation: 'Sample clinic', pharmacy: 'Sample pharmacy', status: 'current', startedOn: '2026-08-18', source: 'Synthetic demo medicine list', createdAt: '2026-08-18T09:00:00.000Z', updatedAt: '2026-08-18T09:00:00.000Z' }],
    treatmentEvents: [{ id: 'demo-treatment-event-01', treatmentId: 'demo-treatment-01', kind: 'added', summary: 'Sample medicine added', snapshot: { id: 'demo-treatment-01', name: 'Sample medicine', dose: 'Example 10 mg', schedule: 'Example · once daily', purpose: 'Sample treatment note', prescriber: 'Sample clinician', careLocation: 'Sample clinic', pharmacy: 'Sample pharmacy', status: 'current', startedOn: '2026-08-18', source: 'Synthetic demo medicine list', createdAt: '2026-08-18T09:00:00.000Z', updatedAt: '2026-08-18T09:00:00.000Z' }, occurredAt: '2026-08-18T09:00:00.000Z' }],
    visits: [
      { id: 'demo-visit-upcoming', appointmentAt: '2026-10-02T09:00:00.000Z', purpose: 'Sample cardiology follow-up', clinician: 'Sample care team', location: 'Sample clinic', status: 'upcoming', briefFactIds: ['demo-fact-lab'], briefAssetIds: ['demo-source-lab'], briefTreatmentIds: [], questions: ['What changed since my last blood test?'], outcome: '', followUp: '', outcomeSourceAssetIds: [], source: DEMO_NOTE, createdAt: '2026-09-20T09:00:00.000Z', updatedAt: '2026-09-20T09:00:00.000Z' },
      { id: 'demo-visit-completed', appointmentAt: '2026-09-02T09:00:00.000Z', purpose: 'Sample clinic follow-up', clinician: 'Sample clinician', location: 'Sample clinic', status: 'completed', briefFactIds: ['demo-fact-care'], briefAssetIds: [], briefTreatmentIds: [], questions: [], outcome: 'Sample visit note. No clinician instructions were inferred.', followUp: 'Add a follow-up date when you know it.', followUpActions: [{ id: 'demo-follow-up-01', title: 'Sample: schedule the next clinic visit', dueOn: '2026-10-02', status: 'open', source: 'Synthetic demo follow-up · entered by you', sourceAssetIds: [], createdAt: '2026-09-02T10:05:00.000Z', updatedAt: '2026-09-02T10:05:00.000Z' }], outcomeSourceAssetIds: [], source: DEMO_NOTE, createdAt: '2026-09-02T10:00:00.000Z', updatedAt: '2026-09-02T10:00:00.000Z' },
    ],
    visitEvents: [],
    links: [{ id: 'demo-link-lab-care', from: 'fact:demo-fact-lab', to: 'fact:demo-fact-care', relationType: 'happened_around', label: 'Sample records to compare', createdAt: '2026-09-12T10:00:00.000Z' }],
    policyReplacements: [], feedItems: [], savedQuestions: [], agentMessages: [], registryBriefs: [],
  };
}
function emptyDemoSnapshot(): BrowserDemoSnapshot {
  const seed = demoSnapshot();
  return { ...seed, name: '', birthday: '', country: '', email: '', phone: '', topics: [], assets: [], intakeNotes: [], facts: [], treatments: [], treatmentEvents: [], visits: [], visitEvents: [], links: [], policyReplacements: [], feedItems: [], savedQuestions: [], agentMessages: [], registryBriefs: [] };
}
async function getDatabase() {
  if (!dbPromise) dbPromise = (async () => {
    const db = await SQLite.openDatabaseAsync(DB_NAME);
    if (Platform.OS !== 'web') {
      const keyName = 'nura-local-db-key-v1';
      let key = await SecureStore.getItemAsync(keyName);
      if (!key) {
        key = Array.from(Crypto.getRandomBytes(32), (byte) => byte.toString(16).padStart(2, '0')).join('');
        await SecureStore.setItemAsync(keyName, key, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
      }
      await db.execAsync(`PRAGMA key = "x'${key}'";`);
    }
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS profile (id INTEGER PRIMARY KEY CHECK(id=1), name TEXT NOT NULL DEFAULT '', birthday TEXT NOT NULL DEFAULT '', country TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '');
      INSERT OR IGNORE INTO profile (id) VALUES (1);
      CREATE TABLE IF NOT EXISTS topics (id TEXT PRIMARY KEY, label TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS health_facts (id TEXT PRIMARY KEY, label TEXT NOT NULL, value TEXT NOT NULL, date TEXT NOT NULL, category TEXT NOT NULL, source TEXT NOT NULL, status TEXT NOT NULL, note TEXT);
      CREATE TABLE IF NOT EXISTS treatments (id TEXT PRIMARY KEY, name TEXT NOT NULL, dose TEXT NOT NULL, schedule TEXT NOT NULL, purpose TEXT NOT NULL, prescriber TEXT NOT NULL, care_location TEXT NOT NULL, pharmacy TEXT NOT NULL, status TEXT NOT NULL, started_on TEXT NOT NULL, ended_on TEXT, source TEXT NOT NULL, source_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS treatment_events (id TEXT PRIMARY KEY, treatment_id TEXT NOT NULL, kind TEXT NOT NULL, summary TEXT NOT NULL, snapshot_json TEXT NOT NULL, occurred_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS care_visits (id TEXT PRIMARY KEY, appointment_at TEXT NOT NULL, status TEXT NOT NULL, visit_json TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS care_visit_events (id TEXT PRIMARY KEY, visit_id TEXT NOT NULL, kind TEXT NOT NULL, summary TEXT NOT NULL, snapshot_json TEXT NOT NULL, occurred_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, uri TEXT NOT NULL, size INTEGER, mime_type TEXT, added_at TEXT NOT NULL, purpose TEXT NOT NULL DEFAULT 'medical', server_source_id TEXT);
      CREATE TABLE IF NOT EXISTS health_intake_notes (id TEXT PRIMARY KEY, text TEXT NOT NULL, topic_id TEXT, topic_label TEXT, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS health_links (id TEXT PRIMARY KEY, from_id TEXT NOT NULL, to_id TEXT NOT NULL, label TEXT NOT NULL, relation_type TEXT NOT NULL DEFAULT 'user_note', created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS policy_replacements (id TEXT PRIMARY KEY, newer_source_id TEXT NOT NULL, older_source_id TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(newer_source_id,older_source_id), CHECK(newer_source_id <> older_source_id));
      CREATE TABLE IF NOT EXISTS agent_messages (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, role TEXT NOT NULL, text TEXT NOT NULL, citations_json TEXT NOT NULL, trace_json TEXT NOT NULL, created_at TEXT NOT NULL, answer_metadata_json TEXT NOT NULL DEFAULT '{}');
      CREATE TABLE IF NOT EXISTS registry_briefs (id TEXT PRIMARY KEY, topic_id TEXT NOT NULL, topic_label TEXT NOT NULL, answer TEXT NOT NULL, unknowns_json TEXT NOT NULL DEFAULT '[]', citations_json TEXT NOT NULL, source_signature TEXT NOT NULL, run_id TEXT NOT NULL, created_at TEXT NOT NULL, supersedes_brief_id TEXT);
      CREATE TABLE IF NOT EXISTS memory_provenance (fact_id TEXT PRIMARY KEY, source_run_id TEXT, review_state TEXT NOT NULL, valid_from TEXT NOT NULL, valid_until TEXT, confidence REAL, permission_scope TEXT NOT NULL, source_id TEXT, source_claim_id TEXT, supersedes_fact_id TEXT);
      CREATE TABLE IF NOT EXISTS questions (id INTEGER PRIMARY KEY AUTOINCREMENT, question TEXT NOT NULL UNIQUE, added_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS health_feed (id TEXT PRIMARY KEY, title TEXT NOT NULL, detail TEXT NOT NULL, url TEXT NOT NULL, publisher TEXT NOT NULL, topic TEXT NOT NULL, retrieved_at TEXT NOT NULL, saved INTEGER NOT NULL DEFAULT 0, dismissed INTEGER NOT NULL DEFAULT 0);
    `);
    const assetColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(assets)');
    if (!assetColumns.some((column) => column.name === 'purpose')) await db.execAsync("ALTER TABLE assets ADD COLUMN purpose TEXT NOT NULL DEFAULT 'medical'");
    if (!assetColumns.some((column) => column.name === 'server_source_id')) await db.execAsync('ALTER TABLE assets ADD COLUMN server_source_id TEXT');
    const provenanceColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(memory_provenance)');
    if (!provenanceColumns.some((column) => column.name === 'source_id')) await db.execAsync('ALTER TABLE memory_provenance ADD COLUMN source_id TEXT');
    if (!provenanceColumns.some((column) => column.name === 'source_claim_id')) await db.execAsync('ALTER TABLE memory_provenance ADD COLUMN source_claim_id TEXT');
    if (!provenanceColumns.some((column) => column.name === 'supersedes_fact_id')) await db.execAsync('ALTER TABLE memory_provenance ADD COLUMN supersedes_fact_id TEXT');
    const messageColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(agent_messages)');
    if (!messageColumns.some((column) => column.name === 'answer_metadata_json')) await db.execAsync("ALTER TABLE agent_messages ADD COLUMN answer_metadata_json TEXT NOT NULL DEFAULT '{}'");
    const briefColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(registry_briefs)');
    if (!briefColumns.some((column) => column.name === 'unknowns_json')) await db.execAsync("ALTER TABLE registry_briefs ADD COLUMN unknowns_json TEXT NOT NULL DEFAULT '[]'");
    const linkColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(health_links)');
    if (!linkColumns.some((column) => column.name === 'relation_type')) await db.execAsync("ALTER TABLE health_links ADD COLUMN relation_type TEXT NOT NULL DEFAULT 'user_note'");
    return db;
  })();
  return dbPromise;
}
function newId() { return Crypto.randomUUID(); }
export function NuraProvider({ children }: { children: React.ReactNode }) {
  const [browserBootstrap] = useState(() => {
    if (Platform.OS !== 'web') return { snapshot: null as BrowserDemoSnapshot | null, warning: null as string | null };
    try { return readBrowserDemoSnapshot(typeof window === 'undefined' ? null : window.localStorage, WEB_DEMO_KEY, demoSnapshot()); }
    catch { return { snapshot: demoSnapshot(), warning: 'Browser storage is unavailable. Changes may not survive a refresh.' }; }
  });
  const webBootstrap = browserBootstrap.snapshot;
  const browserWritesAllowed = useRef(!browserBootstrap.warning);
  const [ready, setReady] = useState(Platform.OS === 'web'); const [storageError, setStorageError] = useState<string | null>(browserBootstrap.warning);
  const [name, setName] = useState(webBootstrap?.name ?? ''); const [birthday, setBirthday] = useState(webBootstrap?.birthday ?? ''); const [country, setCountry] = useState(webBootstrap?.country ?? ''); const [email, setEmail] = useState(webBootstrap?.email ?? ''); const [phone, setPhone] = useState(webBootstrap?.phone ?? '');
  const [topics, setTopics] = useState<HealthTopic[]>(webBootstrap?.topics ?? []); const [assets, setAssets] = useState<IntakeAsset[]>(webBootstrap?.assets ?? []); const [intakeNotes, setIntakeNotes] = useState<HealthIntakeNote[]>(webBootstrap?.intakeNotes ?? []); const [facts, setFacts] = useState<HealthFact[]>(webBootstrap?.facts ?? []); const [treatments, setTreatments] = useState<TreatmentRecord[]>(webBootstrap?.treatments ?? []); const [treatmentEvents, setTreatmentEvents] = useState<TreatmentEvent[]>(webBootstrap?.treatmentEvents ?? []); const [visits, setVisits] = useState<HealthVisit[]>(webBootstrap?.visits ?? []); const [visitEvents, setVisitEvents] = useState<VisitEvent[]>(webBootstrap?.visitEvents ?? []); const [links, setLinks] = useState<HealthLink[]>(webBootstrap?.links ?? []); const [policyReplacements, setPolicyReplacements] = useState<PolicyReplacement[]>(webBootstrap?.policyReplacements ?? []); const [feedItems, setFeedItems] = useState<HealthFeedItem[]>(webBootstrap?.feedItems ?? []); const [savedQuestions, setSavedQuestions] = useState<string[]>(webBootstrap?.savedQuestions ?? []); const [agentMessages, setAgentMessages] = useState<AgentMessage[]>(webBootstrap?.agentMessages ?? []); const [registryBriefs, setRegistryBriefs] = useState<RegistryBrief[]>(webBootstrap?.registryBriefs ?? []);
  const pendingProfileWrites = useRef(new Set<Promise<void>>());
  const committingIntakeNotes = useRef(new Set<string>());
  const profileWriteFailures = useRef<string[]>([]);
  const explicitlyRemovedTopics = useRef(new Set<string>());
  const enqueueProfileWrite = useCallback((write: Promise<unknown>) => {
    const pending = write.then(() => undefined).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Profile changes could not be saved on this device.';
      profileWriteFailures.current.push(message);
      setStorageError(message);
      throw error;
    });
    pendingProfileWrites.current.add(pending);
    void pending.finally(() => pendingProfileWrites.current.delete(pending)).catch(() => undefined);
    return pending;
  }, []);
  const drainProfileWrites = useCallback(async () => {
    while (pendingProfileWrites.current.size > 0) {
      await Promise.allSettled(Array.from(pendingProfileWrites.current));
    }
  }, []);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let active = true;
    (async () => {
      try {
        const db = await getDatabase();
        const { profile, topics: loadedTopics, facts: loadedFacts } = await loadProfileSetup(db);
        const loadedTreatments = await db.getAllAsync<TreatmentRecord & { care_location: string; started_on: string; ended_on: string | null; source_id: string | null; created_at: string; updated_at: string }>('SELECT id,name,dose,schedule,purpose,prescriber,care_location,pharmacy,status,started_on,ended_on,source,source_id,created_at,updated_at FROM treatments ORDER BY updated_at DESC');
        const loadedTreatmentEvents = await db.getAllAsync<{ id: string; treatment_id: string; kind: TreatmentEvent['kind']; summary: string; snapshot_json: string; occurred_at: string }>('SELECT id,treatment_id,kind,summary,snapshot_json,occurred_at FROM treatment_events ORDER BY occurred_at DESC');
        const loadedVisits = await db.getAllAsync<{ visit_json: string }>('SELECT visit_json FROM care_visits ORDER BY appointment_at DESC');
        const loadedVisitEvents = await db.getAllAsync<{ id: string; visit_id: string; kind: VisitEvent['kind']; summary: string; snapshot_json: string; occurred_at: string }>('SELECT id,visit_id,kind,summary,snapshot_json,occurred_at FROM care_visit_events ORDER BY occurred_at DESC');
        const loadedAssets = await db.getAllAsync<{ id: string; name: string; kind: IntakeAsset['kind']; uri: string; size: number | null; mime_type: string | null; added_at: string; purpose: 'medical' | 'insurance' | null; server_source_id: string | null }>('SELECT id,name,kind,uri,size,mime_type,added_at,purpose,server_source_id FROM assets ORDER BY added_at DESC');
        const loadedIntakeNotes = await db.getAllAsync<HealthIntakeNote>('SELECT id,text,topic_id AS topicId,topic_label AS topicLabel,created_at AS createdAt FROM health_intake_notes ORDER BY created_at DESC');
        const loadedLinks = await db.getAllAsync<{ id: string; from_id: string; to_id: string; label: string; relation_type: HealthLinkRelation; created_at: string }>('SELECT id,from_id,to_id,label,relation_type,created_at FROM health_links ORDER BY created_at DESC');
        const loadedPolicyReplacements = await db.getAllAsync<{ id: string; newer_source_id: string; older_source_id: string; created_at: string }>('SELECT id,newer_source_id,older_source_id,created_at FROM policy_replacements ORDER BY created_at DESC');
        const loadedQuestions = await db.getAllAsync<{ question: string }>('SELECT question FROM questions ORDER BY added_at DESC');
        const loadedMessages = await db.getAllAsync<AgentMessageRow>('SELECT id,run_id,role,text,citations_json,trace_json,created_at,answer_metadata_json FROM agent_messages ORDER BY created_at');
        const loadedRegistryBriefs = await db.getAllAsync<{ id: string; topic_id: string; topic_label: string; answer: string; unknowns_json: string; citations_json: string; source_signature: string; run_id: string; created_at: string; supersedes_brief_id: string | null }>('SELECT id,topic_id,topic_label,answer,unknowns_json,citations_json,source_signature,run_id,created_at,supersedes_brief_id FROM registry_briefs ORDER BY created_at DESC');
        const loadedFeed = await db.getAllAsync<{ id: string; title: string; detail: string; url: string; publisher: string; topic: string; retrieved_at: string; saved: number; dismissed: number }>('SELECT id,title,detail,url,publisher,topic,retrieved_at,saved,dismissed FROM health_feed ORDER BY retrieved_at DESC');
        if (active) { if (profile) { setName(profile.name); setBirthday(profile.birthday); setCountry(profile.country); setEmail(profile.email); setPhone(profile.phone); } setTopics(loadedTopics); setIntakeNotes(loadedIntakeNotes); setFacts(loadedFacts); setTreatments(loadedTreatments.map((record) => ({ id: record.id, name: record.name, dose: record.dose, schedule: record.schedule, purpose: record.purpose, prescriber: record.prescriber, careLocation: record.care_location, pharmacy: record.pharmacy, status: record.status, startedOn: record.started_on, endedOn: record.ended_on ?? undefined, source: record.source, sourceId: record.source_id ?? undefined, createdAt: record.created_at, updatedAt: record.updated_at }))); setTreatmentEvents(loadedTreatmentEvents.map((event) => ({ id: event.id, treatmentId: event.treatment_id, kind: event.kind, summary: event.summary, snapshot: JSON.parse(event.snapshot_json) as TreatmentRecord, occurredAt: event.occurred_at }))); setVisits(loadedVisits.map((row) => { const visit = JSON.parse(row.visit_json) as HealthVisit; return { ...visit, followUpActions: visit.followUpActions ?? [] }; })); setVisitEvents(loadedVisitEvents.map((event) => ({ id: event.id, visitId: event.visit_id, kind: event.kind, summary: event.summary, snapshot: JSON.parse(event.snapshot_json) as HealthVisit, occurredAt: event.occurred_at }))); setAssets(loadedAssets.map((a) => ({ id: a.id, name: a.name, kind: a.kind, uri: a.uri, size: a.size ?? undefined, mimeType: a.mime_type ?? undefined, purpose: a.purpose ?? 'medical', serverSourceId: a.server_source_id ?? undefined, addedAt: a.added_at }))); setLinks(loadedLinks.map((link) => ({ id: link.id, from: link.from_id, to: link.to_id, relationType: link.relation_type, label: link.label, createdAt: link.created_at }))); setPolicyReplacements(loadedPolicyReplacements.map((link) => ({ id: link.id, newerSourceId: link.newer_source_id, olderSourceId: link.older_source_id, createdAt: link.created_at }))); setSavedQuestions(loadedQuestions.map((q) => q.question)); setAgentMessages(loadedMessages.map(agentMessageFromRow)); setRegistryBriefs(loadedRegistryBriefs.map((item) => ({ id: item.id, topicId: item.topic_id, topicLabel: item.topic_label, answer: item.answer, unknowns: JSON.parse(item.unknowns_json || '[]') as string[], citations: JSON.parse(item.citations_json) as AgentCitation[], sourceSignature: item.source_signature, runId: item.run_id, createdAt: item.created_at, supersedesBriefId: item.supersedes_brief_id ?? undefined }))); setFeedItems(loadedFeed.map((item) => ({ id: item.id, title: item.title, detail: item.detail, url: item.url, publisher: item.publisher, topic: item.topic, retrievedAt: item.retrieved_at, saved: item.saved === 1, dismissed: item.dismissed === 1 }))); setReady(true); }
      } catch (error) { if (active) { setStorageError(error instanceof Error ? error.message : 'Private local storage could not be opened.'); setReady(true); } }
    })();
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (Platform.OS !== 'web' || !ready || !browserWritesAllowed.current || typeof window === 'undefined') return;
    const snapshot: BrowserDemoSnapshot = { version: 1, demoOnly: true, name, birthday, country, email, phone, topics, assets, intakeNotes, facts, treatments, treatmentEvents, visits, visitEvents, links, policyReplacements, feedItems, savedQuestions, agentMessages, registryBriefs };
    try { writeBrowserDemoSnapshot(window.localStorage, WEB_DEMO_KEY, snapshot); }
    catch { browserWritesAllowed.current = false; queueMicrotask(() => setStorageError('The browser could not save this synthetic workspace. Changes may not survive a refresh.')); }
  }, [ready, name, birthday, country, email, phone, topics, assets, intakeNotes, facts, treatments, treatmentEvents, visits, visitEvents, links, policyReplacements, feedItems, savedQuestions, agentMessages, registryBriefs]);
  const updateProfile = useCallback((patch: Partial<Pick<NuraState, 'name' | 'birthday' | 'country' | 'email' | 'phone'>>) => {
    const next = { name, birthday, country, email, phone, ...patch };
    setName(next.name); setBirthday(next.birthday); setCountry(next.country); setEmail(next.email); setPhone(next.phone);
    if (Platform.OS !== 'web') void enqueueProfileWrite(getDatabase().then((db) => db.runAsync('UPDATE profile SET name=?,birthday=?,country=?,email=?,phone=? WHERE id=1', next.name, next.birthday, next.country, next.email, next.phone)));
  }, [name, birthday, country, email, phone, enqueueProfileWrite]);
  const commitProfileSetup = useCallback(async () => {
    if (Platform.OS === 'web') return;
    await drainProfileWrites();
    const recoveredProfileWriteError = profileWriteFailures.current.some((message) => message === storageError);
    try {
      const db = await getDatabase();
      await persistProfileSetup(db, { profile: { name, birthday, country, email, phone }, topics, facts, explicitlyRemovedTopicIds: [...explicitlyRemovedTopics.current] });
      explicitlyRemovedTopics.current.clear();
      profileWriteFailures.current.splice(0);
      if (recoveredProfileWriteError) setStorageError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The profile could not be saved on this device.';
      setStorageError(message);
      throw new Error(message);
    }
  }, [birthday, country, drainProfileWrites, email, facts, name, phone, storageError, topics]);
  const toggleTopic = useCallback((topic: HealthTopic) => {
    setTopics((current) => { const exists = current.some((item) => item.id === topic.id); const next = exists ? current.filter((item) => item.id !== topic.id) : [...current, topic]; if (exists) explicitlyRemovedTopics.current.add(topic.id); else explicitlyRemovedTopics.current.delete(topic.id); if (Platform.OS !== 'web') void enqueueProfileWrite(getDatabase().then(async (db) => { if (exists) { await db.runAsync('DELETE FROM topics WHERE id=?', topic.id); await db.runAsync('DELETE FROM health_links WHERE from_id=? OR to_id=?', `topic:${topic.id}`, `topic:${topic.id}`); } else await db.runAsync('INSERT OR IGNORE INTO topics (id,label) VALUES (?,?)', topic.id, topic.label); })); if (exists) setLinks((currentLinks) => currentLinks.filter((link) => link.from !== `topic:${topic.id}` && link.to !== `topic:${topic.id}`)); return next; });
  }, [enqueueProfileWrite]);
  const addFact = useCallback((label: string, value: string, metadata: AddFactMetadata = {}) => {
    const cleanLabel = label.trim(); const cleanValue = value.trim(); if (!cleanLabel || !cleanValue) return;
    const now = new Date().toISOString();
    const factDate = metadata.validFrom && Number.isFinite(Date.parse(metadata.validFrom)) ? metadata.validFrom : now;
    const fact: HealthFact = { id: newId(), label: cleanLabel, value: cleanValue, date: factDate, category: metadata.category ?? 'Self-reported', source: metadata.source ?? 'Entered by you', status: 'reviewed', note: metadata.note, sourceRunId: metadata.sourceRunId, sourceId: metadata.sourceId, sourceClaimId: metadata.sourceClaimId, supersedesId: metadata.supersedesId, reviewState: metadata.reviewState ?? 'user_confirmed', validFrom: metadata.validFrom ?? now, validUntil: metadata.validUntil ?? null, confidence: metadata.confidence ?? null, permissionScope: metadata.permissionScope ?? (metadata.sourceRunId ? 'profile_memory_write' : 'profile_write') };
    setFacts((current) => [fact, ...current]);
    if (Platform.OS !== 'web') void enqueueProfileWrite(getDatabase().then(async (db) => {
      await db.withTransactionAsync(async () => {
        await db.runAsync('INSERT INTO health_facts (id,label,value,date,category,source,status,note) VALUES (?,?,?,?,?,?,?,?)', fact.id, fact.label, fact.value, fact.date, fact.category, fact.source, fact.status, fact.note ?? null);
        await db.runAsync('INSERT INTO memory_provenance (fact_id,source_run_id,review_state,valid_from,valid_until,confidence,permission_scope,source_id,source_claim_id,supersedes_fact_id) VALUES (?,?,?,?,?,?,?,?,?,?)', fact.id, metadata.sourceRunId ?? null, metadata.reviewState ?? 'user_confirmed', metadata.validFrom ?? now, metadata.validUntil ?? null, metadata.confidence ?? null, metadata.permissionScope ?? (metadata.sourceRunId ? 'profile_memory_write' : 'profile_write'), metadata.sourceId ?? null, metadata.sourceClaimId ?? null, metadata.supersedesId ?? null);
      });
    }));
  }, [enqueueProfileWrite]);
  const reconcileSourceFactDate = useCallback((factId: string, sourceId: string, sourceClaimId: string, effectiveAt: string) => {
    if (!Number.isFinite(Date.parse(effectiveAt))) return false;
    const current = facts.find((fact) => fact.id === factId);
    if (!current || current.sourceId !== sourceId || current.sourceClaimId !== sourceClaimId || current.validUntil) return false;
    const currentDay = Date.parse(current.date);
    const sourceDay = Date.parse(effectiveAt);
    if (Number.isFinite(currentDay) && new Date(currentDay).toISOString().slice(0, 10) === new Date(sourceDay).toISOString().slice(0, 10)) return false;
    const corrected = { ...current, date: effectiveAt };
    setFacts((items) => items.map((fact) => fact.id === factId ? corrected : fact));
    if (Platform.OS !== 'web') void enqueueProfileWrite(getDatabase().then(async (db) => {
      await db.withTransactionAsync(async () => {
        await db.runAsync('UPDATE health_facts SET date=? WHERE id=?', effectiveAt, factId);
        await db.runAsync('UPDATE memory_provenance SET valid_from=? WHERE fact_id=? AND source_id=? AND source_claim_id=?', effectiveAt, factId, sourceId, sourceClaimId);
      });
    }));
    return true;
  }, [facts, enqueueProfileWrite]);
  const reconcileSourceFactValue = useCallback(async (factId: string, sourceId: string, sourceClaimId: string, expectedValue: string, normalizedValue: string): Promise<boolean> => {
    const current = facts.find((fact) => fact.id === factId);
    const normalized = canonicalSourceFactValue(current, { factId, sourceId, sourceClaimId, expectedValue, normalizedValue });
    if (!current || !normalized) return false;
    if (Platform.OS !== 'web') await enqueueProfileWrite(getDatabase().then(async (db) => {
      await db.withTransactionAsync(async () => {
        const result = await db.runAsync(
          'UPDATE health_facts SET value=? WHERE id=? AND value=? AND EXISTS (SELECT 1 FROM memory_provenance m WHERE m.fact_id=health_facts.id AND m.source_id=? AND m.source_claim_id=? AND m.valid_until IS NULL)',
          normalized.value, factId, expectedValue, sourceId, sourceClaimId,
        );
        if (result.changes !== 1) throw new Error('This saved detail changed on this device. Reload its source before reconciling it.');
      });
    }));
    setFacts((items) => items.map((fact) => fact.id === factId && fact.sourceId === sourceId && fact.sourceClaimId === sourceClaimId && fact.value === expectedValue && !fact.validUntil ? normalized : fact));
    return true;
  }, [facts, enqueueProfileWrite]);
  const correctFact = useCallback(async (id: string, label: string, value: string): Promise<HealthFact | null> => {
    const original = facts.find((fact) => fact.id === id);
    const cleanLabel = label.trim(); const cleanValue = value.trim();
    if (!original || !cleanValue) return null;
    const now = new Date().toISOString();
    const prior: HealthFact = { ...original, validUntil: now, note: [original.note, `Superseded by your correction on ${new Date(now).toLocaleDateString()}.`].filter(Boolean).join(' ') };
    const corrected: HealthFact = { id: newId(), label: cleanLabel || original.label, value: cleanValue, date: now, category: original.category, source: original.source, status: 'reviewed', note: [`Corrected by you on ${new Date(now).toLocaleDateString()}. The original source remains attached.`, original.note].filter(Boolean).join(' · '), sourceId: original.sourceId, sourceClaimId: original.sourceClaimId, reviewState: 'user_confirmed', validFrom: now, validUntil: null, confidence: null, permissionScope: 'profile_write', supersedesId: original.id };
    if (Platform.OS !== 'web') await enqueueProfileWrite(getDatabase().then(async (db) => {
      await db.withTransactionAsync(async () => {
        await db.runAsync('UPDATE memory_provenance SET valid_until=? WHERE fact_id=?', now, id);
        await db.runAsync('INSERT INTO health_facts (id,label,value,date,category,source,status,note) VALUES (?,?,?,?,?,?,?,?)', corrected.id, corrected.label, corrected.value, corrected.date, corrected.category, corrected.source, corrected.status, corrected.note ?? null);
        await db.runAsync('INSERT INTO memory_provenance (fact_id,source_run_id,review_state,valid_from,valid_until,confidence,permission_scope,source_id,source_claim_id,supersedes_fact_id) VALUES (?,?,?,?,?,?,?,?,?,?)', corrected.id, null, 'user_confirmed', now, null, null, 'profile_write', original.sourceId ?? null, original.sourceClaimId ?? null, id);
      });
    }));
    setFacts((current) => [corrected, ...current.map((fact) => fact.id === id ? prior : fact)]);
    return corrected;
  }, [facts, enqueueProfileWrite]);
  const retractFact = useCallback(async (id: string, retractedAt: string): Promise<boolean> => {
    const original = facts.find((fact) => fact.id === id && !fact.validUntil);
    if (!original || !Number.isFinite(Date.parse(retractedAt))) return false;
    const retracted: HealthFact = {
      ...original,
      reviewState: 'user_retracted',
      validUntil: retractedAt,
      note: [original.note, `Removed from the active profile by you on ${new Date(retractedAt).toLocaleDateString()}. The source and review history remain attached.`].filter(Boolean).join(' · '),
    };
    if (Platform.OS !== 'web') await enqueueProfileWrite(getDatabase().then(async (db) => {
      await db.withTransactionAsync(async () => {
        const result = await db.runAsync('UPDATE memory_provenance SET review_state=?,valid_until=? WHERE fact_id=? AND valid_until IS NULL', 'user_retracted', retractedAt, id);
        if (result.changes !== 1) throw new Error('This detail changed on this device. Reload the source review before removing it.');
        await db.runAsync('UPDATE health_facts SET note=? WHERE id=?', retracted.note ?? null, id);
      });
    }));
    setFacts((current) => current.map((fact) => fact.id === id ? retracted : fact));
    return true;
  }, [facts, enqueueProfileWrite]);
  const removeFact = useCallback((id: string) => { setFacts((current) => current.filter((fact) => fact.id !== id)); setLinks((current) => current.filter((link) => link.from !== `fact:${id}` && link.to !== `fact:${id}`)); if (Platform.OS !== 'web') void getDatabase().then(async (db) => { await db.runAsync('DELETE FROM health_facts WHERE id=?', id); await db.runAsync('DELETE FROM memory_provenance WHERE fact_id=?', id); await db.runAsync('DELETE FROM health_links WHERE from_id=? OR to_id=?', `fact:${id}`, `fact:${id}`); }).catch((e) => setStorageError(String(e))); }, []);
  const writeTreatmentEvent = useCallback(async (db: SQLite.SQLiteDatabase, event: TreatmentEvent) => {
    await db.runAsync('INSERT INTO treatment_events (id,treatment_id,kind,summary,snapshot_json,occurred_at) VALUES (?,?,?,?,?,?)', event.id, event.treatmentId, event.kind, event.summary, JSON.stringify(event.snapshot), event.occurredAt);
  }, []);
  const addTreatment = useCallback((input: TreatmentInput) => {
    const name = input.name.trim(); if (!name) return null;
    const now = new Date().toISOString();
    const treatment: TreatmentRecord = { ...input, id: newId(), name, dose: input.dose.trim(), schedule: input.schedule.trim(), purpose: input.purpose.trim(), prescriber: input.prescriber.trim(), careLocation: input.careLocation.trim(), pharmacy: input.pharmacy.trim(), source: input.source.trim() || 'Entered by you', startedOn: input.startedOn.trim(), createdAt: now, updatedAt: now };
    const event: TreatmentEvent = { id: newId(), treatmentId: treatment.id, kind: 'added', summary: 'Treatment details added', snapshot: treatment, occurredAt: now };
    setTreatments((current) => [treatment, ...current]); setTreatmentEvents((current) => [event, ...current]);
    if (Platform.OS !== 'web') void getDatabase().then(async (db) => db.withTransactionAsync(async () => {
      await db.runAsync('INSERT INTO treatments (id,name,dose,schedule,purpose,prescriber,care_location,pharmacy,status,started_on,ended_on,source,source_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', treatment.id, treatment.name, treatment.dose, treatment.schedule, treatment.purpose, treatment.prescriber, treatment.careLocation, treatment.pharmacy, treatment.status, treatment.startedOn, treatment.endedOn ?? null, treatment.source, treatment.sourceId ?? null, treatment.createdAt, treatment.updatedAt);
      await writeTreatmentEvent(db, event);
    })).catch((error) => setStorageError(error instanceof Error ? error.message : 'Treatment details could not be saved.'));
    return treatment;
  }, [writeTreatmentEvent]);
  const updateTreatment = useCallback((id: string, patch: Partial<TreatmentInput>) => {
    const previous = treatments.find((item) => item.id === id); if (!previous) return null;
    const now = new Date().toISOString();
    const treatment: TreatmentRecord = { ...previous, ...patch, id, name: (patch.name ?? previous.name).trim(), dose: (patch.dose ?? previous.dose).trim(), schedule: (patch.schedule ?? previous.schedule).trim(), purpose: (patch.purpose ?? previous.purpose).trim(), prescriber: (patch.prescriber ?? previous.prescriber).trim(), careLocation: (patch.careLocation ?? previous.careLocation).trim(), pharmacy: (patch.pharmacy ?? previous.pharmacy).trim(), source: (patch.source ?? previous.source).trim() || 'Entered by you', startedOn: (patch.startedOn ?? previous.startedOn).trim(), updatedAt: now };
    if (!treatment.name) return null;
    const event: TreatmentEvent = { id: newId(), treatmentId: id, kind: 'details_updated', summary: 'Treatment details updated; previous details remain in the history.', snapshot: treatment, occurredAt: now };
    setTreatments((current) => current.map((item) => item.id === id ? treatment : item)); setTreatmentEvents((current) => [event, ...current]);
    if (Platform.OS !== 'web') void getDatabase().then(async (db) => db.withTransactionAsync(async () => {
      await db.runAsync('UPDATE treatments SET name=?,dose=?,schedule=?,purpose=?,prescriber=?,care_location=?,pharmacy=?,status=?,started_on=?,ended_on=?,source=?,source_id=?,updated_at=? WHERE id=?', treatment.name, treatment.dose, treatment.schedule, treatment.purpose, treatment.prescriber, treatment.careLocation, treatment.pharmacy, treatment.status, treatment.startedOn, treatment.endedOn ?? null, treatment.source, treatment.sourceId ?? null, treatment.updatedAt, id);
      await writeTreatmentEvent(db, event);
    })).catch((error) => setStorageError(error instanceof Error ? error.message : 'The treatment update could not be saved.'));
    return treatment;
  }, [treatments, writeTreatmentEvent]);
  const markTreatmentPast = useCallback((id: string, endedOn = new Date().toISOString().slice(0, 10)) => {
    const previous = treatments.find((item) => item.id === id); if (!previous || previous.status === 'past') return previous ?? null;
    const now = new Date().toISOString(); const treatment: TreatmentRecord = { ...previous, status: 'past', endedOn, updatedAt: now };
    const event: TreatmentEvent = { id: newId(), treatmentId: id, kind: 'marked_past', summary: `Marked as past on ${endedOn}. This changes your record only; it is not medication advice.`, snapshot: treatment, occurredAt: now };
    setTreatments((current) => current.map((item) => item.id === id ? treatment : item)); setTreatmentEvents((current) => [event, ...current]);
    if (Platform.OS !== 'web') void getDatabase().then(async (db) => db.withTransactionAsync(async () => {
      await db.runAsync('UPDATE treatments SET status=?,ended_on=?,updated_at=? WHERE id=?', treatment.status, treatment.endedOn ?? null, treatment.updatedAt, id);
      await writeTreatmentEvent(db, event);
    })).catch((error) => setStorageError(error instanceof Error ? error.message : 'The treatment status could not be updated.'));
    return treatment;
  }, [treatments, writeTreatmentEvent]);
  const writeVisitEvent = useCallback(async (db: SQLite.SQLiteDatabase, event: VisitEvent) => {
    await db.runAsync('INSERT INTO care_visit_events (id,visit_id,kind,summary,snapshot_json,occurred_at) VALUES (?,?,?,?,?,?)', event.id, event.visitId, event.kind, event.summary, JSON.stringify(event.snapshot), event.occurredAt);
  }, []);
  const addVisit = useCallback((input: VisitInput) => {
    if (!input.purpose.trim() && !input.clinician.trim() && !input.location.trim()) return null;
    const now = new Date().toISOString();
    const visit: HealthVisit = { ...input, id: newId(), purpose: input.purpose.trim(), clinician: input.clinician.trim(), location: input.location.trim(), appointmentAt: input.appointmentAt.trim(), source: input.source.trim() || 'Added by you', briefFactIds: [...input.briefFactIds], briefAssetIds: [...input.briefAssetIds], briefTreatmentIds: [...input.briefTreatmentIds], questions: [...input.questions], outcome: input.outcome.trim(), followUp: input.followUp.trim(), followUpActions: [...(input.followUpActions ?? [])], outcomeSourceAssetIds: [...input.outcomeSourceAssetIds], createdAt: now, updatedAt: now };
    const event: VisitEvent = { id: newId(), visitId: visit.id, kind: 'created', summary: 'Visit added to your care history.', snapshot: visit, occurredAt: now };
    setVisits((current) => [visit, ...current]); setVisitEvents((current) => [event, ...current]);
    if (Platform.OS !== 'web') void getDatabase().then(async (db) => db.withTransactionAsync(async () => {
      await db.runAsync('INSERT INTO care_visits (id,appointment_at,status,visit_json,updated_at) VALUES (?,?,?,?,?)', visit.id, visit.appointmentAt, visit.status, JSON.stringify(visit), visit.updatedAt);
      await writeVisitEvent(db, event);
    })).catch((error) => setStorageError(error instanceof Error ? error.message : 'The visit could not be saved.'));
    return visit;
  }, [writeVisitEvent]);
  const updateVisit = useCallback((id: string, patch: Partial<VisitInput>) => {
    const previous = visits.find((item) => item.id === id); if (!previous) return null;
    const now = new Date().toISOString();
    const visit: HealthVisit = { ...previous, ...patch, id, updatedAt: now, appointmentAt: (patch.appointmentAt ?? previous.appointmentAt).trim(), purpose: (patch.purpose ?? previous.purpose).trim(), clinician: (patch.clinician ?? previous.clinician).trim(), location: (patch.location ?? previous.location).trim(), source: (patch.source ?? previous.source).trim() || 'Added by you', briefFactIds: [...(patch.briefFactIds ?? previous.briefFactIds)], briefAssetIds: [...(patch.briefAssetIds ?? previous.briefAssetIds)], briefTreatmentIds: [...(patch.briefTreatmentIds ?? previous.briefTreatmentIds)], questions: [...(patch.questions ?? previous.questions)], outcome: (patch.outcome ?? previous.outcome).trim(), followUp: (patch.followUp ?? previous.followUp).trim(), followUpActions: [...(patch.followUpActions ?? previous.followUpActions ?? [])], outcomeSourceAssetIds: [...(patch.outcomeSourceAssetIds ?? previous.outcomeSourceAssetIds)] };
    const kind: VisitEvent['kind'] = ['briefFactIds', 'briefAssetIds', 'briefTreatmentIds', 'questions'].some((key) => key in patch) ? 'brief_saved' : ('followUpActions' in patch) ? 'follow_up_updated' : ('outcome' in patch || 'followUp' in patch || 'outcomeSourceAssetIds' in patch || 'status' in patch) ? 'outcome_saved' : 'details_updated';
    const summary = kind === 'brief_saved' ? 'Visit brief selection updated.' : kind === 'follow_up_updated' ? 'Follow-up action updated by you.' : kind === 'outcome_saved' ? 'Visit outcome or follow-up updated by you.' : 'Visit details updated.';
    const event: VisitEvent = { id: newId(), visitId: id, kind, summary, snapshot: visit, occurredAt: now };
    setVisits((current) => current.map((item) => item.id === id ? visit : item)); setVisitEvents((current) => [event, ...current]);
    if (Platform.OS !== 'web') void getDatabase().then(async (db) => db.withTransactionAsync(async () => {
      await db.runAsync('UPDATE care_visits SET appointment_at=?,status=?,visit_json=?,updated_at=? WHERE id=?', visit.appointmentAt, visit.status, JSON.stringify(visit), visit.updatedAt, id);
      await writeVisitEvent(db, event);
    })).catch((error) => setStorageError(error instanceof Error ? error.message : 'The visit update could not be saved.'));
    return visit;
  }, [visits, writeVisitEvent]);
  const addAssets = useCallback(async (incoming: Omit<IntakeAsset, 'addedAt'>[]) => {
    const db = Platform.OS === 'web' ? null : await getDatabase(); FILES?.create({ idempotent: true, intermediates: true });
    const existing = db ? await db.getAllAsync<{ name: string; size: number | null }>('SELECT name,size FROM assets') : assets;
    const seen = new Set(existing.map((a) => `${a.name.toLowerCase()}|${a.size ?? 0}`)); const additions: IntakeAsset[] = [];
    const savedBrowserIds: string[] = [];
    try {
      for (const asset of incoming) {
        const possibleRepeat = seen.has(`${asset.name.toLowerCase()}|${asset.size ?? 0}`);
        const id = newId(); const extension = asset.name.includes('.') ? `.${asset.name.split('.').pop()}` : '';
        const destination = FILES ? new File(FILES, `${id}${extension}`) : null;
        if (destination) new File(asset.uri).copy(destination);
        let storedUri = destination?.uri ?? asset.uri;
        if (!db) {
          const response = await fetch(asset.uri);
          if (!response.ok) throw new Error(`Could not keep ${asset.name} in this browser. Choose it again.`);
          await saveBrowserAsset(id, await response.blob());
          savedBrowserIds.push(id);
          storedUri = browserAssetUri(id);
        }
        const addedAt = new Date().toISOString();
        const saved = { ...asset, id, uri: storedUri, addedAt, possibleRepeat };
        if (db) await db.runAsync('INSERT INTO assets (id,name,kind,uri,size,mime_type,added_at,purpose,server_source_id) VALUES (?,?,?,?,?,?,?,?,?)', id, asset.name, asset.kind, storedUri, asset.size ?? null, asset.mimeType ?? null, addedAt, asset.purpose ?? 'medical', asset.serverSourceId ?? null);
        additions.push(saved); seen.add(`${asset.name.toLowerCase()}|${asset.size ?? 0}`);
      }
    } catch (error) {
      await Promise.allSettled(savedBrowserIds.map((id) => deleteBrowserAsset(id)));
      throw error;
    }
    setAssets((current) => [...additions, ...current]);
  }, [assets]);
  const saveIntakeNote = useCallback(async (input: { id?: string; text: string; topicId?: string; topicLabel?: string }) => {
    const text = input.text.trim();
    if (!text) throw new Error('Write a short description before saving it for review.');
    if (text.length > 2000) throw new Error('Keep your description under 2,000 characters.');
    const previous = input.id ? intakeNotes.find((note) => note.id === input.id) : undefined;
    const note: HealthIntakeNote = { id: previous?.id ?? input.id ?? newId(), text, topicId: input.topicId?.trim() || undefined, topicLabel: input.topicLabel?.trim() || undefined, createdAt: previous?.createdAt ?? new Date().toISOString() };
    if (Platform.OS !== 'web') {
      try {
        const db = await getDatabase();
        await db.runAsync('INSERT INTO health_intake_notes (id,text,topic_id,topic_label,created_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET text=excluded.text,topic_id=excluded.topic_id,topic_label=excluded.topic_label', note.id, note.text, note.topicId ?? null, note.topicLabel ?? null, note.createdAt);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Your note could not be saved on this device.';
        setStorageError(message);
        throw new Error('Your note could not be saved. Keep it open and try again.');
      }
    }
    setIntakeNotes((current) => [note, ...current.filter((item) => item.id !== note.id)]);
    return note;
  }, [intakeNotes]);
  const commitIntakeNote = useCallback(async (id: string, editedText?: string) => {
    if (committingIntakeNotes.current.has(id)) throw new Error('This note is already being saved.');
    const pending = intakeNotes.find((note) => note.id === id);
    const value = (editedText ?? pending?.text ?? '').trim();
    if (!pending || !value) throw new Error('This note is no longer available. Reopen the intake and try again.');
    committingIntakeNotes.current.add(id);
    const now = new Date().toISOString();
    const fact: HealthFact = { id: newId(), label: pending.topicLabel ? `${pending.topicLabel} · your note` : 'Your health note', value, date: now, category: pending.topicLabel ?? 'Self-reported', source: 'Written by you', status: 'reviewed', note: 'Saved in your own words. The timeline date is when you added this note; an event date was not provided. This is not an AI interpretation or diagnosis.', reviewState: 'user_confirmed', validFrom: now, validUntil: null, confidence: null, permissionScope: 'profile_write' };
    try {
      if (Platform.OS !== 'web') {
        const db = await getDatabase();
        await db.withTransactionAsync(async () => {
          const removed = await db.runAsync('DELETE FROM health_intake_notes WHERE id=?', id);
          if (removed.changes !== 1) throw new Error('This note was already saved or removed.');
          await db.runAsync('INSERT INTO health_facts (id,label,value,date,category,source,status,note) VALUES (?,?,?,?,?,?,?,?)', fact.id, fact.label, fact.value, fact.date, fact.category, fact.source, fact.status, fact.note ?? null);
          await db.runAsync('INSERT INTO memory_provenance (fact_id,source_run_id,review_state,valid_from,valid_until,confidence,permission_scope,source_id,source_claim_id,supersedes_fact_id) VALUES (?,?,?,?,?,?,?,?,?,?)', fact.id, null, 'user_confirmed', now, null, null, 'profile_write', null, null, null);
        });
      }
      setFacts((current) => [fact, ...current]);
      setIntakeNotes((current) => current.filter((note) => note.id !== id));
      return fact;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The reviewed note could not be saved on this device.';
      if (Platform.OS !== 'web') setStorageError(message);
      throw new Error('The note is still in review. Try saving it again.');
    } finally {
      committingIntakeNotes.current.delete(id);
    }
  }, [intakeNotes]);
  const removeIntakeNote = useCallback(async (id: string) => {
    if (Platform.OS !== 'web') {
      try { await getDatabase().then((db) => db.runAsync('DELETE FROM health_intake_notes WHERE id=?', id)); }
      catch (error) { setStorageError(error instanceof Error ? error.message : 'The draft note could not be removed.'); throw new Error('The draft note could not be removed. Try again.'); }
    }
    setIntakeNotes((current) => current.filter((note) => note.id !== id));
  }, []);
  const attachSourceToAsset = useCallback((assetId: string, sourceId: string | null) => {
    setAssets((current) => current.map((asset) => asset.id === assetId ? { ...asset, serverSourceId: sourceId ?? undefined } : asset));
    if (Platform.OS !== 'web') void getDatabase().then((db) => db.runAsync('UPDATE assets SET server_source_id=? WHERE id=?', sourceId, assetId)).catch((error) => setStorageError(String(error)));
  }, []);
  const addLink = useCallback((from: string, to: string, label: string, relationType: HealthLinkRelation = 'user_note') => {
    const cleanLabel = label.trim();
    if (!from || !to || from === to || !cleanLabel) return null;
    const duplicate = links.find((link) => ((link.from === from && link.to === to) || (link.from === to && link.to === from)) && link.relationType === relationType && link.label.toLocaleLowerCase() === cleanLabel.toLocaleLowerCase());
    if (duplicate) return duplicate;
    const link: HealthLink = { id: newId(), from, to, relationType, label: cleanLabel, createdAt: new Date().toISOString() };
    setLinks((current) => [link, ...current]);
    if (Platform.OS !== 'web') void getDatabase().then((db) => db.runAsync('INSERT INTO health_links (id,from_id,to_id,label,relation_type,created_at) VALUES (?,?,?,?,?,?)', link.id, link.from, link.to, link.label, link.relationType, link.createdAt)).catch((e) => setStorageError(String(e)));
    return link;
  }, [links]);
  const removeLink = useCallback((id: string) => { setLinks((current) => current.filter((link) => link.id !== id)); if (Platform.OS !== 'web') void getDatabase().then((db) => db.runAsync('DELETE FROM health_links WHERE id=?', id)).catch((e) => setStorageError(String(e))); }, []);
  const addPolicyReplacement = useCallback(async (newerSourceId: string, olderSourceId: string) => {
    const policySources = assets.filter((asset) => asset.purpose === 'insurance' && asset.serverSourceId).map((asset) => ({ sourceId: asset.serverSourceId as string }));
    const validation = validatePolicyReplacement(newerSourceId, olderSourceId, policySources, policyReplacements);
    if (!validation.ok) return null;
    const link: PolicyReplacement = { id: newId(), newerSourceId, olderSourceId, createdAt: new Date().toISOString() };
    if (Platform.OS !== 'web') {
      try {
        const db = await getDatabase();
        await db.runAsync('INSERT INTO policy_replacements (id,newer_source_id,older_source_id,created_at) VALUES (?,?,?,?)', link.id, link.newerSourceId, link.olderSourceId, link.createdAt);
      } catch (error) {
        setStorageError(error instanceof Error ? error.message : 'The policy document link could not be saved.');
        return null;
      }
    }
    setPolicyReplacements((current) => [link, ...current]);
    return link;
  }, [assets, policyReplacements]);
  const removePolicyReplacement = useCallback(async (id: string) => {
    if (!policyReplacements.some((link) => link.id === id)) return;
    if (Platform.OS !== 'web') {
      try {
        const db = await getDatabase();
        await db.runAsync('DELETE FROM policy_replacements WHERE id=?', id);
      } catch (error) {
        setStorageError(error instanceof Error ? error.message : 'The policy document link could not be removed.');
        throw error;
      }
    }
    setPolicyReplacements((current) => current.filter((link) => link.id !== id));
  }, [policyReplacements]);
  const addQuestion = useCallback((question: string) => { const cleaned = question.trim(); if (!cleaned) return; setSavedQuestions((current) => current.includes(cleaned) ? current : [cleaned, ...current]); if (Platform.OS !== 'web') void getDatabase().then((db) => db.runAsync('INSERT OR IGNORE INTO questions (question,added_at) VALUES (?,?)', cleaned, new Date().toISOString())).catch((e) => setStorageError(String(e))); }, []);
  const addAgentMessage = useCallback((message: Omit<AgentMessage, 'id' | 'createdAt'>) => { const saved: AgentMessage = { ...message, id: newId(), createdAt: new Date().toISOString() }; setAgentMessages((current) => [...current, saved]); if (Platform.OS !== 'web') void getDatabase().then((db) => db.runAsync('INSERT INTO agent_messages (id,run_id,role,text,citations_json,trace_json,created_at,answer_metadata_json) VALUES (?,?,?,?,?,?,?,?)', saved.id, saved.runId, saved.role, saved.text, JSON.stringify(saved.citations), JSON.stringify(saved.trace), saved.createdAt, JSON.stringify({ coverageAssessments: saved.coverageAssessments ?? [], profileSummary: saved.profileSummary }))).catch((e) => setStorageError(String(e))); return saved; }, []);
  const saveRegistryBrief = useCallback(async (input: RegistryBriefInput) => {
    const topicId = input.topicId.trim(); const topicLabel = input.topicLabel.trim(); const answer = input.answer.trim();
    const citations = input.citations.filter((citation) => citation.reference && citation.id && citation.title).slice(0, 24);
    if (!topicId || !topicLabel || !answer || !input.runId || !/^[a-f0-9]{64}$/i.test(input.sourceSignature) || citations.length === 0) throw new Error('A registry brief needs a topic, a completed answer, and at least one cited source.');
    const previous = registryBriefs.filter((brief) => brief.topicId === topicId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    let brief: RegistryBrief = { ...input, id: newId(), topicId, topicLabel, answer, citations, createdAt: new Date().toISOString(), supersedesBriefId: Platform.OS === 'web' ? previous?.id : undefined };
    if (Platform.OS !== 'web') {
      try { const db = await getDatabase(); brief = await appendRegistryBrief(db, brief) as RegistryBrief; }
      catch (error) { const message = error instanceof Error ? error.message : 'The Medical Registry summary could not be saved.'; setStorageError(message); throw new Error('Nura could not save this registry brief on this device. Your answer is still in Ask Nura.'); }
    }
    setRegistryBriefs((current) => [brief, ...current]);
    return brief;
  }, [registryBriefs]);
  const clearAgentMessages = useCallback(() => { setAgentMessages([]); if (Platform.OS !== 'web') void getDatabase().then((db) => db.runAsync('DELETE FROM agent_messages')).catch((e) => setStorageError(String(e))); }, []);
  const clearAllLocalData = useCallback(async () => {
    let fileCleanupFailed = false;
    if (Platform.OS === 'web') {
      try { if (typeof window !== 'undefined') writeBrowserDemoSnapshot(window.localStorage, WEB_DEMO_KEY, emptyDemoSnapshot()); }
      catch { throw new Error('Nura could not clear the saved browser workspace. Try again.'); }
      try { await clearBrowserAssets(); } catch { fileCleanupFailed = true; }
    } else {
      const db = await getDatabase();
      await db.withTransactionAsync(async () => {
        await db.runAsync('DELETE FROM topics');
        await db.runAsync('DELETE FROM health_facts');
        await db.runAsync('DELETE FROM memory_provenance');
        await db.runAsync('DELETE FROM treatments');
        await db.runAsync('DELETE FROM treatment_events');
        await db.runAsync('DELETE FROM care_visits');
        await db.runAsync('DELETE FROM care_visit_events');
        await db.runAsync('DELETE FROM assets');
        await db.runAsync('DELETE FROM health_intake_notes');
        await db.runAsync('DELETE FROM health_links');
        await db.runAsync('DELETE FROM policy_replacements');
        await db.runAsync('DELETE FROM agent_messages');
        await db.runAsync('DELETE FROM registry_briefs');
        await db.runAsync('DELETE FROM questions');
        await db.runAsync('DELETE FROM health_feed');
        await db.runAsync("UPDATE profile SET name='',birthday='',country='',email='',phone='' WHERE id=1");
      });
    }
    if (FILES?.exists) {
      try { FILES.delete(); } catch { fileCleanupFailed = true; }
    }
    setName(''); setBirthday(''); setCountry(''); setEmail(''); setPhone('');
    setTopics([]); setAssets([]); setIntakeNotes([]); setFacts([]); setTreatments([]); setTreatmentEvents([]); setVisits([]); setVisitEvents([]); setLinks([]); setPolicyReplacements([]); setFeedItems([]); setSavedQuestions([]); setAgentMessages([]); setRegistryBriefs([]); setStorageError(null);
    return { fileCleanupFailed };
  }, []);
  const mergeFeedItems = useCallback((incoming: Omit<HealthFeedItem, 'saved' | 'dismissed'>[]) => {
    setFeedItems((current) => {
      const existing = new Map(current.map((item) => [item.id, item]));
      const next = incoming.map((item) => { const prior = existing.get(item.id); return { ...item, saved: prior?.saved ?? false, dismissed: prior?.dismissed ?? false }; });
      for (const item of current) if (item.saved && !next.some((candidate) => candidate.id === item.id)) next.push(item);
      return next;
    });
    if (Platform.OS !== 'web') void getDatabase().then(async (db) => db.withTransactionAsync(async () => {
      for (const item of incoming) await db.runAsync('INSERT INTO health_feed (id,title,detail,url,publisher,topic,retrieved_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,detail=excluded.detail,url=excluded.url,publisher=excluded.publisher,topic=excluded.topic,retrieved_at=excluded.retrieved_at', item.id, item.title, item.detail, item.url, item.publisher, item.topic, item.retrievedAt);
    })).catch((error) => setStorageError(String(error)));
  }, []);
  const setFeedSaved = useCallback((id: string, saved: boolean) => {
    setFeedItems((current) => current.map((item) => item.id === id ? { ...item, saved } : item));
    if (Platform.OS !== 'web') void getDatabase().then((db) => db.runAsync('UPDATE health_feed SET saved=? WHERE id=?', saved ? 1 : 0, id)).catch((error) => setStorageError(String(error)));
  }, []);
  const setFeedDismissed = useCallback((id: string, dismissed: boolean) => {
    setFeedItems((current) => current.map((item) => item.id === id ? { ...item, dismissed } : item));
    if (Platform.OS !== 'web') void getDatabase().then((db) => db.runAsync('UPDATE health_feed SET dismissed=? WHERE id=?', dismissed ? 1 : 0, id)).catch((error) => setStorageError(String(error)));
  }, []);
  const resetDemo = useCallback(() => {
    if (Platform.OS !== 'web') return;
    const snapshot = demoSnapshot();
    try { if (typeof window !== 'undefined') writeBrowserDemoSnapshot(window.localStorage, WEB_DEMO_KEY, snapshot); browserWritesAllowed.current = true; }
    catch { setStorageError('This browser could not reset the demo seed.'); }
    void clearBrowserAssets().catch(() => setStorageError('The demo restarted, but a saved browser file could not be removed.'));
    setName(snapshot.name); setBirthday(snapshot.birthday); setCountry(snapshot.country); setEmail(snapshot.email); setPhone(snapshot.phone);
    setTopics(snapshot.topics); setAssets(snapshot.assets); setIntakeNotes(snapshot.intakeNotes); setFacts(snapshot.facts); setTreatments(snapshot.treatments); setTreatmentEvents(snapshot.treatmentEvents); setVisits(snapshot.visits); setVisitEvents(snapshot.visitEvents); setLinks(snapshot.links); setPolicyReplacements(snapshot.policyReplacements); setFeedItems(snapshot.feedItems); setSavedQuestions(snapshot.savedQuestions); setAgentMessages(snapshot.agentMessages); setRegistryBriefs(snapshot.registryBriefs); setStorageError(null);
  }, []);
  const value = useMemo<NuraState>(() => ({ ready, storageError, name, birthday, country, email, phone, topics, assets, intakeNotes, facts, treatments, treatmentEvents, visits, visitEvents, links, policyReplacements, feedItems, savedQuestions, agentMessages, registryBriefs, saveRegistryBrief, addAgentMessage, clearAgentMessages, clearAllLocalData, updateProfile, commitProfileSetup, toggleTopic, addFact, correctFact, retractFact, reconcileSourceFactDate, reconcileSourceFactValue, removeFact, addAssets, saveIntakeNote, commitIntakeNote, removeIntakeNote, attachSourceToAsset, addTreatment, updateTreatment, markTreatmentPast, addVisit, updateVisit, addLink, removeLink, addPolicyReplacement, removePolicyReplacement, mergeFeedItems, setFeedSaved, setFeedDismissed, addQuestion, resetDemo }), [ready, storageError, name, birthday, country, email, phone, topics, assets, intakeNotes, facts, treatments, treatmentEvents, visits, visitEvents, links, policyReplacements, feedItems, savedQuestions, agentMessages, registryBriefs, saveRegistryBrief, addAgentMessage, clearAgentMessages, clearAllLocalData, updateProfile, commitProfileSetup, toggleTopic, addFact, correctFact, retractFact, reconcileSourceFactDate, reconcileSourceFactValue, removeFact, addAssets, saveIntakeNote, commitIntakeNote, removeIntakeNote, attachSourceToAsset, addTreatment, updateTreatment, markTreatmentPast, addVisit, updateVisit, addLink, removeLink, addPolicyReplacement, removePolicyReplacement, mergeFeedItems, setFeedSaved, setFeedDismissed, addQuestion, resetDemo]);
  return <NuraContext.Provider value={value}>{children}</NuraContext.Provider>;
}
export function useNura() { const state = useContext(NuraContext); if (!state) throw new Error('useNura must be used inside NuraProvider'); return state; }
