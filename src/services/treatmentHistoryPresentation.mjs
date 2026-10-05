/** Build a truthful display model for one dated treatment snapshot. */
export function presentTreatmentHistoryEvent(event, assets = []) {
  const snapshot = event?.snapshot ?? {};
  const attachedAsset = snapshot.sourceId
    ? assets.find((asset) => asset.id === snapshot.sourceId)
    : null;
  const hasSavedSourceReference = Boolean(snapshot.sourceId);
  const origin = attachedAsset
    ? 'attached_source'
    : hasSavedSourceReference
      ? 'source_unavailable'
      : 'user_entered';

  return {
    statusLabel: snapshot.status === 'past' ? 'PAST AT THIS CHANGE' : 'CURRENT AT THIS CHANGE',
    statusDate: snapshot.status === 'past' ? snapshot.endedOn ?? null : null,
    sourceLabel: attachedAsset?.name
      ?? (snapshot.source?.trim() || (hasSavedSourceReference ? 'Previously attached source' : 'Entered by you')),
    sourceKind: origin,
    sourceAssetId: attachedAsset?.id ?? null,
  };
}

/** Return the exact saved fields for reopening a dated version in the treatment history. */
export function presentTreatmentVersionFields(snapshot = {}) {
  const recordedValue = (value, fallback = 'Not recorded') =>
    typeof value === 'string' && value.trim() ? value : fallback;
  const fields = [
    { label: 'MEDICINE / TREATMENT', value: recordedValue(snapshot.name, 'Name not recorded') },
    { label: 'DOSE', value: recordedValue(snapshot.dose, 'Dose not recorded') },
    { label: 'SCHEDULE', value: recordedValue(snapshot.schedule, 'Schedule not recorded') },
    { label: 'PURPOSE', value: recordedValue(snapshot.purpose, 'Purpose not recorded') },
    { label: 'PRESCRIBER', value: recordedValue(snapshot.prescriber, 'Prescriber not recorded') },
    { label: 'CARE LOCATION', value: recordedValue(snapshot.careLocation, 'Care location not recorded') },
    { label: 'PHARMACY', value: recordedValue(snapshot.pharmacy, 'Pharmacy not recorded') },
    { label: 'STARTED ON', value: recordedValue(snapshot.startedOn, 'Start date not recorded') },
  ];
  if (snapshot.status === 'past') {
    fields.push({ label: 'ENDED ON', value: recordedValue(snapshot.endedOn, 'End date not recorded') });
  }
  return fields;
}
