import test from 'node:test';
import assert from 'node:assert/strict';
import { appendIntakeActivity } from './intakeActivity.mjs';

test('a later milestone settles the prior in-flight stage for that file', () => {
  const started = appendIntakeActivity([], { id: '1-intake_started', label: 'Preparing your file', status: 'started' }, 'file-a', 'report.pdf');
  const next = appendIntakeActivity(started, { id: '2-source_received', label: 'File ready for review', status: 'progress' }, 'file-a', 'report.pdf');
  assert.equal(next[0].status, 'complete');
  assert.equal(next[1].status, 'progress');
  assert.equal(next[0].label, 'report.pdf · Preparing your file');
});

test('a failed or cancelled terminal event settles active stages accordingly', () => {
  const started = appendIntakeActivity([], { id: '1-extraction_started', label: 'Reading your document', status: 'started' }, 'file-a', 'report.pdf');
  const failed = appendIntakeActivity(started, { id: '2-run_error', label: 'Could not read the file', status: 'failed' }, 'file-a', 'report.pdf');
  assert.equal(failed[0].status, 'failed');

  const cancelled = appendIntakeActivity(started, { id: '3-intake_cancelled', label: 'Reading stopped', status: 'cancelled' }, 'file-a', 'report.pdf');
  assert.equal(cancelled[0].status, 'cancelled');
});

test('activity from another file does not settle this file’s active stage', () => {
  const started = appendIntakeActivity([], { id: '1-extraction_started', label: 'Reading your document', status: 'started' }, 'file-a', 'report-a.pdf');
  const second = appendIntakeActivity(started, { id: '1-intake_started', label: 'Preparing your file', status: 'started' }, 'file-b', 'report-b.pdf');
  assert.equal(second[0].status, 'started');
  assert.equal(second[1].status, 'started');
});
