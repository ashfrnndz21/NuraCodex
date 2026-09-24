import React from 'react';
import { IntelligenceOrbCanvas } from './ambient/IntelligenceOrbCanvas.native';
import type { AIState } from '../state/AIStateContext';
import { useAIState } from '../state/AIStateContext';

type OrbSize = number | 'sm' | 'md' | 'lg';
const sizes = { sm: 36, md: 74, lg: 128 } as const;
export function Orb({ size = 'sm', state }: { size?: OrbSize; state?: AIState }) {
  const { state: appState } = useAIState();
  return <IntelligenceOrbCanvas size={typeof size === 'number' ? size : sizes[size]} state={state ?? appState} />;
}
