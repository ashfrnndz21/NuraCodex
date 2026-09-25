/** A user-confirmed document relationship. It does not establish which policy is legally active. */
export function validatePolicyReplacement(newerSourceId, olderSourceId, policySources, replacements) {
  if (!newerSourceId || !olderSourceId) return { ok: false, reason: 'Choose two policy sources.' };
  if (newerSourceId === olderSourceId) return { ok: false, reason: 'A policy cannot replace itself.' };
  const sourceIds = new Set(policySources.map((source) => source.sourceId).filter(Boolean));
  if (!sourceIds.has(newerSourceId) || !sourceIds.has(olderSourceId)) return { ok: false, reason: 'Both sources must be saved policy documents.' };
  if (replacements.some((link) => link.newerSourceId === newerSourceId && link.olderSourceId === olderSourceId)) {
    return { ok: false, reason: 'These policy documents are already linked.' };
  }

  // Directed edges point from the replacing document to the earlier document.
  // Reject a new edge when a path from the earlier source back to the newer one exists.
  const earlierByNewer = new Map();
  for (const link of replacements) {
    if (!earlierByNewer.has(link.newerSourceId)) earlierByNewer.set(link.newerSourceId, []);
    earlierByNewer.get(link.newerSourceId).push(link.olderSourceId);
  }
  const seen = new Set();
  const reachesNewer = (sourceId) => {
    if (sourceId === newerSourceId) return true;
    if (seen.has(sourceId)) return false;
    seen.add(sourceId);
    return (earlierByNewer.get(sourceId) ?? []).some(reachesNewer);
  };
  if (reachesNewer(olderSourceId)) return { ok: false, reason: 'This link would create a circular policy history.' };
  return { ok: true, reason: null };
}

function normalizedLabel(value) {
  return String(value ?? '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizedValue(value) {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Compare only accepted current terms with the same explicit label; never infer coverage from an absent entry. */
export function comparePolicyDocuments(newerPolicy, olderPolicy) {
  const collect = (policy) => {
    const terms = new Map();
    for (const term of policy?.currentTerms ?? []) {
      const key = normalizedLabel(term.label);
      if (!key) continue;
      if (!terms.has(key)) terms.set(key, { label: term.label.trim(), entries: [] });
      terms.get(key).entries.push(term);
    }
    return terms;
  };

  const newer = collect(newerPolicy);
  const older = collect(olderPolicy);
  const keys = new Set([...newer.keys(), ...older.keys()]);
  return [...keys].map((key) => {
    const newGroup = newer.get(key);
    const oldGroup = older.get(key);
    const newerTerms = newGroup?.entries ?? [];
    const olderTerms = oldGroup?.entries ?? [];
    let status;
    if (newerTerms.length > 1 || olderTerms.length > 1) status = 'ambiguous';
    else if (!olderTerms.length) status = 'only_newer';
    else if (!newerTerms.length) status = 'only_older';
    else status = normalizedValue(newerTerms[0].value) === normalizedValue(olderTerms[0].value) ? 'same' : 'different';
    return { key, label: newGroup?.label ?? oldGroup.label, status, newerTerms, olderTerms };
  }).sort((left, right) => left.label.localeCompare(right.label));
}

function quantity(value) {
  const clean = String(value ?? '').normalize('NFKC').replace(/,/g, ' ').trim();
  const match = /(-?\d+(?:\.\d+)?)\s*(.*)$/.exec(clean);
  if (!match) return null;
  const prefix = clean.slice(0, match.index).trim();
  return {
    value: Number(match[1]),
    unit: `${prefix} ${match[2]}`.trim().toLowerCase().replace(/\s+/g, ' '),
  };
}

/** Describe only numeric direction that is explicit in matched, single-entry terms. */
export function summarizePolicyDifferences(rows) {
  /** @type {{ sameCount: number; wordingCount: number; oneSidedCount: number; ambiguousCount: number; observations: { label: string; olderValue: string; newerValue: string; kind: 'higher_stated_cost' | 'lower_stated_cost' | 'higher_stated_amount' | 'lower_stated_amount' }[] }} */
  const summary = { sameCount: 0, wordingCount: 0, oneSidedCount: 0, ambiguousCount: 0, observations: [] };
  for (const row of rows ?? []) {
    if (row.status === 'same') { summary.sameCount += 1; continue; }
    if (row.status === 'ambiguous') { summary.ambiguousCount += 1; continue; }
    if (row.status === 'only_newer' || row.status === 'only_older') { summary.oneSidedCount += 1; continue; }
    if (row.status !== 'different') continue;

    const newerTerm = row.newerTerms?.length === 1 ? row.newerTerms[0] : null;
    const olderTerm = row.olderTerms?.length === 1 ? row.olderTerms[0] : null;
    const newer = quantity(newerTerm?.value);
    const older = quantity(olderTerm?.value);
    const direction = /premium|copay|co-pay|deductible|co-?insurance|out[- ]of[- ]pocket|payment/i.test(row.label)
      ? 'cost'
      : /limit|visit|cover|coverage|benefit|reimburse|sum assured|cash value|surrender value|maturity value/i.test(row.label)
        ? 'benefit'
        : null;
    if (!newer || !older || !direction || newer.unit !== older.unit || newer.value === older.value) {
      summary.wordingCount += 1;
      continue;
    }
    summary.observations.push({
      label: row.label,
      olderValue: olderTerm.value,
      newerValue: newerTerm.value,
      kind: direction === 'cost'
        ? newer.value > older.value ? 'higher_stated_cost' : 'lower_stated_cost'
        : newer.value > older.value ? 'higher_stated_amount' : 'lower_stated_amount',
    });
  }
  return summary;
}
