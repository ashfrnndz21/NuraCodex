import test from 'node:test';
import assert from 'node:assert/strict';
import { compactFeedBrief, summarizeFeedActivity } from './feedPresentation.mjs';

test('compact feed brief shows a short overview and omits the generated text dump by default', () => {
  const full = 'Blood pressure: brief health education - Blood pressure is the force of blood against artery walls. The top number is systolic pressure and the bottom number is diastolic pressure. It is reported in millimeters of mercury. Adults have several categories. Home readings should be discussed with a health professional.';
  const preview = compactFeedBrief(full, 'Blood pressure');
  assert.match(preview, /^Blood pressure is the force/);
  assert.match(preview, /diastolic pressure\./);
  assert.doesNotMatch(preview, /Adults have several categories/);
});

test('compact feed brief bounds a very long first point at a whole word', () => {
  const long = `A detailed overview ${'with supporting context '.repeat(50)}and a final point.`;
  const preview = compactFeedBrief(long, '', 80);
  assert.ok(preview.length <= 81);
  assert.match(preview, /…$/);
  assert.doesNotMatch(preview, /\s$/);
});

test('feed activity names each selected topic and describes the actual service state', () => {
  const rows = summarizeFeedActivity([
    { id: 'bp', label: 'Searching trusted health sources', status: 'complete', detail: 'Found 7 new sources for Blood pressure' },
    { id: 'sleep', label: 'Searching trusted health sources', status: 'started', detail: 'Selected area: Sleep' },
  ]);
  assert.deepEqual(rows.map(({ topic, detail, status }) => ({ topic, detail, status })), [
    { topic: 'Blood pressure', detail: '7 sources found', status: 'complete' },
    { topic: 'Sleep', detail: 'Checking trusted sources', status: 'started' },
  ]);
});
