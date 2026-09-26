const sourceKinds = new Set(['pdf', 'image', 'video', 'file']);

function sourceType(asset) {
  const kind = typeof asset.kind === 'string' ? asset.kind.toLowerCase() : '';
  if (sourceKinds.has(kind)) return kind;
  const mediaType = typeof asset.mimeType === 'string' ? asset.mimeType.toLowerCase().split(';')[0].trim() : '';
  if (mediaType === 'application/pdf') return 'pdf';
  if (mediaType.startsWith('image/')) return 'image';
  if (mediaType.startsWith('video/')) return 'video';
  return 'file';
}

function earliestAddedAt(assets) {
  const dates = assets.map((asset) => asset.addedAt).filter((value) => typeof value === 'string' && value.trim());
  if (dates.length < 2) return dates[0] ?? null;
  const parsed = dates.map((value, index) => ({ value, index, time: Date.parse(value) }));
  if (parsed.every((item) => Number.isFinite(item.time))) {
    return parsed.sort((left, right) => left.time - right.time || left.index - right.index)[0].value;
  }
  return dates[0];
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim()))];
}

function visitAssetIds(visit) {
  return uniqueStrings([
    ...(Array.isArray(visit.briefAssetIds) ? visit.briefAssetIds : []),
    ...(Array.isArray(visit.outcomeSourceAssetIds) ? visit.outcomeSourceAssetIds : []),
    ...(Array.isArray(visit.followUpActions) ? visit.followUpActions.flatMap((action) => Array.isArray(action.sourceAssetIds) ? action.sourceAssetIds : []) : []),
  ]);
}

function makeFactDetail(fact) {
  return {
    id: `fact:${fact.id}`,
    kind: 'fact',
    label: fact.label,
    value: fact.value,
    category: fact.category,
    // This is the event/report date used by the timeline, not the date the
    // person attached the source or confirmed the fact.
    date: fact.date || 'Date not stated',
    recordedAt: fact.validFrom || fact.createdAt || null,
  };
}

function makeTreatmentDetail(treatment) {
  return {
    id: `treatment:${treatment.id}`,
    kind: 'treatment',
    label: treatment.name,
    value: [treatment.dose, treatment.schedule].filter(Boolean).join(' · '),
    category: 'Treatment',
    date: treatment.startedOn || 'Date not stated',
    recordedAt: treatment.createdAt || null,
  };
}

function makeVisitRow(visit, sourceGroupIds) {
  const title = typeof visit.purpose === 'string' && visit.purpose.trim() ? visit.purpose.trim() : 'Care visit';
  const linkedSourceCount = sourceGroupIds.length;
  return {
    id: `visit:${visit.id}`,
    kind: 'visit',
    title,
    state: visit.status === 'completed' ? 'COMPLETED VISIT' : 'UPCOMING VISIT',
    summary: [
      visit.appointmentAt || 'Date not stated',
      visit.clinician,
      visit.location,
      linkedSourceCount ? `${linkedSourceCount} linked source${linkedSourceCount === 1 ? '' : 's'}` : null,
    ].filter(Boolean).join(' · '),
    date: visit.appointmentAt || null,
    sourceGroupIds,
    details: [],
  };
}

/**
 * Build one evidence-first row per canonical medical source, then keep
 * unlinked saved details and visits as their own rows. Re-uploaded assets that
 * resolve to the same server source share one group.
 */
export function buildProfileEvidenceRows({ facts = [], assets = [], treatments = [], visits = [] } = {}) {
  const currentFacts = facts.filter((fact) => !fact.validUntil);
  const medicalAssets = assets.filter((asset) => asset.purpose !== 'insurance');
  const sourceGroups = new Map();
  const groupByAssetId = new Map();
  const groupBySourceId = new Map();
  const factsBySource = new Map();
  const treatmentsBySource = new Map();

  for (const asset of medicalAssets) {
    const assetId = typeof asset.id === 'string' ? asset.id.trim() : '';
    if (!assetId) continue;
    const sourceId = typeof asset.serverSourceId === 'string' ? asset.serverSourceId.trim() : '';
    const key = sourceId ? `source:${sourceId}` : `asset:${assetId}`;
    let group = sourceGroups.get(key);
    if (!group) {
      group = { key, sourceId: sourceId || null, assets: [] };
      sourceGroups.set(key, group);
    }
    group.assets.push(asset);
    groupByAssetId.set(assetId, group);
    if (sourceId) groupBySourceId.set(sourceId, group);
  }

  for (const fact of currentFacts) {
    const sourceId = typeof fact.sourceId === 'string' ? fact.sourceId.trim() : '';
    if (!sourceId) continue;
    const grouped = factsBySource.get(sourceId) ?? [];
    grouped.push(fact);
    factsBySource.set(sourceId, grouped);
  }
  for (const treatment of treatments) {
    const sourceId = typeof treatment.sourceId === 'string' ? treatment.sourceId.trim() : '';
    if (!sourceId) continue;
    const grouped = treatmentsBySource.get(sourceId) ?? [];
    grouped.push(treatment);
    treatmentsBySource.set(sourceId, grouped);
  }

  const linkedFactIds = new Set();
  const linkedTreatmentIds = new Set();
  const factGroupById = new Map();
  const treatmentGroupById = new Map();
  const visitsByGroup = new Map();
  const rows = [...sourceGroups.values()].map((group) => {
    const primaryAsset = group.assets[0];
    const sourceFacts = group.sourceId ? factsBySource.get(group.sourceId) ?? [] : [];
    const sourceTreatments = group.sourceId ? treatmentsBySource.get(group.sourceId) ?? [] : [];
    const uniqueFacts = [...new Map(sourceFacts.map((fact) => [fact.id, fact])).values()];
    const uniqueTreatments = [...new Map(sourceTreatments.map((treatment) => [treatment.id, treatment])).values()];
    uniqueFacts.forEach((fact) => {
      linkedFactIds.add(fact.id);
      factGroupById.set(fact.id, group);
    });
    uniqueTreatments.forEach((treatment) => {
      linkedTreatmentIds.add(treatment.id);
      treatmentGroupById.set(treatment.id, group);
    });
    const details = [...uniqueFacts.map(makeFactDetail), ...uniqueTreatments.map(makeTreatmentDetail)];
    const counts = { facts: uniqueFacts.length, treatments: uniqueTreatments.length, visits: 0, total: details.length };
    return {
      id: group.key,
      kind: 'source',
      sourceId: group.sourceId,
      assetIds: group.assets.map((asset) => asset.id),
      sourceType: sourceType(primaryAsset),
      addedAt: earliestAddedAt(group.assets),
      title: displayRecordSourceName(primaryAsset.name, sourceType(primaryAsset)),
      state: details.length ? 'SOURCE LINKED' : group.sourceId ? 'SOURCE SAVED' : 'FILE SAVED',
      summary: group.sourceId
        ? details.length
          ? `${details.length} saved ${details.length === 1 ? 'detail is' : 'details are'} linked to this source.`
          : 'The source is saved. No reviewed details are attached yet.'
        : 'The original is saved on this device. No extracted details are linked yet.',
      counts,
      details,
    };
  });

  // Visits can reference the same file from the brief, outcome and follow-up
  // sections. Resolve those aliases once and count each visit once per source.
  const uniqueVisits = new Map();
  for (const visit of visits) {
    if (typeof visit.id !== 'string' || !visit.id.trim() || uniqueVisits.has(visit.id)) continue;
    uniqueVisits.set(visit.id, visit);
  }
  for (const visit of uniqueVisits.values()) {
    const representedGroups = new Set();
    for (const assetId of visitAssetIds(visit)) {
      const group = groupByAssetId.get(assetId) ?? groupBySourceId.get(assetId);
      if (group) representedGroups.add(group.key);
    }
    for (const factId of uniqueStrings(Array.isArray(visit.briefFactIds) ? visit.briefFactIds : [])) {
      const group = factGroupById.get(factId);
      if (group) representedGroups.add(group.key);
    }
    for (const treatmentId of uniqueStrings(Array.isArray(visit.briefTreatmentIds) ? visit.briefTreatmentIds : [])) {
      const group = treatmentGroupById.get(treatmentId);
      if (group) representedGroups.add(group.key);
    }
    const groupIds = [...representedGroups];
    for (const groupId of groupIds) {
      const group = sourceGroups.get(groupId);
      if (!group) continue;
      const groupedVisits = visitsByGroup.get(groupId) ?? new Set();
      groupedVisits.add(visit.id);
      visitsByGroup.set(groupId, groupedVisits);
    }
  }

  for (const row of rows) {
    const visitIds = visitsByGroup.get(row.id) ?? new Set();
    row.counts.visits = visitIds.size;
    row.counts.total += visitIds.size;
    if (visitIds.size) row.summary += ` ${visitIds.size} care ${visitIds.size === 1 ? 'visit is' : 'visits are'} also linked.`;
  }

  for (const fact of currentFacts) {
    if (linkedFactIds.has(fact.id)) continue;
    const userEntered = !fact.sourceId || fact.source === 'Entered by you' || fact.source === 'Added by you';
    rows.push({
      id: `fact:${fact.id}`,
      kind: 'detail',
      title: fact.label,
      state: userEntered ? 'ADDED BY YOU' : 'SAVED DETAIL',
      summary: [fact.value, fact.date || 'Date not stated', fact.source || 'Entered by you'].filter(Boolean).join(' · '),
      details: [],
    });
  }

  for (const treatment of treatments) {
    if (linkedTreatmentIds.has(treatment.id)) continue;
    rows.push({
      id: `treatment:${treatment.id}`,
      kind: 'treatment',
      title: treatment.name,
      state: treatment.status === 'past' ? 'PAST TREATMENT' : 'TREATMENT',
      summary: [treatment.dose, treatment.schedule, treatment.startedOn || 'Date not stated', treatment.source].filter(Boolean).join(' · '),
      details: [],
    });
  }

  for (const visit of uniqueVisits.values()) {
    const sourceGroupIds = [...new Set([...visitsByGroup.keys()].filter((groupId) => visitsByGroup.get(groupId)?.has(visit.id)))];
    rows.push(makeVisitRow(visit, sourceGroupIds));
  }

  return rows;
}

function displayRecordSourceName(name, type) {
  const filename = typeof name === 'string' ? name.trim() : '';
  const fallback = type === 'image' ? 'Health image' : type === 'video' ? 'Health video' : type === 'pdf' ? 'Health document' : 'Health record';
  if (!filename) return fallback;
  const readable = filename
    .replace(/^nura[-_]synthetic[-_]/i, '')
    .replace(/^(?:pl\d+[-_])?sample[-_]/i, '')
    .replace(/\.[a-z0-9]{1,8}$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\bjan\b/gi, 'January')
    .replace(/\bfeb\b/gi, 'February')
    .replace(/\bmar\b/gi, 'March')
    .replace(/\bapr\b/gi, 'April')
    .replace(/\bjun\b/gi, 'June')
    .replace(/\bjul\b/gi, 'July')
    .replace(/\baug\b/gi, 'August')
    .replace(/\bsep\b/gi, 'September')
    .replace(/\boct\b/gi, 'October')
    .replace(/\bnov\b/gi, 'November')
    .replace(/\bdec\b/gi, 'December')
    .trim();
  if (!readable || /^[a-f\d]{12,}(?:-[a-f\d]{4,})*$/i.test(readable.replace(/\s+/g, ''))) return fallback;
  return readable.replace(/\b\w/g, (character) => character.toUpperCase());
}
