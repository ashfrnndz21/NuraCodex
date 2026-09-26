import type { AgentAnswer, AgentEvent } from './agentClient';

export type AgentRunGateResult =
  | { kind: 'ignored' }
  | { kind: 'pending' }
  | { kind: 'pending_finish' }
  | { kind: 'progress'; event: Exclude<AgentEvent, { type: 'answer' | 'run_finished' | 'run_error' }> }
  | { kind: 'complete'; answer: AgentAnswer }
  | { kind: 'failed'; message: string };
export type AgentRunReceiveResult = Exclude<AgentRunGateResult, { kind: 'complete' }>;

export declare function createAgentRunEventGate(): {
  receive(event: AgentEvent): AgentRunReceiveResult;
  cancel(message?: string): AgentRunGateResult;
  completeTransport(): AgentRunGateResult;
};
