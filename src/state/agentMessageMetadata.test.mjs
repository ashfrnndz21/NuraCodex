import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { agentMessageFromRow, persistAgentMessage, readAgentMessageMetadata, writeAgentMessageMetadata } from './agentMessageMetadata.mjs';

function createDatabase(filename) {
  const connection = new DatabaseSync(filename);
  connection.exec(`CREATE TABLE IF NOT EXISTS agent_messages (
    id TEXT PRIMARY KEY, run_id TEXT NOT NULL, role TEXT NOT NULL, text TEXT NOT NULL,
    citations_json TEXT NOT NULL, trace_json TEXT NOT NULL, created_at TEXT NOT NULL,
    answer_metadata_json TEXT NOT NULL DEFAULT '{}'
  )`);
  return {
    runAsync: async (sql, ...params) => connection.prepare(sql).run(...params),
    getAllAsync: async (sql) => connection.prepare(sql).all().map((row) => ({ ...row })),
    close: () => connection.close(),
  };
}

test('native answer metadata round-trips meaning, unknowns, next steps and policy assessments', () => {
  const metadata = {
    meaning: { text: 'General context.', citations: ['P1'] },
    unknowns: ['The report does not include a collection date.'],
    nextSteps: ['Ask the insurer which date applies.'],
    coverageAssessments: [{ kind: 'unclear', policyReference: 'P2', detail: 'Exact term quote', relatedHealthReferences: ['H1'] }],
    profileSummary: { answer: 'One sourced summary.', citations: ['H1'], unknowns: [], nextSteps: [], memoryProposal: null, revision: false },
  };
  assert.deepEqual(readAgentMessageMetadata(writeAgentMessageMetadata(metadata)), metadata);
});

test('older SQLite rows without structured answer metadata remain readable', () => {
  assert.deepEqual(readAgentMessageMetadata('{}'), {});
  assert.deepEqual(readAgentMessageMetadata(''), {});
});

test('answer-only arrays are safely initialized for newly saved user or legacy-shaped messages', () => {
  assert.deepEqual(readAgentMessageMetadata(writeAgentMessageMetadata({})), {
    unknowns: [], nextSteps: [], coverageAssessments: [],
  });
});

test('saved Ask message rows restore after a SQLite close and reopen', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'nura-ask-message-restart-'));
  const filename = join(directory, 'messages.db');
  const saved = {
    id: 'message-synthetic-1', runId: 'run-synthetic-1', role: 'assistant',
    text: 'Your saved report records 118/76 mmHg.',
    citations: [{ reference: 'R1', id: 'source-synthetic-1', title: 'Blood pressure', detail: '118/76 mmHg', date: '2025-02-18', source: 'Synthetic report', status: 'confirmed', kind: 'user_record' }],
    trace: [{ id: 'event-synthetic-1', label: 'Checked the selected report', status: 'complete' }],
    meaning: { text: 'This is general context.', citations: ['P1'] },
    unknowns: ['A later result was not included.'],
    nextSteps: ['Add another dated report if you want a comparison.'],
    coverageAssessments: [],
    profileSummary: undefined,
    createdAt: '2026-09-27T04:00:00.000Z',
  };
  try {
    const firstSession = createDatabase(filename);
    try {
      await persistAgentMessage(firstSession, saved);
    } finally {
      firstSession.close();
    }

    const restartedSession = createDatabase(filename);
    try {
      const [row] = await restartedSession.getAllAsync('SELECT id,run_id,role,text,citations_json,trace_json,created_at,answer_metadata_json FROM agent_messages ORDER BY created_at');
      assert.deepEqual(agentMessageFromRow(row), { ...saved, profileSummary: undefined });
    } finally {
      restartedSession.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('legacy Ask rows remain readable without a separately saved uncertainty list', () => {
  const restored = agentMessageFromRow({
    id: 'message-legacy-1', run_id: 'run-legacy-1', role: 'assistant', text: 'Older answer.',
    citations_json: '[]', trace_json: '[]', created_at: '2025-01-01T00:00:00.000Z', answer_metadata_json: '{}',
  });
  assert.equal(restored.unknowns, undefined);
  assert.equal(restored.nextSteps, undefined);
  assert.deepEqual(restored.citations, []);
  assert.deepEqual(restored.trace, []);
});
