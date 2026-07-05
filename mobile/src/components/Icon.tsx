/**
 * Monochrome outline icons (stroke = currentColor equivalent). Paths ported
 * verbatim from the PWA's ICONS registry so glyphs match the web app.
 */
import React from 'react';
import Svg, { Circle, Path, Polyline, Rect } from 'react-native-svg';

export type IconName =
  | 'heartPulse' | 'wind' | 'droplet' | 'gauge' | 'info' | 'download' | 'upload'
  | 'x' | 'check' | 'edit' | 'bike' | 'footprints' | 'legsUp' | 'activity'
  | 'heart' | 'target' | 'barbell' | 'car' | 'flame' | 'zap' | 'pill' | 'alert'
  | 'sparkles' | 'rocket' | 'moon' | 'user' | 'chevron' | 'chevronRight'
  | 'arrowLeft' | 'standing' | 'poop' | 'cup' | 'utensils' | 'scale' | 'search'
  | 'bulb' | 'star' | 'brain' | 'virus' | 'clipboard' | 'smile' | 'ai' | 'chart'
  | 'trendUp' | 'trendDown' | 'triangle' | 'checklist' | 'cell' | 'gut'
  | 'bluetooth' | 'watch' | 'plus' | 'trash' | 'settings' | 'sun' | 'play' | 'stop';

const P: Record<IconName, string[]> = {
  heartPulse: ['M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z', 'M3.22 12H9.5l.6-1.3 1.9 4.6 2-7 1.5 3.7h5.27'],
  wind: ['M12.8 19.6A2 2 0 1 0 14 16H2', 'M17.5 8a2.5 2.5 0 1 1 2 4H2', 'M9.8 4.4A2 2 0 1 1 11 8H2'],
  droplet: ['M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z'],
  gauge: ['m12 14 4-4', 'M3.34 19a10 10 0 1 1 17.32 0'],
  info: ['M12 16v-4', 'M12 8h.01'],
  download: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'],
  upload: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M17 8l-5-5-5 5', 'M12 3v12'],
  x: ['M18 6 6 18', 'm6 6 12 12'],
  check: ['M20 6 9 17l-5-5'],
  edit: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z'],
  bike: ['M12 17.5V14l-3-3 4-3 2 3h2'],
  footprints: ['M4 16v-2.4C4 11.5 3 10.5 3 8c0-2.7 1.5-6 4.5-6C9.4 2 10 3.8 10 5.5c0 3.1-2 5.7-2 8.7V16a2 2 0 1 1-4 0Z', 'M20 20v-2.4c0-2.1 1-3.1 1-5.6 0-2.7-1.5-6-4.5-6C14.6 6 14 7.8 14 9.5c0 3.1 2 5.7 2 8.7V20a2 2 0 1 0 4 0Z', 'M16 17h4', 'M4 13h4'],
  legsUp: ['M8 12l4-4 4 4', 'M12 16V8'],
  activity: ['M22 12h-4l-3 9L9 3l-3 9H2'],
  heart: ['M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z'],
  target: [],
  barbell: ['M4 9v6', 'M7 7v10', 'M17 7v10', 'M20 9v6', 'M7 12h10'],
  car: ['M5 13l1.5-4.5A2 2 0 0 1 8.4 7h7.2a2 2 0 0 1 1.9 1.5L19 13', 'M5 13h14a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1', 'M6 18H5a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1'],
  flame: ['M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z'],
  zap: ['M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z'],
  pill: ['m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z', 'm8.5 8.5 7 7'],
  alert: ['M12 8v4', 'M12 16h.01'],
  sparkles: ['M12 3l1.6 4.6L18 9.2l-4.4 1.6L12 15.4l-1.6-4.6L6 9.2l4.4-1.6z', 'M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8z'],
  rocket: ['M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z', 'm12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z', 'M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0', 'M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5'],
  moon: ['M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z'],
  user: ['M4 21a8 8 0 0 1 16 0'],
  chevron: ['m6 9 6 6 6-6'],
  chevronRight: ['m9 18 6-6-6-6'],
  arrowLeft: ['M19 12H5', 'm12 19-7-7 7-7'],
  standing: ['m9 20 3-6 3 6', 'm6 9 6 2 6-2', 'M12 11v3'],
  poop: ['M7.5 21h9a3 3 0 0 0 1.6-5.5A3 3 0 0 0 16 10a3 3 0 0 0-3-4 3 3 0 0 0-2 .8A3 3 0 0 0 8 10a3 3 0 0 0-2.1 5.5A3 3 0 0 0 7.5 21Z', 'M10.5 15h.01', 'M13.5 15h.01'],
  cup: ['M6 3h12l-1.1 15.3a2 2 0 0 1-2 1.7H9.1a2 2 0 0 1-2-1.7L6 3Z', 'M6.5 9.5h11'],
  utensils: ['M3 2v7c0 1.1.9 2 2 2h0c1.1 0 2-.9 2-2V2', 'M5 11v11', 'M19 2c-1.7 0-3 1.8-3 4v5h3', 'M19 2v20'],
  scale: ['M12 3v18', 'M7 21h10', 'M5 7h14', 'M5 7l-3 6a3 3 0 0 0 6 0z', 'M19 7l3 6a3 3 0 0 1-6 0z'],
  search: ['m21 21-4.3-4.3'],
  bulb: ['M9 18h6', 'M10 21h4', 'M12 3a6 6 0 0 0-4 10.5c.6.6 1 1.3 1 2.1V16h6v-.4c0-.8.4-1.5 1-2.1A6 6 0 0 0 12 3z'],
  star: ['M12 3l2.7 5.5 6 .9-4.3 4.2 1 6L12 17l-5.4 2.6 1-6L3.3 9.4l6-.9z'],
  brain: ['M9.5 4a2.5 2.5 0 0 0-2.5 2.5 2.5 2.5 0 0 0-1 4.8A2.5 2.5 0 0 0 7 16a2.5 2.5 0 0 0 5 .5V5.5A1.5 1.5 0 0 0 10.5 4z', 'M14.5 4a2.5 2.5 0 0 1 2.5 2.5 2.5 2.5 0 0 1 1 4.8A2.5 2.5 0 0 1 17 16a2.5 2.5 0 0 1-5 .5'],
  virus: ['M12 2v3', 'M12 19v3', 'M2 12h3', 'M19 12h3', 'm5 5 2 2', 'm17 17 2 2', 'm19 5-2 2', 'm7 17-2 2'],
  clipboard: ['M9 4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1H9z', 'M9 11h6', 'M9 15h4'],
  smile: ['M8 14s1.5 2 4 2 4-2 4-2', 'M9 9h.01', 'M15 9h.01'],
  ai: ['M12 3l1.4 4.1L17.5 8l-3.6 1.4L12 13l-1.9-3.6L6.5 8l4.1-.9z', 'M18.5 14l.8 2.3 2.2.8-2.2.8-.8 2.3-.8-2.3-2.2-.8 2.2-.8z', 'M5 15l.6 1.6L7 17l-1.4.4L5 19l-.6-1.6L3 17l1.4-.4z'],
  chart: ['M8 16v-4', 'M12 16V8', 'M16 16v-6'],
  trendUp: ['M3 17l6-6 4 4 7-7', 'M17 7h4v4'],
  trendDown: ['M3 7l6 6 4-4 7 7', 'M17 17h4v-4'],
  triangle: ['M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z', 'M12 9v4', 'M12 17h.01'],
  checklist: ['M3 5h2l1 1 2-2', 'M3 12h2l1 1 2-2', 'M3 19h2l1 1 2-2', 'M12 5h9', 'M12 12h9', 'M12 19h9'],
  cell: ['M12 3v3', 'M12 18v3', 'M3 12h3', 'M18 12h3'],
  gut: ['M6 3v5a4 4 0 0 0 4 4h2a3 3 0 0 1 0 6H9', 'M6 3H4', 'M6 3h2'],
  bluetooth: ['m7 7 10 10-5 5V2l5 5L7 17'],
  watch: ['M9 2h6l1 5', 'M15 22H9l-1-5'],
  plus: ['M12 5v14', 'M5 12h14'],
  trash: ['M3 6h18', 'M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2', 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6'],
  settings: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.17V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 3.6 14H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 8a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 3.6V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 2.4 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 20.4 9H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z'],
  sun: ['M12 1v2', 'M12 21v2', 'M4.2 4.2l1.4 1.4', 'M18.4 18.4l1.4 1.4', 'M1 12h2', 'M21 12h2', 'M4.2 19.8l1.4-1.4', 'M18.4 5.6l1.4-1.4'],
  play: ['M6 4l14 8-14 8z'],
  stop: [],
};

// Icons that need extra <circle>/<rect> elements beyond the path list.
const EXTRAS: Partial<Record<IconName, React.ReactNode>> = {};

export function Icon({ name, size = 22, color = '#000', strokeWidth = 1.9 }: { name: IconName; size?: number; color?: string; strokeWidth?: number }) {
  const common = { stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'bike' && (<><Circle cx={18.5} cy={17.5} r={3.5} {...common} /><Circle cx={5.5} cy={17.5} r={3.5} {...common} /><Circle cx={15} cy={5} r={1} {...common} /></>)}
      {name === 'gut' && <Circle cx={8} cy={20} r={1} {...common} />}
      {name === 'target' && (<><Circle cx={12} cy={12} r={9} {...common} /><Circle cx={12} cy={12} r={4} {...common} /></>)}
      {name === 'gauge' && null}
      {name === 'info' && <Circle cx={12} cy={12} r={10} {...common} />}
      {name === 'standing' && <Circle cx={12} cy={4} r={1.5} {...common} />}
      {name === 'legsUp' && <Circle cx={12} cy={12} r={9} {...common} />}
      {name === 'user' && <Circle cx={12} cy={8} r={4} {...common} />}
      {name === 'smile' && <Circle cx={12} cy={12} r={9} {...common} />}
      {name === 'alert' && <Circle cx={12} cy={12} r={9} {...common} />}
      {name === 'virus' && (<><Circle cx={12} cy={12} r={5} {...common} /></>)}
      {name === 'cell' && (<><Circle cx={12} cy={12} r={9} {...common} /><Circle cx={12} cy={12} r={3} {...common} /></>)}
      {name === 'clipboard' && <Rect x={5} y={4} width={14} height={17} rx={2} {...common} />}
      {name === 'chart' && <Rect x={3} y={3} width={18} height={18} rx={2} {...common} />}
      {name === 'watch' && <Rect x={7} y={7} width={10} height={10} rx={2} {...common} />}
      {name === 'stop' && <Rect x={6} y={6} width={12} height={12} rx={2} {...common} />}
      {EXTRAS[name]}
      {P[name].map((d, i) => (<Path key={i} d={d} {...common} />))}
    </Svg>
  );
}

/** The Autonomic brand mark (waveform). */
export function BrandMark({ size = 26, color = ACCENT_MARK }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 512 512">
      <Polyline
        points="41,266 179,266 200,225 220,307 246,92 272,420 297,240 317,266 471,266"
        fill="none" stroke={color} strokeWidth={38} strokeLinejoin="round" strokeLinecap="round"
      />
    </Svg>
  );
}
const ACCENT_MARK = '#e03127';
