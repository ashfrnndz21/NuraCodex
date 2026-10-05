import assert from 'node:assert/strict';
import test from 'node:test';
import { buildHomeCarePreview, firstUserContextFact } from './homeBrief.mjs';

const now = new Date('2026-09-28T12:00:00.000Z');

test('Home care preview includes only upcoming visits and open future actions, in date order', () => {
  const items = buildHomeCarePreview([
    { id: 'visit-later', status: 'upcoming', appointmentAt: '2026-10-02', purpose: 'Cardiology follow-up', clinician: '', location: '', questions: ['Question 1', 'Question 2'], followUpActions: [] },
    { id: 'visit-past', status: 'upcoming', appointmentAt: '2026-09-20', purpose: 'Past appointment', questions: [], followUpActions: [] },
    { id: 'visit-action', status: 'completed', appointmentAt: '2026-09-12', purpose: 'Prior review', questions: [], followUpActions: [
      { id: 'open-action', title: 'Book a follow-up', dueOn: '2026-09-30', status: 'open' },
      { id: 'done-action', title: 'Completed action', dueOn: '2026-09-29', status: 'done' },
      { id: 'expired-action', title: 'Past action', dueOn: '2026-09-18', status: 'open' },
    ] },
  ], now);

  assert.deepEqual(items.map((item) => item.id), ['follow-up:open-action', 'visit:visit-later']);
  assert.equal(items[1].detail, '2 saved questions');
});

test('Home context shows only an explicit user-written fact and avoids repeating its lead item', () => {
  const facts = [
    { id: 'report', source: 'Lab report', category: 'Lab results' },
    { id: 'note', source: 'Written by you', category: 'Self-reported' },
  ];

  assert.equal(firstUserContextFact(facts, 'note'), undefined);
  assert.equal(firstUserContextFact(facts, 'report'), facts[1]);
  assert.equal(firstUserContextFact([{ id: 'report', source: 'Lab report', category: 'Lab results' }]), undefined);
});
