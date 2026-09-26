import { createHash } from 'node:crypto';

const REPORTS = Object.freeze({
  'lipid-panel-jan-2025': {
    filename: 'PL0005-sample-lipid-profile.pdf',
    sha256: '304c3f32aa7958ef6278d6f214f6e5762b3924f4786818731a3b32f320b500fb',
    extraction: {
      claims: [
        ['Total Cholesterol', '122', 'mg/dL', '<200', 'Enzymatic (CHE/CHO/POD)', 'Total Cholesterol 122 mg/dL <200'],
        ['Triglyceride', '184', 'mg/dL', '<150', 'Enzymatic, Endpoint', 'Triglyceride 184 mg/dL <150'],
        ['HDL Cholesterol', '37', 'mg/dL', '>45', 'Direct Measure, PTA / MgCl2', 'HDL Cholesterol 37 mg/dL >45'],
        ['VLDL Cholesterol', '37', 'mg/dL', '5-40', 'Calculated', 'VLDL Cholesterol 37 mg/dL 5-40'],
        ['LDL Cholesterol', '48', 'mg/dL', '<100', 'Friedewald Formula (Calculated)', 'LDL Cholesterol 48 mg/dL <100'],
        ['Non-HDL Cholesterol', '85', 'mg/dL', '<130', 'Calculated', 'Non-HDL Cholesterol 85 mg/dL <130'],
        ['LDL / HDL Ratio', '1.3', 'Ratio', '1.5-3.5', 'Calculated', 'LDL / HDL Ratio 1.3 Ratio 1.5-3.5'],
        ['TC / HDL Ratio', '3.3', 'Ratio', '3-5', 'Calculated', 'TC / HDL Ratio 3.3 Ratio 3-5'],
      ].map(([label, value, unit, referenceRange, method, quote]) => ({
        kind: 'measurement', label, value, unit, referenceRange, method,
        effectiveAt: '2025-01-21', confidence: 1, page: 1, quote,
      })),
      documentContext: {
        documentType: 'Lipid Profile Serum Sample',
        dates: [
          { kind: 'collected_at', value: '21-Jan-25 21:16', page: 1, quote: 'Collected On: 21-Jan-25 21:16' },
          { kind: 'received_at', value: '22-Jan-25 17:27', page: 1, quote: 'Received On: 22-Jan-25 17:27' },
          { kind: 'approved_at', value: '22-Jan-25 19:52', page: 1, quote: 'Approved On: 22-Jan-25 19:52' },
        ],
        entities: [
          { kind: 'analyzer', value: 'VITROS 5600', page: 1, quote: 'Analyzer: Fully Automated Integrated Biochemistry and ImmunoAssay Analyzer: VITROS 5600' },
          { kind: 'technology', value: 'Dry Chemistry (VITROS MicroSlide, MicroSensor & Intellicheck Technology)', page: 1, quote: 'Technology: Dry Chemistry (VITROS MicroSlide, MicroSensor & Intellicheck Technology)' },
        ],
        notes: [
          { kind: 'fasting_guidance', value: 'The report says lipid profiles are best obtained with 10 hours fasting.', page: 1, quote: 'Reports of Lipid Profile are best obtained with 10 hours fasting.' },
          { kind: 'sample_notice', value: 'This is a sample report; actual report values and format may vary.', page: 1, quote: 'This is a Sample Report - Actual report will vary in values, format, ranges etc' },
        ],
      },
    },
  },
  'lipid-panel-apr-2025': {
    filename: 'EXAMPLE-lipid-follow-up.pdf',
    sha256: 'fb069d81ca61d54e48f348ca9d2772fc0644ca406ef910bddf76485de8a67acb',
    extraction: {
      claims: [
        ['Total cholesterol', '178', 'mg/dL', '< 200', 'Total cholesterol 178 mg/dL < 200'],
        ['Triglycerides', '142', 'mg/dL', '< 150', 'Triglycerides 142 mg/dL < 150'],
        ['HDL cholesterol', '46', 'mg/dL', '> 45', 'HDL cholesterol 46 mg/dL > 45'],
        ['LDL cholesterol', '104', 'mg/dL', '< 100', 'LDL cholesterol 104 mg/dL < 100'],
        ['Non-HDL cholesterol', '132', 'mg/dL', '< 130', 'Non-HDL cholesterol 132 mg/dL < 130'],
      ].map(([label, value, unit, referenceRange, quote]) => ({
        kind: 'measurement', label, value, unit, referenceRange, method: null,
        effectiveAt: '2025-04-22', confidence: 1, page: 1, quote,
      })),
      documentContext: {
        documentType: 'Example lipid panel follow-up',
        dates: [{ kind: 'collected_at', value: '22 Apr 2025', page: 1, quote: 'Collection date: 22 Apr 2025' }],
        entities: [{ kind: 'laboratory', value: 'Example diagnostic service', page: 1, quote: 'Example diagnostic service | Serum sample' }],
        notes: [{ kind: 'sample_notice', value: 'This report contains invented demonstration values and is not a patient record or medical advice.', page: 1, quote: 'SAMPLE REPORT - NOT A PATIENT RECORD' }],
      },
    },
  },
});

export class LocalSampleMismatchError extends Error {
  constructor() {
    super('This file does not match the built-in sample report. It was not sent to an AI provider. Rename it if you want to review it as a regular upload.');
    this.name = 'LocalSampleMismatchError';
  }
}

/** Returns null for ordinary uploads. A requested sample mode never falls back to a provider. */
export function verifyLocalSampleReport({ bytes, filename, mediaType, purpose = 'medical', fixtureId }) {
  if (!fixtureId) return null;
  const report = REPORTS[fixtureId];
  if (!report || purpose !== 'medical' || mediaType !== 'application/pdf' || filename !== report.filename) throw new LocalSampleMismatchError();
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== report.sha256) throw new LocalSampleMismatchError();
  return { fixtureId, processingMode: 'local_sample_fixture' };
}

export function extractLocalSampleReport({ fixtureId }) {
  const report = REPORTS[fixtureId];
  if (!report) throw new LocalSampleMismatchError();
  return structuredClone(report.extraction);
}

export function resolveLocalSampleReport(input) {
  const verified = verifyLocalSampleReport(input);
  return verified ? { ...verified, extraction: extractLocalSampleReport(verified) } : null;
}

export const LOCAL_SAMPLE_REPORTS = Object.freeze(Object.fromEntries(
  Object.entries(REPORTS).map(([id, report]) => [id, Object.freeze({ filename: report.filename, sha256: report.sha256 })]),
));
