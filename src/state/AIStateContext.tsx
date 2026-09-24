import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

export type AIState = 'idle' | 'listening' | 'thinking' | 'responding' | 'error';
export type AIRunEvent = 'RUN_STARTED' | 'TEXT_MESSAGE_START' | 'RUN_FINISHED' | 'RUN_ERROR';
type AIStateValue = { state: AIState; dispatchRunEvent: (event: AIRunEvent) => void; setComposerFocused: (focused: boolean) => void };
const Context = createContext<AIStateValue | null>(null);

export function AIStateProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AIState>('idle');
  const dispatchRunEvent = useCallback((event: AIRunEvent) => {
    const next: Record<AIRunEvent, AIState> = { RUN_STARTED: 'thinking', TEXT_MESSAGE_START: 'responding', RUN_FINISHED: 'idle', RUN_ERROR: 'error' };
    setState(next[event]);
  }, []);
  const setComposerFocused = useCallback((focused: boolean) => setState((current) => current === 'idle' || current === 'listening' ? (focused ? 'listening' : 'idle') : current), []);
  const value = useMemo(() => ({ state, dispatchRunEvent, setComposerFocused }), [state, dispatchRunEvent, setComposerFocused]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAIState() {
  const value = useContext(Context);
  if (!value) throw new Error('useAIState must be used inside AIStateProvider');
  return value;
}
