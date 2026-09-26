import test from 'node:test';
import assert from 'node:assert/strict';
import { presentTreatmentHistoryEvent } from './treatmentHistoryPresentation.mjs';

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
