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

function validEventDate(value) {
  if (typeof value !== 'string') return false;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function categoryFor(entry) {
  const text = `${entry.kind ?? ''} ${entry.category ?? ''} ${entry.title ?? ''}`.toLowerCase();
  if (entry.kind === 'asset') return /insurance|policy|coverage/.test(text) ? 'Insurance' : 'Documents';
  if (entry.kind === 'treatment' || /medicine|medication|prescription|treatment/.test(text)) return 'Treatment';
  if (entry.kind === 'visit' || /care visit|appointment|clinic|doctor/.test(text)) return 'Care';
  if (/sleep|lifestyle|routine|wellbeing|activity|exercise|nutrition|diet/.test(text)) return 'Lifestyle';
  if (/weight|height|blood pressure|blood sugar|glucose|heart rate|biometric|measurement|vital/.test(text)) return 'Measurements';
  if (/lab|result|lipid|cholesterol|triglyceride|\bhdl\b|\bldl\b|a1c|biomarker/.test(text)) return 'Lab results';
  if (/family|history|condition|diagnos|symptom/.test(text)) return 'Medical history';
  return 'Health details';
}

/** Group the already-sorted entries by event date and summarize their categories. */
export function groupTimelineByDate(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const date = validEventDate(entry.eventDateKey) ? entry.eventDateKey : null;
    const key = date ?? 'undated';
    const group = groups.get(key) ?? { key, date, entries: [], categories: [] };
    group.entries.push(entry);
    groups.set(key, group);
  }

  return [...groups.values()].map((group) => {
    const categoryCounts = new Map();
    for (const entry of group.entries) {
      const label = categoryFor(entry);
      categoryCounts.set(label, (categoryCounts.get(label) ?? 0) + 1);
    }
    return {
      ...group,
      categories: [...categoryCounts].map(([label, count]) => ({ label, count })),
    };
  });
}

/** Keep a single newest event immediately visible; collapse dense or older date groups. */
export function timelineGroupExpandedByDefault(sectionIndex, dateGroupIndex, eventCount) {
  return sectionIndex === 0 && dateGroupIndex === 0 && eventCount === 1;
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
