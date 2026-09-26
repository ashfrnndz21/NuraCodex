import assert from 'node:assert/strict';
import test from 'node:test';
import { createAgentRunEventGate } from './agentRunLifecycle.mjs';

const answer = {
  type: 'answer', answer: 'A grounded synthetic answer.', citations: ['R1'], unknowns: [], nextSteps: [],
  memoryProposal: { label: 'Preference', value: 'Synthetic preference', reason: 'Asked to remember.' },
};

test('an answer and its memory proposal remain provisional until run_finished', () => {
  const gate = createAgentRunEventGate();
  assert.deepEqual(gate.receive(answer), { kind: 'pending' });
  assert.deepEqual(gate.receive({ type: 'run_finished', runId: 'synthetic-run' }), { kind: 'pending_finish' });
  const complete = gate.completeTransport();
  assert.equal(complete.kind, 'complete');
  assert.equal(complete.answer.answer, answer.answer);
  assert.equal(complete.answer.memoryProposal.value, answer.memoryProposal.value);
});

test('run_error clears a streamed answer and prevents a stale memory proposal', () => {
  const gate = createAgentRunEventGate();
  gate.receive(answer);
  assert.deepEqual(gate.receive({ type: 'run_error', message: 'Synthetic failure.' }), { kind: 'failed', message: 'Synthetic failure.' });
  assert.deepEqual(gate.receive({ type: 'run_finished', runId: 'synthetic-run' }), { kind: 'ignored' });
});

test('cancellation after server finish but before transport close discards the provisional answer', () => {
  const gate = createAgentRunEventGate();
  gate.receive(answer);
  gate.receive({ type: 'run_finished', runId: 'synthetic-run' });
  assert.equal(gate.cancel().kind, 'failed');
  assert.deepEqual(gate.receive(answer), { kind: 'ignored' });
  assert.deepEqual(gate.completeTransport(), { kind: 'ignored' }, 'a late successful transport cannot restore the canceled proposal');
});

test('a late run_error after run_finished discards the proposal before transport completion', () => {
  const gate = createAgentRunEventGate();
  gate.receive(answer);
  gate.receive({ type: 'run_finished', runId: 'synthetic-run' });
  assert.deepEqual(gate.receive({ type: 'run_error', message: 'Synthetic late failure.' }), { kind: 'failed', message: 'Synthetic late failure.' });
  assert.deepEqual(gate.completeTransport(), { kind: 'ignored' });
});

test('a finish without an answer is a failure, never an empty completed result', () => {
  const gate = createAgentRunEventGate();
  assert.deepEqual(gate.receive({ type: 'run_finished', runId: 'synthetic-run' }), { kind: 'pending_finish' });
  assert.deepEqual(gate.completeTransport(), {
    kind: 'failed', message: 'Nura could not finish this answer. Please try again.',
  });
});

test('progress events remain visible until the run reaches a terminal event', () => {
  const gate = createAgentRunEventGate();
  const event = { type: 'trace', id: 'search', label: 'Finding relevant saved information', status: 'started' };
  assert.deepEqual(gate.receive(event), { kind: 'progress', event });
});
