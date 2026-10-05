import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { timelineDatePresentation } from './timelineDatePresentation.mjs';

const componentSource = await readFile(new URL('../components/HealthHistory.tsx', import.meta.url), 'utf8');

test('labels a saved self-report date as when it was added, not as its health-event date', () => {
  const note = {
    kind: 'fact',
    source: 'Written by you',
    note: 'Saved in your own words. The timeline date is when you added this note; an event date was not provided.',
    date: '27 Sep 2026',
    eventDateKey: '2026-09-27',
  };

  assert.deepEqual(timelineDatePresentation(note), {
    isEntryDate: true,
    cardDate: 'Added 27 Sep 2026',
    accessibilityLabel: 'Added 27 Sep 2026. Event date not provided.',
  });
  assert.equal(note.eventDateKey, '2026-09-27', 'presentation does not change timeline grouping');
});

test('leaves a dated report and ordinary user-entered details on their existing date presentation', () => {
  const report = { kind: 'fact', source: 'Report PL0005', date: '21 Jan 2025' };
  const ordinaryEntry = { kind: 'fact', source: 'Entered by you', date: '21 Jan 2025' };

  assert.deepEqual(timelineDatePresentation(report), {
    isEntryDate: false,
    cardDate: '21 Jan 2025',
    accessibilityLabel: '21 Jan 2025',
  });
  assert.deepEqual(timelineDatePresentation(ordinaryEntry), {
    isEntryDate: false,
    cardDate: '21 Jan 2025',
    accessibilityLabel: '21 Jan 2025',
  });
});

test('uses the clarified date in the collapsed timeline and exposes it to screen readers', () => {
  assert.match(componentSource, /const datePresentation = timelineDatePresentation\(entry\);/);
  assert.match(componentSource, /style=\{s\.timelineRow\} accessible accessibilityLabel=\{datePresentation\.accessibilityLabel\}/);
  assert.match(componentSource, /<View style=\{s\.dateColGrouped\} \/>/);
  assert.match(componentSource, /datePresentation\.isEntryDate && <Text style=\{\{ color: C\.faint, fontSize: 9, lineHeight: 13, marginTop: 3 \}\}>\{datePresentation\.cardDate\} · event date not provided<\/Text>/);
  assert.match(componentSource, /accessibilityLabel=\{`\$\{groupDateLabel\}, \$\{dateGroup\.entries\.length\}/);
  assert.match(componentSource, /<Text style=\{s\.sourceText\}>\{entry\.source\} · \{entry\.date\}<\/Text>/);
});
