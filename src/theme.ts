import { Platform } from 'react-native';

export const colors = {
  // Two connected color modes: immersive plum–rose for Nura-led moments,
  // and visibly lilac paper with warm cards for health records.
  // Keep enough separation between the canvas, cards, and secondary surfaces
  // that the light reading screens do not flatten into one white field.
  bg: '#EDE5EF', bg2: '#E2D7E7', surface: '#FFFBF7', surfaceStrong: '#E8DEEB',
  border: '#D7C9DE', text: '#322936', muted: '#716977', quiet: '#928998',
  violet: '#745487', plum: '#4A3458', mauve: '#A2768E', lilac: '#EDE1F0', cobalt: '#1769E8', aqua: '#2B8178', bluePale: '#EAF2FF', mint: '#E5F2EA', peach: '#F2DDD0',
  accent: '#EADDED', ink: '#322936', warning: '#A76217', success: '#2E7955', cream: '#FFF8F0', rose: '#B47D92',
} as const;

// Shared scene recipes keep the reference's plum–mauve atmosphere and
// blue–peach–lilac editorial artwork consistent across routes.
export const brandScenes = {
  atmosphere: {
    base: '#30213C',
    colors: ['#48335C', '#65466F', '#89647F', '#B27D91', '#453152'],
    locations: [0, 0.23, 0.5, 0.77, 1],
    peachGlow: 'rgba(243,183,155,0.30)',
    lilacGlow: 'rgba(184,157,222,0.27)',
  },
  home: {
    colors: ['#49345D', '#8C627F', '#B98295'],
    locations: [0, 0.56, 1],
  },
  feed: {
    colors: ['#C0DDF2', '#EBC3B6', '#7C7199'],
  },
} as const;

// Node, halo, connecting line, and label use the same category hue.
export const timelineColors = {
  record: { node: '#1769E8', pale: '#EAF2FF', line: '#AEC7F2', accent: '#285EA8' },
  care: { node: '#8B68A2', pale: '#F1EAF4', line: '#C7B1D1', accent: '#6C4F7D' },
  treatment: { node: '#BD745C', pale: '#F9ECE6', line: '#E2BCAC', accent: '#96533E' },
  vitals: { node: '#34847D', pale: '#E5F2EF', line: '#A5CDC6', accent: '#286A65' },
  life: { node: '#718B68', pale: '#EBF1E8', line: '#B8C9B2', accent: '#536B4D' },
  topic: { node: '#87688E', pale: '#F0E9F1', line: '#CBB6CE', accent: '#6C4D74' },
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
