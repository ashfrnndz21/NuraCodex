const reminderLabels = new Map([[0, 'No reminder'], [15, '15 minutes before'], [60, '1 hour before'], [1440, '1 day before']]);

function validCalendarDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function localDateParts(value) {
  const text = String(value ?? '').trim();
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (dateOnly) {
    const [, yearText, monthText, dayText] = dateOnly;
    const year = Number(yearText); const month = Number(monthText); const day = Number(dayText);
    if (!validCalendarDate(year, month, day)) throw new Error('This visit does not have a valid date.');
    return { year, month, day };
  }
  const date = new Date(text);
  if (!text || Number.isNaN(date.getTime())) throw new Error('This visit does not have a valid date.');
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
}

function pad(value) { return String(value).padStart(2, '0'); }
function dateToken({ year, month, day }) { return `${String(year).padStart(4, '0')}${pad(month)}${pad(day)}`; }
function escapeText(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}
function byteLength(value) {
  let length = 0;
  for (const char of value) {
    const point = char.codePointAt(0);
    length += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
  }
  return length;
}
function foldLine(line) {
  const segments = [];
  let segment = '';
  let limit = 75;
  for (const char of line) {
    if (byteLength(segment + char) > limit) {
      segments.push(segment);
      segment = ` ${char}`;
      limit = 75;
    } else segment += char;
  }
  segments.push(segment);
  return segments.join('\r\n');
}
function localDateTimeToken(parts, time) {
  return `${dateToken(parts)}T${time.replace(':', '')}00`;
}
function addMinutesToLocalDateTime(parts, time, minutes) {
  const date = new Date(parts.year, parts.month - 1, parts.day, Number(time.slice(0, 2)), Number(time.slice(3, 5)) + minutes);
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`;
}
function reminderTrigger(minutes) {
  if (minutes === 1440) return '-P1D';
  if (minutes >= 60 && minutes % 60 === 0) return `-PT${minutes / 60}H`;
  return `-PT${minutes}M`;
}

/**
 * Create a privacy-minimal iCalendar event. No visit reason, clinician, location,
 * notes, questions, sources, or health details are accepted by this function.
 */
export function createVisitCalendarExport({ appointmentAt, time = '', reminderMinutes = 0, uid, dtstamp = new Date().toISOString() }) {
  const date = localDateParts(appointmentAt);
  const normalizedTime = String(time).trim();
  if (normalizedTime && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(normalizedTime)) throw new Error('Enter the appointment time as HH:MM.');
  if (!reminderLabels.has(reminderMinutes)) throw new Error('Choose one of the available reminder times.');
  if (reminderMinutes && !normalizedTime) throw new Error('Add an appointment time before setting a reminder.');
  if (!uid || !/^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$/.test(uid)) throw new Error('A calendar event identifier is required.');
  const stamp = new Date(dtstamp);
  if (Number.isNaN(stamp.getTime())) throw new Error('The calendar event timestamp is invalid.');

  const dateStart = dateToken(date);
  const nextDay = new Date(Date.UTC(date.year, date.month - 1, date.day + 1));
  const dateEnd = dateToken({ year: nextDay.getUTCFullYear(), month: nextDay.getUTCMonth() + 1, day: nextDay.getUTCDate() });
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Nura//Healthcare Appointment//EN', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${stamp.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
    `SUMMARY:${escapeText('Healthcare appointment')}`,
  ];
  if (normalizedTime) {
    lines.push(`DTSTART:${localDateTimeToken(date, normalizedTime)}`);
    lines.push(`DTEND:${addMinutesToLocalDateTime(date, normalizedTime, 30)}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${dateStart}`);
    lines.push(`DTEND;VALUE=DATE:${dateEnd}`);
  }
  if (reminderMinutes) lines.push('BEGIN:VALARM', `TRIGGER:${reminderTrigger(reminderMinutes)}`, 'ACTION:DISPLAY', `DESCRIPTION:${escapeText('Healthcare appointment')}`, 'END:VALARM');
  lines.push('END:VEVENT', 'END:VCALENDAR');

  const filename = `healthcare-appointment-${dateStart}-${uid.split('@')[0].slice(0, 8)}.ics`;
  return {
    filename,
    calendarText: `${lines.map(foldLine).join('\r\n')}\r\n`,
    fields: {
      title: 'Healthcare appointment',
      dateLabel: new Date(date.year, date.month - 1, date.day, 12).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }),
      timeLabel: normalizedTime ? `${normalizedTime} · 30 minutes` : 'All day · no appointment time saved',
      reminderLabel: reminderLabels.get(reminderMinutes),
      isTimed: Boolean(normalizedTime),
    },
  };
}
