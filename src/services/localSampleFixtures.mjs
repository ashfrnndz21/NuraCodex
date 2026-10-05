const fixturePurposes = new Map([
  ['lipid-panel-jan-2025', 'medical'],
  ['lipid-panel-apr-2025', 'medical'],
  ['insurance-sample-standard-2025', 'insurance'],
  ['insurance-independent-sample-2024', 'insurance'],
]);

export function isLocalSampleFixtureId(value, purpose) {
  if (typeof value !== 'string') return false;
  const fixturePurpose = fixturePurposes.get(value);
  return Boolean(fixturePurpose && (!purpose || purpose === fixturePurpose));
}
