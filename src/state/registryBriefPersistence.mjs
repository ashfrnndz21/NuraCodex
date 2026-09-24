const INSERT_REGISTRY_BRIEF = 'INSERT INTO registry_briefs (id,topic_id,topic_label,answer,unknowns_json,citations_json,source_signature,run_id,created_at,supersedes_brief_id) VALUES (?,?,?,?,?,?,?,?,?,?)';

export async function appendRegistryBrief(db, brief) {
  let saved;
  await db.withTransactionAsync(async () => {
    const previousRows = await db.getAllAsync(
      'SELECT id,created_at FROM registry_briefs WHERE topic_id=? ORDER BY rowid DESC LIMIT 1',
      brief.topicId,
    );
    const previous = previousRows[0];
    const proposedTime = Date.parse(brief.createdAt);
    const previousTime = Date.parse(previous?.created_at ?? '');
    const validProposedTime = Number.isFinite(proposedTime) ? proposedTime : Date.now();
    const createdAt = new Date(Number.isFinite(previousTime) ? Math.max(validProposedTime, previousTime + 1) : validProposedTime).toISOString();
    saved = { ...brief, createdAt, supersedesBriefId: previous?.id ?? undefined };
    await db.runAsync(
      INSERT_REGISTRY_BRIEF,
      saved.id,
      saved.topicId,
      saved.topicLabel,
      saved.answer,
      JSON.stringify(saved.unknowns),
      JSON.stringify(saved.citations),
      saved.sourceSignature,
      saved.runId,
      saved.createdAt,
      saved.supersedesBriefId ?? null,
    );
  });
  if (!saved) throw new Error('The Registry summary transaction did not save a version.');
  return saved;
}
