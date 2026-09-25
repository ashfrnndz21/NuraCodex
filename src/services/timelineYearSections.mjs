function eventYear(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return match[1];
}

/** Group the already-filtered timeline events into dated year sections. */
export function groupTimelineByYear(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const year = eventYear(entry.eventDateKey);
    const key = year ?? 'undated';
    const group = groups.get(key) ?? { key, year, entries: [] };
    group.entries.push(entry);
    groups.set(key, group);
  }

  return [...groups.values()].sort((left, right) => {
    if (left.year === null) return right.year === null ? 0 : 1;
    if (right.year === null) return -1;
    return Number(right.year) - Number(left.year);
  });
}
