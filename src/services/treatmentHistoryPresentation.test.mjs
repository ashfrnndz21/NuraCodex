import test from 'node:test';
import assert from 'node:assert/strict';
import { presentTreatmentHistoryEvent, presentTreatmentVersionFields } from './treatmentHistoryPresentation.mjs';

test('a dated user-entered snapshot stays labeled as the user’s record', () => {
  assert.deepEqual(presentTreatmentHistoryEvent({ snapshot: {
    status: 'current', source: 'Entered by you', dose: '5 mg',
  } }), {
    statusLabel: 'CURRENT AT THIS CHANGE',
    statusDate: null,
    sourceLabel: 'Entered by you',
    sourceKind: 'user_entered',
    sourceAssetId: null,
  });
});

test('a sourced snapshot resolves its original saved file and past date', () => {
  assert.deepEqual(presentTreatmentHistoryEvent({ snapshot: {
    status: 'past', endedOn: '2026-09-12', source: 'Prescription', sourceId: 'asset-rx',
  } }, [{ id: 'asset-rx', name: 'prescription-sample.pdf' }]), {
    statusLabel: 'PAST AT THIS CHANGE',
    statusDate: '2026-09-12',
    sourceLabel: 'prescription-sample.pdf',
    sourceKind: 'attached_source',
    sourceAssetId: 'asset-rx',
  });
});

test('a removed source reference is never relabeled as user-entered', () => {
  assert.deepEqual(presentTreatmentHistoryEvent({ snapshot: {
    status: 'past', source: 'Clinic note', sourceId: 'asset-missing',
  } }), {
    statusLabel: 'PAST AT THIS CHANGE',
    statusDate: null,
    sourceLabel: 'Clinic note',
    sourceKind: 'source_unavailable',
    sourceAssetId: null,
  });
});

test('reopens every exact saved field for a dated treatment version without normalizing its source values', () => {
  const snapshot = {
    name: 'Insulin glargine', dose: '12 units', schedule: 'At bedtime', purpose: 'As recorded on prescription',
    prescriber: 'Dr. Lee', careLocation: 'North Clinic', pharmacy: 'Central Pharmacy', startedOn: '2026-04-22',
    endedOn: '2026-09-12', status: 'past', source: 'Prescription', sourceId: 'rx-asset',
  };
  assert.deepEqual(presentTreatmentVersionFields(snapshot), [
    { label: 'MEDICINE / TREATMENT', value: 'Insulin glargine' },
    { label: 'DOSE', value: '12 units' },
    { label: 'SCHEDULE', value: 'At bedtime' },
    { label: 'PURPOSE', value: 'As recorded on prescription' },
    { label: 'PRESCRIBER', value: 'Dr. Lee' },
    { label: 'CARE LOCATION', value: 'North Clinic' },
    { label: 'PHARMACY', value: 'Central Pharmacy' },
    { label: 'STARTED ON', value: '2026-04-22' },
    { label: 'ENDED ON', value: '2026-09-12' },
  ]);
  assert.equal(snapshot.source, 'Prescription');
  assert.equal(snapshot.sourceId, 'rx-asset');
});

test('keeps missing version fields explicit and does not invent an end date for a current entry', () => {
  assert.deepEqual(presentTreatmentVersionFields({ name: 'Vitamin D', status: 'current' }), [
    { label: 'MEDICINE / TREATMENT', value: 'Vitamin D' },
    { label: 'DOSE', value: 'Dose not recorded' },
    { label: 'SCHEDULE', value: 'Schedule not recorded' },
    { label: 'PURPOSE', value: 'Purpose not recorded' },
    { label: 'PRESCRIBER', value: 'Prescriber not recorded' },
    { label: 'CARE LOCATION', value: 'Care location not recorded' },
    { label: 'PHARMACY', value: 'Pharmacy not recorded' },
    { label: 'STARTED ON', value: 'Start date not recorded' },
  ]);
});
