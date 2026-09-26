export function normalizeReviewEventDate(value) {
  if (value === null) return { ok: true, value: null };
  if (typeof value !== 'string') return { ok: false, value: null };
  const text = value.trim();
  if (!text) return { ok: true, value: null };
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return { ok: false, value: null };
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return { ok: false, value: null };
  }
  return { ok: true, value: text };
}

export function resolveFactEventDate(eventDate, recordedAt) {
  if (eventDate === null || eventDate === '') return '';
  return typeof eventDate === 'string' ? eventDate : recordedAt;
}

/** Parse dates saved by both the current ISO writer and the older locale writer. */
export function parseHealthDate(value) {
  if (typeof value !== 'string' || !value.trim()) return null;

  // Older builds stored the device's locale date (for example 24/9/2026).
  // For ambiguous slash dates, use the device locale used by this project (day/month).
  const match = value.trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (match) {
    const first = Number(match[1]);
    const second = Number(match[2]);
    const year = Number(match[3]);
    const day = first > 12 ? first : second > 12 ? second : first;
    const month = first > 12 ? second : second > 12 ? first : second;
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return date;
  }

  // ISO date-only values represent a calendar day, not a UTC instant. Construct
  // them in local time so the timeline cannot shift them to the previous day.
  const dateOnly = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return date;
  }

  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}
