import type { AgentAnswer, AgentEvent } from './agentClient';

export type AgentRunGateResult =
  | { kind: 'ignored' }
  | { kind: 'pending' }
  | { kind: 'progress'; event: Exclude<AgentEvent, { type: 'answer' | 'run_finished' | 'run_error' }> }
  | { kind: 'complete'; answer: AgentAnswer }
  | { kind: 'failed'; message: string };

export declare function createAgentRunEventGate(): {
  receive(event: AgentEvent): AgentRunGateResult;
  cancel(message?: string): AgentRunGateResult;
};
