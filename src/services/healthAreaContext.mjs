const HEALTH_AREA_CONTEXTS = Object.freeze([
  Object.freeze({ id: 'bp-topic', label: 'Blood pressure' }),
  Object.freeze({ id: 'cholesterol', label: 'Cholesterol' }),
  Object.freeze({ id: 'sleep', label: 'Sleep' }),
  Object.freeze({ id: 'heart', label: 'Heart health' }),
  Object.freeze({ id: 'sugar', label: 'Blood sugar' }),
  Object.freeze({ id: 'medicines', label: 'Medicines' }),
  Object.freeze({ id: 'family', label: 'Family history' }),
  Object.freeze({ id: 'joints', label: 'Joints and movement' }),
  Object.freeze({ id: 'other', label: 'Something else' }),
]);

export function getHealthAreaContext(id) {
  if (typeof id !== 'string') return null;
  return HEALTH_AREA_CONTEXTS.find((area) => area.id === id) ?? null;
}
