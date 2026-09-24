import { Platform } from 'react-native';

export const colors = {
  bg: '#F7F6F8', bg2: '#EFEDF2', surface: '#FFFFFF', surfaceStrong: '#F2F0F5',
  border: '#E4E1E8', text: '#292731', muted: '#6E6B76', quiet: '#96929D',
  violet: '#76629A', lilac: '#F0EAF5', aqua: '#1767D8', mint: '#DDF2E8', peach: '#F4E1D7',
  accent: '#E9E1F0', ink: '#292731', warning: '#A96518', success: '#287954', cream: '#FBF9F7', rose: '#B97880',
} as const;
export const spacing = { xs: 6, sm: 10, md: 16, lg: 22, xl: 30, xxl: 42 } as const;
export const radius = { sm: 14, md: 20, lg: 28, pill: 999 } as const;
// Shared timings from Nura-Blueprint-v2.html.
export const motion = {
  pressScale: 0.985, pressIn: 100, pressOut: 260,
  fast: 140, quick: 140, standard: 320, slow: 560,
  cardEnter: 520, sheetEnter: 550, wordEnter: 560,
  statusIn: 350, statusOut: 220, shimmer: 1500,
  breathe: 4500, drift: 16000, driftSlow: 20000, bob: 6000,
  orb: { idle: 7000, listening: 3400, thinking: 2200, responding: 4200 },
  stagger: { dense: 80, rows: 110, tight: 150, mid: 200, step: 230, wide: 260, cards: 300 },
  chartDraw: 900, countUp: 1100, alarmReveal: 60, mediaRun: 9000, atmosphereFade: 800,
  stream: { head: 85, sub: 50, body: 36, sheet: 58, spoken: 210 },
  wordHold: 220, thinkHold: 1050, thinkPage: 430, busyHold: 950, beat: 700, autoPick: 1200, userPick: 6000,
  easing: {
    gentle: [0.22, 0.61, 0.36, 1] as const,
    standard: [0.2, 0.8, 0.2, 1] as const,
    bouncy: [0.34, 1.42, 0.5, 1] as const,
  },
} as const;
export const shadow = Platform.select({ ios: { shadowColor: '#343040', shadowOpacity: 0.06, shadowRadius: 18, shadowOffset: { width: 0, height: 7 } }, android: { elevation: 2 }, default: {} });
