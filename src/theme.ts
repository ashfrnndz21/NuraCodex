import { Platform } from 'react-native';

export const colors = {
  // Nura has two deliberate color worlds: atmospheric plum for Nura-led
  // moments, and quiet paper for reading records and trusted health content.
  bg: '#F6F4F6', bg2: '#EEE9F0', surface: '#FFFCF8', surfaceStrong: '#F2ECF4',
  border: '#E1D7E4', text: '#302733', muted: '#716875', quiet: '#9A909F',
  violet: '#705179', plum: '#493452', mauve: '#946F89', lilac: '#EFE5F0', cobalt: '#1767D8', aqua: '#1767D8', mint: '#E4F0E6', peach: '#F0D9CD',
  accent: '#EDE2EF', ink: '#302733', warning: '#A96518', success: '#287954', cream: '#FFF8F0', rose: '#B98191',
} as const;

// Shared scene recipes keep the reference's plum–mauve atmosphere and
// blue–peach–lilac editorial artwork consistent across routes.
export const brandScenes = {
  atmosphere: {
    base: '#24182F',
    colors: ['#49365F', '#765777', '#87647F', '#765777', '#24182F'],
    locations: [0, 0.28, 0.5, 0.72, 1],
    peachGlow: 'rgba(237,180,145,0.28)',
    lilacGlow: 'rgba(162,135,205,0.23)',
  },
  home: {
    colors: ['#49365F', '#765777', '#9A7187'],
    locations: [0, 0.56, 1],
  },
  feed: {
    colors: ['#BFD8EF', '#E8C1B5', '#796D98'],
  },
} as const;

// A restrained, category-led palette keeps health history colorful and legible.
export const timelineColors = {
  record: { node: '#4D70C7', pale: '#E9EFFA', line: '#A8B9E3', accent: '#405FA8' },
  care: { node: '#9A718F', pale: '#F3E9F1', line: '#CFB6C9', accent: '#78566F' },
  treatment: { node: '#C58250', pale: '#FAEEE4', line: '#E3BE9D', accent: '#98623D' },
  vitals: { node: '#398A83', pale: '#E4F2EF', line: '#A2CDC6', accent: '#286C67' },
  life: { node: '#778F6B', pale: '#EAF1E6', line: '#B7C8AC', accent: '#556D4C' },
  topic: { node: '#85628D', pale: '#F1E8F2', line: '#CEB9D1', accent: '#704F78' },
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
