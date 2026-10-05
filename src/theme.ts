import { Platform } from 'react-native';

export const colors = {
  // Nura's in-app palette stays cocoa brown with warm glass and soft editorial accents.
  // `canvas` is the light frame around the simulated phone on web; route backgrounds use `bg`.
  canvas: '#D9C2E2', bg: '#211A17', bg2: '#30221D', surface: 'rgba(255,246,236,.09)', surfaceStrong: 'rgba(255,239,225,.14)',
  // Shared frosted surfaces use the same translucent warm tint, luminous edge and reading contrast.
  glassSurface: 'rgba(255,246,236,.12)', glassSurfaceStrong: 'rgba(255,239,225,.21)',
  glassBorder: 'rgba(255,226,205,.30)', glassHighlight: 'rgba(255,246,235,.72)',
  border: 'rgba(255,226,205,.26)', text: '#FFF8F0', muted: 'rgba(255,248,240,.78)', quiet: 'rgba(255,235,222,.60)',
  violet: '#D9B9E8', plum: '#4A3458', mauve: '#D0A4B8', lilac: 'rgba(216,194,232,.16)', cobalt: '#1769E8', aqua: '#9FD8D4', bluePale: 'rgba(169,212,227,.15)', mint: 'rgba(159,216,199,.15)', peach: '#F2C5A7',
  accent: 'rgba(242,197,167,.18)', ink: '#FFF8F0', warning: '#FFD097', success: '#9FD8B8', cream: '#FFF8F0', rose: '#D595A9',
} as const;

// Shared scene recipes keep the reference's plum–mauve atmosphere and
// blue–peach–lilac editorial artwork consistent across routes.
export const brandScenes = {
  canvas: {
    colors: ['#D7CFDC', '#E1D1D7', '#F0D8C5'],
    locations: [0, 0.56, 1],
  },
  atmosphere: {
    base: '#211A17',
    colors: ['#1C1715', '#30221D', '#50352B', '#785142', '#3D2C2B'],
    locations: [0, 0.22, 0.49, 0.77, 1],
    peachGlow: 'rgba(234,164,124,0.30)',
    lilacGlow: 'rgba(181,151,195,0.13)',
  },
  home: {
    colors: ['#3D2926', '#705047', '#9A6B68'],
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
