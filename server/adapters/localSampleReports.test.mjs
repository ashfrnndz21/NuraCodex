import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolveLocalSampleReport, LocalSampleMismatchError } from './localSampleReports.mjs';
import { isLocalSampleFixtureId } from '../../src/services/localSampleFixtures.mjs';

const root = new URL('../../assets/samples/', import.meta.url);

test('only the two bundled report IDs enable local sample handling in the app', () => {
  assert.equal(isLocalSampleFixtureId('lipid-panel-jan-2025'), true);
  assert.equal(isLocalSampleFixtureId('lipid-panel-apr-2025'), true);
  assert.equal(isLocalSampleFixtureId('unknown-fixture'), false);
  assert.equal(isLocalSampleFixtureId(''), false);
  assert.equal(isLocalSampleFixtureId(null), false);
});

test('maps only the exact January sample PDF to source-quoted dated values', async () => {
  const bytes = await readFile(new URL('PL0005-sample-lipid-profile.pdf', root));
  const result = resolveLocalSampleReport({
    bytes, filename: 'PL0005-sample-lipid-profile.pdf', mediaType: 'application/pdf',
    purpose: 'medical', fixtureId: 'lipid-panel-jan-2025',
  });
  assert.equal(result.processingMode, 'local_sample_fixture');
  assert.equal(result.extraction.claims.length, 8);
  assert.deepEqual(result.extraction.claims.map(({ label, effectiveAt }) => [label, effectiveAt]), [
    ['Total Cholesterol', '2025-01-21'], ['Triglyceride', '2025-01-21'],
    ['HDL Cholesterol', '2025-01-21'], ['VLDL Cholesterol', '2025-01-21'],
    ['LDL Cholesterol', '2025-01-21'], ['Non-HDL Cholesterol', '2025-01-21'],
    ['LDL / HDL Ratio', '2025-01-21'], ['TC / HDL Ratio', '2025-01-21'],
  ]);
  assert.equal(result.extraction.claims[1].quote, 'Triglyceride 184 mg/dL <150');
  assert.equal(result.extraction.documentContext.dates[0].value, '21-Jan-25 21:16');
  assert.ok(!JSON.stringify(result).includes('DEMO Patient'));
  assert.ok(!JSON.stringify(result).includes('UHID'));
});

test('maps only the exact April follow-up PDF and preserves its distinct date and values', async () => {
  const bytes = await readFile(new URL('EXAMPLE-lipid-follow-up.pdf', root));
  const result = resolveLocalSampleReport({
    bytes, filename: 'EXAMPLE-lipid-follow-up.pdf', mediaType: 'application/pdf',
    purpose: 'medical', fixtureId: 'lipid-panel-apr-2025',
  });
  assert.equal(result.extraction.claims.length, 5);
  assert.ok(result.extraction.claims.every((claim) => claim.effectiveAt === '2025-04-22'));
  assert.equal(result.extraction.claims.find((claim) => claim.label === 'LDL cholesterol')?.value, '104');
  assert.equal(result.extraction.documentContext.dates[0].value, '22 Apr 2025');
});

test('ordinary uploads stay on the connected path; a requested sample never accepts a lookalike', async () => {
  assert.equal(resolveLocalSampleReport({ bytes: Buffer.from('other file'), filename: 'report.pdf', mediaType: 'application/pdf' }), null);
  const exactBytes = await readFile(new URL('PL0005-sample-lipid-profile.pdf', root));
  for (const input of [
    { bytes: Buffer.from('altered'), filename: 'PL0005-sample-lipid-profile.pdf', mediaType: 'application/pdf', purpose: 'medical', fixtureId: 'lipid-panel-jan-2025' },
    { bytes: exactBytes, filename: 'renamed.pdf', mediaType: 'application/pdf', purpose: 'medical', fixtureId: 'lipid-panel-jan-2025' },
    { bytes: exactBytes, filename: 'PL0005-sample-lipid-profile.pdf', mediaType: 'image/jpeg', purpose: 'medical', fixtureId: 'lipid-panel-jan-2025' },
    { bytes: exactBytes, filename: 'PL0005-sample-lipid-profile.pdf', mediaType: 'application/pdf', purpose: 'insurance', fixtureId: 'lipid-panel-jan-2025' },
    { bytes: exactBytes, filename: 'PL0005-sample-lipid-profile.pdf', mediaType: 'application/pdf', purpose: 'medical', fixtureId: 'unknown-fixture' },
  ]) assert.throws(() => resolveLocalSampleReport(input), LocalSampleMismatchError);
});
