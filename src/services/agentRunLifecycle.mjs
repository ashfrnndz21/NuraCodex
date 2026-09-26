/** Keeps an answer provisional until the server confirms the run completed. */
export function createAgentRunEventGate() {
  let terminal = false;
  let sawFinish = false;
  let pendingAnswer = null;

  return {
    receive(event) {
      if (terminal) return { kind: 'ignored' };
      if (sawFinish && event?.type !== 'run_error') return { kind: 'ignored' };

      if (event?.type === 'answer') {
        pendingAnswer = {
          answer: event.answer,
          citations: event.citations,
          unknowns: event.unknowns,
          nextSteps: event.nextSteps,
          coverageAssessments: event.coverageAssessments,
          memoryProposal: event.memoryProposal,
        };
        return { kind: 'pending' };
      }

      if (event?.type === 'run_finished') {
        sawFinish = true;
        return { kind: 'pending_finish' };
      }

      if (event?.type === 'run_error') {
        terminal = true;
        pendingAnswer = null;
        return { kind: 'failed', message: event.message || 'Nura could not complete this answer. Please try again.' };
      }

      return { kind: 'progress', event };
    },

    cancel(message = 'This run was stopped. You can try again when you’re ready.') {
      if (terminal) return { kind: 'ignored' };
      terminal = true;
      pendingAnswer = null;
      return { kind: 'failed', message };
    },

    completeTransport() {
      if (terminal) return { kind: 'ignored' };
      terminal = true;
      if (!sawFinish || !pendingAnswer) return { kind: 'failed', message: 'Nura could not finish this answer. Please try again.' };
      const answer = pendingAnswer;
      pendingAnswer = null;
      return { kind: 'complete', answer };
    },
  };
}
