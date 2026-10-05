/** Keep answer-only structure in one backward-compatible SQLite metadata field. */
export function readAgentMessageMetadata(serialized) {
  const value = JSON.parse(serialized || '{}');
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function writeAgentMessageMetadata(message) {
  const metadata = {
    meaning: message.meaning,
    unknowns: message.unknowns ?? [],
    nextSteps: message.nextSteps ?? [],
    coverageAssessments: message.coverageAssessments ?? [],
    profileSummary: message.profileSummary,
  };
  if (message.readingSource) metadata.readingSource = message.readingSource;
  return JSON.stringify(metadata);
}

export function agentMessageFromRow(row) {
  const metadata = readAgentMessageMetadata(row.answer_metadata_json);
  return {
    id: row.id,
    ...(row.conversation_id ? { conversationId: row.conversation_id } : {}),
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
    ...(metadata.readingSource ? { readingSource: metadata.readingSource } : {}),
    createdAt: row.created_at,
  };
}

export async function persistAgentMessage(database, message) {
  await database.runAsync(
    'INSERT INTO agent_messages (id,run_id,role,text,citations_json,trace_json,created_at,answer_metadata_json,conversation_id) VALUES (?,?,?,?,?,?,?,?,?)',
    message.id,
    message.runId,
    message.role,
    message.text,
    JSON.stringify(message.citations),
    JSON.stringify(message.trace),
    message.createdAt,
    writeAgentMessageMetadata(message),
    message.conversationId ?? null,
  );
}
