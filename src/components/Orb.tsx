import React from 'react';
import { IntelligenceOrbCanvas } from './ambient/IntelligenceOrbCanvas';
import { AIState, useAIState } from '../state/AIStateContext';

type OrbSize = number | 'sm' | 'md' | 'lg';
const orbSizes = { sm: 36, md: 74, lg: 128 } as const;
export function Orb({ size = 'sm', state }: { size?: OrbSize; state?: AIState }) {
  const { state: appState } = useAIState();
  const diameter = typeof size === 'number' ? size : orbSizes[size];
  return <IntelligenceOrbCanvas size={diameter} state={state ?? appState} />;
}
