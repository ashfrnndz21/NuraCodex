import React from 'react';
import type { AIState } from '../../state/AIStateContext';

const durations: Record<AIState, string> = { idle: '7s', listening: '3.4s', thinking: '2.2s', responding: '4.2s', error: '7s' };
const HtmlDiv = 'div' as unknown as React.ComponentType<React.PropsWithChildren<Record<string, unknown>>>;

/** Web renderer ports the blueprint's original conic-gradient orb CSS. */
export function IntelligenceOrbCanvas({ size, state }: { size: number; state: AIState }) {
  const duration = durations[state];
  const glow = state === 'listening' ? 0.32 : state === 'thinking' ? 0.4 : state === 'responding' ? 0.34 : state === 'error' ? 0.12 : 0.22;
  const stops = state === 'error' ? '#d6ccd9,#b9acbf,#8a7c96,#c7b8b4,#a7a8b4,#d6ccd9' : '#fbe3cf,#c9a9e8,#6f4fc4,#f0b48f,#9fd0ff,#fbe3cf';
  return <HtmlDiv role="img" aria-label={`Nura is ${state}`} data-state={state} style={{ width: size * 1.7, height: size * 1.7, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', flexShrink: 0 }}>
    <HtmlDiv aria-hidden="true" style={{ position: 'absolute', width: size * 1.35, height: size * 1.35, borderRadius: '50%', background: `rgba(201,169,232,${glow})`, filter: `blur(${size * 0.5}px)`, animation: state === 'thinking' ? `nura-halo ${duration} ease-in-out infinite` : 'none' }} />
    <HtmlDiv aria-hidden="true" style={{ position: 'relative', flexShrink: 0, width: size, height: size, borderRadius: '50%', overflow: 'hidden', boxShadow: state === 'error' ? '0 0 9px rgba(170,158,186,.22), inset 0 0 8px rgba(255,255,255,.24)' : `0 0 ${size >= 100 ? 34 : state === 'listening' ? 18 : 11}px rgba(201,169,232,${state === 'idle' ? '.36' : '.56'}), inset 0 0 ${size >= 100 ? 22 : 8}px rgba(255,255,255,.34)`, animation: state === 'error' ? 'none' : `nura-breathe ${duration} ease-in-out infinite` }}>
      <HtmlDiv style={{ position: 'absolute', top: '-30%', left: '-30%', width: '160%', height: '160%', borderRadius: '50%', background: `conic-gradient(from 0deg,${stops})`, animation: state === 'error' ? 'none' : `nura-sweep ${duration} linear infinite` }} />
      <HtmlDiv style={{ position: 'absolute', left: '20%', top: '14%', width: '27%', height: '27%', borderRadius: '50%', background: 'rgba(255,255,255,.5)', filter: `blur(${size >= 100 ? 7 : 2}px)` }} />
      <HtmlDiv style={{ position: 'absolute', inset: '-18%', borderRadius: '50%', border: '1px solid rgba(201,169,232,.7)', opacity: state === 'error' ? 0.4 : state === 'idle' ? 0 : 0.7, animation: state === 'listening' ? `nura-halo ${duration} cubic-bezier(.22,.61,.36,1) infinite` : state === 'thinking' ? `nura-pulse ${duration} ease-in-out infinite` : state === 'responding' ? `nura-wave ${duration} cubic-bezier(.22,.61,.36,1) infinite` : 'none' }} />
    </HtmlDiv>
    <HtmlDiv aria-hidden="true" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}><style>{`@keyframes nura-sweep{to{transform:rotate(360deg)}}@keyframes nura-breathe{50%{transform:scale(1.04)}}@keyframes nura-halo{0%{opacity:.75;transform:scale(.92)}70%,100%{opacity:0;transform:scale(1.3)}}@keyframes nura-pulse{0%,100%{opacity:.22;transform:scale(.94)}50%{opacity:.6;transform:scale(1.16)}}@keyframes nura-wave{0%{opacity:.6;transform:scale(.94)}55%,100%{opacity:0;transform:scale(1.24)}}@media(prefers-reduced-motion:reduce){[data-state] *{animation:none!important;transition:none!important}}`}</style></HtmlDiv>
  </HtmlDiv>;
}
