function validEventDateKey(value) {
  if (typeof value !== 'string') return false;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function labEventKey(entry) {
  if (entry.kind !== 'fact' || !entry.sourceId || !validEventDateKey(entry.eventDateKey) || !/lab|result|measurement/i.test(entry.category)) return null;
  return JSON.stringify([entry.sourceId, entry.eventDateKey, entry.category.trim().toLowerCase()]);
}

/** Group linked lab measurements into one dated report event while preserving every fact. */
export function groupLabEvents(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const key = labEventKey(entry);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }

  const emitted = new Set();
  return entries.flatMap((entry) => {
    const key = labEventKey(entry);
    if (!key) return [entry];
    if (emitted.has(key)) return [];
    emitted.add(key);
    const members = groups.get(key) ?? [entry];
    if (members.length < 2) return [entry];
    return [{
      ...entry,
      title: 'Blood test results',
      detail: `${members.length} values captured from your report.`,
      members,
    }];
  });
}
