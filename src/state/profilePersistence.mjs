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

export async function persistApprovedMemoryFact(database, fact) {
  await database.withTransactionAsync(async () => {
    await database.runAsync(
      'INSERT INTO health_facts (id,label,value,date,category,source,status,note) VALUES (?,?,?,?,?,?,?,?)',
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
      'INSERT INTO memory_provenance (fact_id,source_run_id,review_state,valid_from,valid_until,confidence,permission_scope,source_id,source_claim_id,supersedes_fact_id) VALUES (?,?,?,?,?,?,?,?,?,?)',
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
  });
}

export async function loadProfileSetup(database) {
  const profile = await database.getFirstAsync(
    'SELECT name,birthday,country,email,phone FROM profile WHERE id=1',
  );
  const topics = await database.getAllAsync('SELECT id,label FROM topics ORDER BY rowid');
  const rows = await database.getAllAsync(
    'SELECT f.id,f.label,f.value,f.date,f.category,f.source,f.status,f.note,m.source_run_id,m.review_state,m.valid_from,m.valid_until,m.confidence,m.permission_scope,m.source_id,m.source_claim_id,m.supersedes_fact_id FROM health_facts f LEFT JOIN memory_provenance m ON m.fact_id=f.id ORDER BY f.rowid DESC',
  );

  return {
    profile: profile ?? null,
    topics,
    facts: rows.map((fact) => ({
      id: fact.id,
      label: fact.label,
      value: fact.value,
      date: fact.date,
      category: fact.category,
      source: fact.source,
      status: fact.status,
      note: fact.note ?? undefined,
      sourceRunId: fact.source_run_id ?? undefined,
      sourceId: fact.source_id ?? undefined,
      sourceClaimId: fact.source_claim_id ?? undefined,
      supersedesId: fact.supersedes_fact_id ?? undefined,
      reviewState: fact.review_state ?? undefined,
      validFrom: fact.valid_from ?? undefined,
      validUntil: fact.valid_until,
      confidence: fact.confidence,
      permissionScope: fact.permission_scope ?? undefined,
    })),
  };
}
