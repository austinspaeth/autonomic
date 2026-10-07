/* Dark only: this is a phone-in-hand glance app, and the product itself is
   pure black. Series colours follow the web dashboard's so iOS is the same
   blue and Android the same lime in both places. */
export const C = {
  bg: '#000000',
  surface: '#141416',
  surface2: '#1f1f22',
  hairline: 'rgba(255,255,255,0.08)',
  text: '#f5f5f7',
  dim: '#a1a1a8',
  muted: '#6c6c72',
  accent: '#e03127',
  up: '#30d158',
  down: '#ff453a',
  gold: '#eab308',
  /* The fill for any single-series chart: a saturated royal blue, deeper than
     the iOS store blue so the two stay distinct when they share a card. */
  series: '#2563eb',
  ios: '#3987e5',
  android: '#6aa80f',
  unknown: '#5a5a60',
  grid: '#26262a',
} as const;

export const R = { card: 22, tile: 16, pill: 999 } as const;

export const num = { fontVariant: ['tabular-nums' as const] };
