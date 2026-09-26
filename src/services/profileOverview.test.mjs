import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProfileEvidenceRows } from './profileOverview.mjs';

test('groups source-linked details under one report instead of showing duplicate record cards', () => {
  const rows = buildProfileEvidenceRows({
    assets: [{ id: 'file-1', name: 'lipid-report.pdf', purpose: 'medical', serverSourceId: 'source-1' }],
    facts: [
      { id: 'fact-1', sourceId: 'source-1', label: 'LDL', value: '3.1 mmol/L', date: '2026-09-12' },
      { id: 'fact-2', sourceId: 'source-1', label: 'HDL', value: '1.2 mmol/L', date: '2026-09-12' },
    ],
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, 'Lipid Report');
  assert.equal(rows[0].state, 'SOURCE LINKED');
  assert.equal(rows[0].details.length, 2);
  assert.match(rows[0].summary, /2 saved details/);
});

test('keeps file-only sources distinct from saved details without claiming the file was analyzed', () => {
  const rows = buildProfileEvidenceRows({
    assets: [{ id: 'file-1', name: 'report.pdf', kind: 'pdf', purpose: 'medical', addedAt: '2026-09-24T10:00:00.000Z' }],
    facts: [{ id: 'fact-1', label: 'Blood pressure', value: '128/82', date: 'Date not stated', source: 'Entered by you' }],
  });

  assert.equal(rows.length, 2);
  assert.equal(rows[0].state, 'FILE SAVED');
  assert.equal(rows[0].sourceType, 'pdf');
  assert.equal(rows[0].addedAt, '2026-09-24T10:00:00.000Z');
  assert.deepEqual(rows[0].counts, { facts: 0, treatments: 0, visits: 0, total: 0 });
  assert.match(rows[0].summary, /No extracted details are linked/);
  assert.equal(rows[1].state, 'ADDED BY YOU');
});

test('does not claim a saved source with no reviewed details is linked evidence', () => {
  const rows = buildProfileEvidenceRows({
    assets: [{ id: 'asset-1', name: 'follow-up.pdf', kind: 'pdf', purpose: 'medical', serverSourceId: 'source-empty' }],
  });

  assert.equal(rows[0].state, 'SOURCE SAVED');
  assert.equal(rows[0].summary, 'The source is saved. No reviewed details are attached yet.');
});

test('keeps the report event date separate from the local attachment and profile-recorded dates', () => {
  const rows = buildProfileEvidenceRows({
    assets: [{ id: 'file-report', name: 'lipids.pdf', kind: 'pdf', addedAt: '2026-09-24T10:00:00.000Z', serverSourceId: 'source-report' }],
    facts: [{
      id: 'fact-ldl', sourceId: 'source-report', label: 'LDL cholesterol', value: '2.8 mmol/L',
      date: '2026-09-12', validFrom: '2026-09-25T08:30:00.000Z',
    }],
  });

  assert.equal(rows[0].addedAt, '2026-09-24T10:00:00.000Z');
  assert.equal(rows[0].details[0].date, '2026-09-12');
  assert.equal(rows[0].details[0].recordedAt, '2026-09-25T08:30:00.000Z');
});

test('groups cross-category facts and treatments under one canonical source even when it has duplicate local assets', () => {
  const rows = buildProfileEvidenceRows({
    assets: [
      { id: 'file-original', name: 'lipid-report.pdf', kind: 'pdf', addedAt: '2026-09-10T08:00:00.000Z', serverSourceId: 'source-lipid' },
      { id: 'file-repeat', name: 'copy.pdf', kind: 'pdf', addedAt: '2026-09-20T08:00:00.000Z', serverSourceId: 'source-lipid' },
    ],
    facts: [
      { id: 'fact-ldl', sourceId: 'source-lipid', label: 'LDL', value: '2.8 mmol/L', category: 'Laboratory' },
      { id: 'fact-bp', sourceId: 'source-lipid', label: 'Blood pressure', value: '120/80 mmHg', category: 'Vitals' },
    ],
    treatments: [{ id: 'treatment-statin', sourceId: 'source-lipid', name: 'Sample medicine', dose: '10 mg', schedule: 'Once daily', status: 'current', startedOn: '2026-08-18' }],
  });
  const sourceRows = rows.filter((row) => row.kind === 'source');

  assert.equal(sourceRows.length, 1);
  assert.deepEqual(sourceRows[0].assetIds, ['file-original', 'file-repeat']);
  assert.equal(sourceRows[0].addedAt, '2026-09-10T08:00:00.000Z');
  assert.deepEqual(sourceRows[0].counts, { facts: 2, treatments: 1, visits: 0, total: 3 });
  assert.deepEqual(sourceRows[0].details.map((detail) => detail.category), ['Laboratory', 'Vitals', 'Treatment']);
});

test('excludes insurance files and expired details from the health-profile overview', () => {
  const rows = buildProfileEvidenceRows({
    assets: [
      { id: 'medical', name: 'lab.pdf', purpose: 'medical', serverSourceId: 'source-med' },
      { id: 'policy', name: 'policy.pdf', purpose: 'insurance', serverSourceId: 'source-policy' },
    ],
    facts: [
      { id: 'live', sourceId: 'source-med', label: 'HDL', value: '1.2 mmol/L' },
      { id: 'earlier', sourceId: 'source-med', label: 'HDL', value: '1.0 mmol/L', validUntil: '2026-09-01T00:00:00.000Z' },
    ],
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, 'Lab');
  assert.deepEqual(rows[0].details.map((detail) => detail.id), ['fact:live']);
});

test('places source-linked treatment under its document and leaves unrelated care items separate', () => {
  const rows = buildProfileEvidenceRows({
    assets: [{ id: 'file-1', name: 'medication-list.pdf', purpose: 'medical', serverSourceId: 'source-1' }],
    treatments: [
      { id: 'linked', sourceId: 'source-1', name: 'Sample medicine', dose: '10 mg', schedule: 'Once daily', status: 'current', startedOn: '2026-08-18' },
      { id: 'manual', name: 'Other medicine', dose: '5 mg', schedule: 'As recorded', status: 'past', startedOn: '2025-01-01', source: 'Entered by you' },
    ],
  });

  assert.equal(rows.length, 2);
  assert.equal(rows[0].details[0].id, 'treatment:linked');
  assert.equal(rows[1].state, 'PAST TREATMENT');
});

test('represents each visit once while counting its links across source groups', () => {
  const linkedVisit = {
    id: 'visit-1', purpose: 'Cardiology follow-up', appointmentAt: '2026-09-02', clinician: 'Sample clinician',
    status: 'completed', briefAssetIds: ['file-a', 'file-a-copy'], outcomeSourceAssetIds: ['file-b', 'file-b'],
    briefFactIds: ['fact-a'], briefTreatmentIds: [],
    followUpActions: [{ sourceAssetIds: ['file-b', 'file-b'] }],
  };
  const rows = buildProfileEvidenceRows({
    assets: [
      { id: 'file-a', name: 'visit-note.pdf', kind: 'pdf', serverSourceId: 'source-a' },
      { id: 'file-a-copy', name: 'visit-note-copy.pdf', kind: 'pdf', serverSourceId: 'source-a' },
      { id: 'file-b', name: 'ecg.png', kind: 'image', serverSourceId: 'source-b' },
    ],
    facts: [{ id: 'fact-a', sourceId: 'source-a', label: 'ECG note', value: 'Sample result', category: 'Care' }],
    visits: [linkedVisit, { ...linkedVisit }, { id: 'visit-2', purpose: 'Routine review', appointmentAt: '2026-10-01', status: 'upcoming' }],
  });
  const sourceRows = rows.filter((row) => row.kind === 'source');
  const visitRows = rows.filter((row) => row.kind === 'visit');

  assert.equal(sourceRows.length, 2);
  assert.deepEqual(sourceRows.map((row) => row.counts.visits), [1, 1]);
  assert.equal(visitRows.length, 2);
  assert.equal(new Set(visitRows.map((row) => row.id)).size, 2);
  assert.deepEqual(visitRows.find((row) => row.id === 'visit:visit-1').sourceGroupIds, ['source:source-a', 'source:source-b']);
  assert.equal(visitRows.find((row) => row.id === 'visit:visit-1').date, '2026-09-02');
  assert.deepEqual(visitRows.find((row) => row.id === 'visit:visit-2').sourceGroupIds, []);
});

test('turns bundled sample filenames into clean report titles without exposing fixture prefixes', () => {
  const rows = buildProfileEvidenceRows({
    assets: [
      { id: 'jan', name: 'nura-synthetic-glucose-report-jan.pdf', purpose: 'medical' },
      { id: 'policy-example', name: 'PL0005-sample-lipid-profile.pdf', purpose: 'medical' },
    ],
  });

  assert.deepEqual(rows.map((row) => row.title), ['Glucose Report January', 'Lipid Profile']);
});

test('replaces opaque generated storage names with a readable file-type label', () => {
  const rows = buildProfileEvidenceRows({
    assets: [{ id: 'image-1', name: '467227fb335d8990935e.png', kind: 'image', purpose: 'medical' }],
  });

  assert.equal(rows[0].title, 'Health image');
});
