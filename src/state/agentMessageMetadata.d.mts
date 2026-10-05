export type AgentMessageMetadata = {
  readingSource?: {
    title: string;
    publisher?: string;
    topic?: string;
    mediaType?: 'article' | 'video';
    summary?: string;
    url?: string;
  };
  meaning?: { text: string; citations: string[] };
  unknowns?: string[];
  nextSteps?: string[];
  coverageAssessments?: Array<{
    kind: 'explicit_benefit' | 'explicit_limit' | 'explicit_exclusion' | 'unclear';
    policyReference: string;
    detail: string;
    relatedHealthReferences: string[];
  }>;
  profileSummary?: {
    answer: string;
    citations: string[];
    unknowns: string[];
    nextSteps: string[];
    memoryProposal: { label: string; value: string; reason: string } | null;
    revision: boolean;
  };
};

export type AgentMessageRow = {
  id: string;
  conversation_id?: string | null;
  run_id: string;
  role: 'user' | 'assistant';
  text: string;
  citations_json: string;
  trace_json: string;
  created_at: string;
  answer_metadata_json: string;
};

export type PersistableAgentMessage = {
  id: string;
  runId: string;
  role: 'user' | 'assistant';
  conversationId?: string;
  text: string;
  citations: Array<{
    reference: string;
    id: string;
    title: string;
    detail: string;
    date: string;
    source: string;
    status: string;
    kind: string;
    category?: string;
    url?: string;
    publisher?: string;
  }>;
  trace: Array<{ id: string; label: string; status: 'started' | 'complete'; detail?: string }>;
  createdAt: string;
} & AgentMessageMetadata;

export function readAgentMessageMetadata(serialized: string): AgentMessageMetadata;
export function writeAgentMessageMetadata(message: AgentMessageMetadata): string;
export function agentMessageFromRow(row: AgentMessageRow): PersistableAgentMessage;
export function persistAgentMessage(
  database: { runAsync: (sql: string, ...params: Array<string | number | null | boolean | Uint8Array>) => Promise<unknown> },
  message: PersistableAgentMessage,
): Promise<void>;
