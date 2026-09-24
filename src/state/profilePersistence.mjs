export async function persistProfileSetup(database, snapshot) {
  const { profile, topics, facts, explicitlyRemovedTopicIds } = snapshot;
  await database.withTransactionAsync(async () => {
    await database.runAsync(
      'UPDATE profile SET name=?,birthday=?,country=?,email=?,phone=? WHERE id=1',
      profile.name,
      profile.birthday,
      profile.country,
      profile.email,
      profile.phone,
    );

    for (const id of explicitlyRemovedTopicIds) {
      await database.runAsync('DELETE FROM topics WHERE id=?', id);
      await database.runAsync('DELETE FROM health_links WHERE from_id=? OR to_id=?', `topic:${id}`, `topic:${id}`);
    }

    for (const topic of topics) {
      await database.runAsync(
        'INSERT INTO topics (id,label) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET label=excluded.label',
        topic.id,
        topic.label,
      );
    }

    for (const fact of facts) {
      await database.runAsync(
        'INSERT INTO health_facts (id,label,value,date,category,source,status,note) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET label=excluded.label,value=excluded.value,date=excluded.date,category=excluded.category,source=excluded.source,status=excluded.status,note=excluded.note',
        fact.id,
        fact.label,
        fact.value,
        fact.date,
        fact.category,
        fact.source,
        fact.status,
        fact.note ?? null,
      );
      await database.runAsync(
        'INSERT INTO memory_provenance (fact_id,source_run_id,review_state,valid_from,valid_until,confidence,permission_scope,source_id,source_claim_id,supersedes_fact_id) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(fact_id) DO UPDATE SET source_run_id=excluded.source_run_id,review_state=excluded.review_state,valid_from=excluded.valid_from,valid_until=excluded.valid_until,confidence=excluded.confidence,permission_scope=excluded.permission_scope,source_id=excluded.source_id,source_claim_id=excluded.source_claim_id,supersedes_fact_id=excluded.supersedes_fact_id',
        fact.id,
        fact.sourceRunId ?? null,
        fact.reviewState ?? 'user_confirmed',
        fact.validFrom ?? fact.date,
        fact.validUntil ?? null,
        fact.confidence ?? null,
        fact.permissionScope ?? (fact.sourceRunId ? 'profile_memory_write' : 'profile_write'),
        fact.sourceId ?? null,
        fact.sourceClaimId ?? null,
        fact.supersedesId ?? null,
      );
    }
  });
}
