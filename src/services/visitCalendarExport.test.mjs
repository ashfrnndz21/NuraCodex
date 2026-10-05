import test from 'node:test';
import assert from 'node:assert/strict';
import { createVisitCalendarExport } from './visitCalendarExport.mjs';

const common = { appointmentAt: '2026-10-03', uid: 'event-123@nura.local', dtstamp: '2026-10-03T02:03:04.000Z' };

test('exports a generic all-day event with no saved visit details', () => {
  const result = createVisitCalendarExport({ ...common, purpose: 'Cardiology review', clinician: 'Dr Example', location: 'North Clinic', outcome: 'Private note', healthRecords: ['HbA1c 5.8%'] });
  assert.equal(result.filename, 'healthcare-appointment-20261003-event-12.ics');
  assert.equal(result.fields.title, 'Healthcare appointment');
  assert.equal(result.fields.timeLabel, 'All day · no appointment time saved');
  assert.equal(result.fields.reminderLabel, 'No reminder');
  assert.match(result.calendarText, /DTSTART;VALUE=DATE:20261003\r\nDTEND;VALUE=DATE:20261004/);
  assert.doesNotMatch(result.calendarText, /Cardiology|Dr Example|North Clinic|Private note|HbA1c|DESCRIPTION:/);
  assert.match(result.calendarText, /SUMMARY:Healthcare appointment/);
  assert.ok(result.calendarText.endsWith('\r\n'));
});

test('adds only the reminder the user selected for an explicitly entered time', () => {
  const result = createVisitCalendarExport({ ...common, time: '09:30', reminderMinutes: 60 });
  assert.equal(result.fields.timeLabel, '09:30 · 30 minutes');
  assert.equal(result.fields.reminderLabel, '1 hour before');
  assert.match(result.calendarText, /DTSTART:20261003T093000\r\nDTEND:20261003T100000/);
  assert.match(result.calendarText, /BEGIN:VALARM\r\nTRIGGER:-PT1H\r\nACTION:DISPLAY\r\nDESCRIPTION:Healthcare appointment\r\nEND:VALARM/);
});

test('rejects a reminder when appointment time is not known', () => {
  assert.throws(() => createVisitCalendarExport({ ...common, reminderMinutes: 15 }), /Add an appointment time/);
});

test('rejects invalid date, time, reminder and event identifiers', () => {
  assert.throws(() => createVisitCalendarExport({ ...common, appointmentAt: '2026-02-30' }), /valid date/);
  assert.throws(() => createVisitCalendarExport({ ...common, time: '9:30' }), /HH:MM/);
  assert.throws(() => createVisitCalendarExport({ ...common, reminderMinutes: 10 }), /available reminder/);
  assert.throws(() => createVisitCalendarExport({ ...common, uid: 'private data' }), /identifier/);
});

test('folds long event identifiers at the iCalendar 75-byte line limit', () => {
  const result = createVisitCalendarExport({ ...common, uid: `${'x'.repeat(90)}@nura.local` });
  for (const line of result.calendarText.split('\r\n').filter(Boolean)) assert.ok(line.length <= 75, `${line.length} bytes: ${line}`);
});
