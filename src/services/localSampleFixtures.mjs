const fixtureIds = new Set(['lipid-panel-jan-2025', 'lipid-panel-apr-2025']);

export function isLocalSampleFixtureId(value) {
  return typeof value === 'string' && fixtureIds.has(value);
}
