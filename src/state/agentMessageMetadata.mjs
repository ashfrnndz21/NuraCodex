/** Keep answer-only structure in one backward-compatible SQLite metadata field. */
export function readAgentMessageMetadata(serialized) {
  const value = JSON.parse(serialized || '{}');
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function writeAgentMessageMetadata(message) {
  return JSON.stringify({
    meaning: message.meaning,
    unknowns: message.unknowns ?? [],
    nextSteps: message.nextSteps ?? [],
    coverageAssessments: message.coverageAssessments ?? [],
    profileSummary: message.profileSummary,
  });
}

export function agentMessageFromRow(row) {
  const metadata = readAgentMessageMetadata(row.answer_metadata_json);
  return {
    id: row.id,
    runId: row.run_id,
    role: row.role,
    text: row.text,
    citations: JSON.parse(row.citations_json) ?? [],
    trace: JSON.parse(row.trace_json) ?? [],
    meaning: metadata.meaning,
    unknowns: metadata.unknowns,
    nextSteps: metadata.nextSteps,
    coverageAssessments: metadata.coverageAssessments,
    profileSummary: metadata.profileSummary,
    createdAt: row.created_at,
  };
}

export async function persistAgentMessage(database, message) {
  await database.runAsync(
    'INSERT INTO agent_messages (id,run_id,role,text,citations_json,trace_json,created_at,answer_metadata_json) VALUES (?,?,?,?,?,?,?,?)',
    message.id,
    message.runId,
    message.role,
    message.text,
    JSON.stringify(message.citations),
    JSON.stringify(message.trace),
    message.createdAt,
    writeAgentMessageMetadata(message),
  );
}
