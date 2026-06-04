// Icon registry — inline SVG ported to react-native-svg. Monochrome icons use
// `color` (stroke="currentColor" in the legacy markup). Seeded here with the
// app-shell icons; the full ICONS map (docs/index.html:1397-1447) is ported
// alongside the sections that use it.
import React from 'react';
import Svg, { Path, Polyline, Rect, Circle } from 'react-native-svg';

export interface IconProps {
  size?: number;
  color?: string;
}

type IconComponent = (props: Required<IconProps>) => React.ReactElement;

const stroke = {
  fill: 'none',
  strokeWidth: 1.9,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export const ICONS: Record<string, IconComponent> = {
  // Brand mark — ECG-style waveform (legacy .brand-mark, viewBox 512).
  brand: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 512 512">
      <Polyline
        points="41,266 179,266 200,225 220,307 246,92 272,420 297,240 317,266 471,266"
        fill="none"
        stroke={color}
        strokeWidth={38}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  ),
  // Tab: Journal (notebook).
  journal: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M5 4a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z"
        stroke={color}
        {...stroke}
      />
      <Path d="M5 7h13" stroke={color} {...stroke} />
      <Path d="M9 12h6" stroke={color} {...stroke} />
      <Path d="M9 16h4" stroke={color} {...stroke} />
    </Svg>
  ),
  // Tab: Analysis (bar chart).
  analysis: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 20h16" stroke={color} {...stroke} />
      <Path d="M6 20v-6" stroke={color} {...stroke} />
      <Path d="M12 20V8" stroke={color} {...stroke} />
      <Path d="M18 20v-9" stroke={color} {...stroke} />
    </Svg>
  ),
  // Tab: Milestones (podium).
  milestones: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M5 22V4" stroke={color} {...stroke} />
      <Rect x={5} y={4} width={14} height={10} stroke={color} {...stroke} />
      <Rect x={5} y={4} width={4.67} height={5} fill={color} stroke="none" />
      <Rect x={14.33} y={4} width={4.67} height={5} fill={color} stroke="none" />
      <Rect x={9.67} y={9} width={4.66} height={5} fill={color} stroke="none" />
    </Svg>
  ),
  // Tab: Insights / AI (sparkles).
  insights: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 3l1.5 4.4L18 9l-4.5 1.6L12 15l-1.5-4.4L6 9l4.5-1.6z" stroke={color} {...stroke} />
      <Path d="M18.5 14.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" stroke={color} {...stroke} />
    </Svg>
  ),
  // Topbar: menu (hamburger).
  menu: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 7h16" stroke={color} {...stroke} />
      <Path d="M4 12h16" stroke={color} {...stroke} />
      <Path d="M4 17h16" stroke={color} {...stroke} />
    </Svg>
  ),
  // Topbar: theme toggle — moon (shown in light mode).
  moon: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke={color} {...stroke} />
    </Svg>
  ),
  // Topbar: theme toggle — sun (shown in dark mode).
  sun: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 4v2M12 18v2M4 12H2M22 12h-2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"
        stroke={color}
        {...stroke}
      />
      <Path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" stroke={color} {...stroke} />
    </Svg>
  ),
  // Sheet close (✕).
  x: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M18 6 6 18" stroke={color} {...stroke} />
      <Path d="m6 6 12 12" stroke={color} {...stroke} />
    </Svg>
  ),
  // Sheet header action (pencil / edit).
  edit: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 20h9" stroke={color} {...stroke} />
      <Path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" stroke={color} {...stroke} />
    </Svg>
  ),
  // Menu: profile.
  user: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={8} r={4} stroke={color} {...stroke} />
      <Path d="M4 21a8 8 0 0 1 16 0" stroke={color} {...stroke} />
    </Svg>
  ),
  // Menu: export.
  download: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke={color} {...stroke} />
      <Path d="M7 10l5 5 5-5" stroke={color} {...stroke} />
      <Path d="M12 15V3" stroke={color} {...stroke} />
    </Svg>
  ),
  // Menu: import.
  upload: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke={color} {...stroke} />
      <Path d="M17 8l-5-5-5 5" stroke={color} {...stroke} />
      <Path d="M12 3v12" stroke={color} {...stroke} />
    </Svg>
  ),

  // ---- Ported from legacy ICONS map (docs/index.html) ----
  heartPulse: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" stroke={color} {...stroke} />
      <Path d="M3.22 12H9.5l.6-1.3 1.9 4.6 2-7 1.5 3.7h5.27" stroke={color} {...stroke} />
    </Svg>
  ),
  wind: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12.8 19.6A2 2 0 1 0 14 16H2" stroke={color} {...stroke} />
      <Path d="M17.5 8a2.5 2.5 0 1 1 2 4H2" stroke={color} {...stroke} />
      <Path d="M9.8 4.4A2 2 0 1 1 11 8H2" stroke={color} {...stroke} />
    </Svg>
  ),
  droplet: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z" stroke={color} {...stroke} />
    </Svg>
  ),
  gauge: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="m12 14 4-4" stroke={color} {...stroke} />
      <Path d="M3.34 19a10 10 0 1 1 17.32 0" stroke={color} {...stroke} />
    </Svg>
  ),
  info: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={10} stroke={color} {...stroke} />
      <Path d="M12 16v-4" stroke={color} {...stroke} />
      <Path d="M12 8h.01" stroke={color} {...stroke} />
    </Svg>
  ),
  check: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M20 6 9 17l-5-5" stroke={color} {...stroke} />
    </Svg>
  ),
  bike: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={18.5} cy={17.5} r={3.5} stroke={color} {...stroke} />
      <Circle cx={5.5} cy={17.5} r={3.5} stroke={color} {...stroke} />
      <Circle cx={15} cy={5} r={1} stroke={color} {...stroke} />
      <Path d="M12 17.5V14l-3-3 4-3 2 3h2" stroke={color} {...stroke} />
    </Svg>
  ),
  footprints: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 16v-2.4C4 11.5 3 10.5 3 8c0-2.7 1.5-6 4.5-6C9.4 2 10 3.8 10 5.5c0 3.1-2 5.7-2 8.7V16a2 2 0 1 1-4 0Z" stroke={color} {...stroke} />
      <Path d="M20 20v-2.4c0-2.1 1-3.1 1-5.6 0-2.7-1.5-6-4.5-6C14.6 6 14 7.8 14 9.5c0 3.1 2 5.7 2 8.7V20a2 2 0 1 0 4 0Z" stroke={color} {...stroke} />
      <Path d="M16 17h4" stroke={color} {...stroke} />
      <Path d="M4 13h4" stroke={color} {...stroke} />
    </Svg>
  ),
  legsUp: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={9} stroke={color} {...stroke} />
      <Path d="M8 12l4-4 4 4" stroke={color} {...stroke} />
      <Path d="M12 16V8" stroke={color} {...stroke} />
    </Svg>
  ),
  activity: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke={color} {...stroke} />
    </Svg>
  ),
  heart: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" stroke={color} {...stroke} />
    </Svg>
  ),
  target: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={9} stroke={color} {...stroke} />
      <Circle cx={12} cy={12} r={4} stroke={color} {...stroke} />
    </Svg>
  ),
  barbell: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 9v6" stroke={color} {...stroke} />
      <Path d="M7 7v10" stroke={color} {...stroke} />
      <Path d="M17 7v10" stroke={color} {...stroke} />
      <Path d="M20 9v6" stroke={color} {...stroke} />
      <Path d="M7 12h10" stroke={color} {...stroke} />
    </Svg>
  ),
  car: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M5 13l1.5-4.5A2 2 0 0 1 8.4 7h7.2a2 2 0 0 1 1.9 1.5L19 13" stroke={color} {...stroke} />
      <Path d="M5 13h14a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1" stroke={color} {...stroke} />
      <Path d="M6 18H5a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1" stroke={color} {...stroke} />
      <Circle cx={8} cy={18} r={1.5} stroke={color} {...stroke} />
      <Circle cx={16} cy={18} r={1.5} stroke={color} {...stroke} />
    </Svg>
  ),
  flame: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z" stroke={color} {...stroke} />
    </Svg>
  ),
  zap: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" stroke={color} {...stroke} />
    </Svg>
  ),
  pill: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" stroke={color} {...stroke} />
      <Path d="m8.5 8.5 7 7" stroke={color} {...stroke} />
    </Svg>
  ),
  alert: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={9} stroke={color} {...stroke} />
      <Path d="M12 8v4" stroke={color} {...stroke} />
      <Path d="M12 16h.01" stroke={color} {...stroke} />
    </Svg>
  ),
  sparkles: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 3l1.6 4.6L18 9.2l-4.4 1.6L12 15.4l-1.6-4.6L6 9.2l4.4-1.6z" stroke={color} {...stroke} />
      <Path d="M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8z" stroke={color} {...stroke} />
    </Svg>
  ),
  rocket: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" stroke={color} {...stroke} />
      <Path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" stroke={color} {...stroke} />
      <Path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" stroke={color} {...stroke} />
      <Path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" stroke={color} {...stroke} />
    </Svg>
  ),
  chevron: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="m6 9 6 6 6-6" stroke={color} {...stroke} />
    </Svg>
  ),
  arrowLeft: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M19 12H5" stroke={color} {...stroke} />
      <Path d="m12 19-7-7 7-7" stroke={color} {...stroke} />
    </Svg>
  ),
  standing: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={4} r={1.5} stroke={color} {...stroke} />
      <Path d="m9 20 3-6 3 6" stroke={color} {...stroke} />
      <Path d="m6 9 6 2 6-2" stroke={color} {...stroke} />
      <Path d="M12 11v3" stroke={color} {...stroke} />
    </Svg>
  ),
  poop: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M7.5 21h9a3 3 0 0 0 1.6-5.5A3 3 0 0 0 16 10a3 3 0 0 0-3-4 3 3 0 0 0-2 .8A3 3 0 0 0 8 10a3 3 0 0 0-2.1 5.5A3 3 0 0 0 7.5 21Z" stroke={color} {...stroke} />
      <Path d="M10.5 15h.01" stroke={color} {...stroke} />
      <Path d="M13.5 15h.01" stroke={color} {...stroke} />
    </Svg>
  ),
  cup: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6 3h12l-1.1 15.3a2 2 0 0 1-2 1.7H9.1a2 2 0 0 1-2-1.7L6 3Z" stroke={color} {...stroke} />
      <Path d="M6.5 9.5h11" stroke={color} {...stroke} />
    </Svg>
  ),
  utensils: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3 2v7c0 1.1.9 2 2 2h0c1.1 0 2-.9 2-2V2" stroke={color} {...stroke} />
      <Path d="M5 11v11" stroke={color} {...stroke} />
      <Path d="M19 2c-1.7 0-3 1.8-3 4v5h3" stroke={color} {...stroke} />
      <Path d="M19 2v20" stroke={color} {...stroke} />
    </Svg>
  ),
  ai: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 3l1.4 4.1L17.5 8l-3.6 1.4L12 13l-1.9-3.6L6.5 8l4.1-.9z" stroke={color} {...stroke} />
      <Path d="M18.5 14l.8 2.3 2.2.8-2.2.8-.8 2.3-.8-2.3-2.2-.8 2.2-.8z" stroke={color} {...stroke} />
      <Path d="M5 15l.6 1.6L7 17l-1.4.4L5 19l-.6-1.6L3 17l1.4-.4z" stroke={color} {...stroke} />
    </Svg>
  ),
  chart: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={3} y={3} width={18} height={18} rx={2} stroke={color} {...stroke} />
      <Path d="M8 16v-4" stroke={color} {...stroke} />
      <Path d="M12 16V8" stroke={color} {...stroke} />
      <Path d="M16 16v-6" stroke={color} {...stroke} />
    </Svg>
  ),
  trendUp: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3 17l6-6 4 4 7-7" stroke={color} {...stroke} />
      <Path d="M17 7h4v4" stroke={color} {...stroke} />
    </Svg>
  ),
  trendDown: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3 7l6 6 4-4 7 7" stroke={color} {...stroke} />
      <Path d="M17 17h4v-4" stroke={color} {...stroke} />
    </Svg>
  ),
  triangle: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" stroke={color} {...stroke} />
      <Path d="M12 9v4" stroke={color} {...stroke} />
      <Path d="M12 17h.01" stroke={color} {...stroke} />
    </Svg>
  ),
  checklist: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M3 5h2l1 1 2-2" stroke={color} {...stroke} />
      <Path d="M3 12h2l1 1 2-2" stroke={color} {...stroke} />
      <Path d="M3 19h2l1 1 2-2" stroke={color} {...stroke} />
      <Path d="M12 5h9" stroke={color} {...stroke} />
      <Path d="M12 12h9" stroke={color} {...stroke} />
      <Path d="M12 19h9" stroke={color} {...stroke} />
    </Svg>
  ),
  cell: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={9} stroke={color} {...stroke} />
      <Circle cx={12} cy={12} r={3} stroke={color} {...stroke} />
      <Path d="M12 3v3" stroke={color} {...stroke} />
      <Path d="M12 18v3" stroke={color} {...stroke} />
      <Path d="M3 12h3" stroke={color} {...stroke} />
      <Path d="M18 12h3" stroke={color} {...stroke} />
    </Svg>
  ),
  gut: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6 3v5a4 4 0 0 0 4 4h2a3 3 0 0 1 0 6H9" stroke={color} {...stroke} />
      <Path d="M6 3H4" stroke={color} {...stroke} />
      <Path d="M6 3h2" stroke={color} {...stroke} />
      <Circle cx={8} cy={20} r={1} stroke={color} {...stroke} />
    </Svg>
  ),
  scale: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 3v18" stroke={color} {...stroke} />
      <Path d="M7 21h10" stroke={color} {...stroke} />
      <Path d="M5 7h14" stroke={color} {...stroke} />
      <Path d="M5 7l-3 6a3 3 0 0 0 6 0z" stroke={color} {...stroke} />
      <Path d="M19 7l3 6a3 3 0 0 1-6 0z" stroke={color} {...stroke} />
    </Svg>
  ),
  search: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={11} cy={11} r={7} stroke={color} {...stroke} />
      <Path d="m21 21-4.3-4.3" stroke={color} {...stroke} />
    </Svg>
  ),
  bulb: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M9 18h6" stroke={color} {...stroke} />
      <Path d="M10 21h4" stroke={color} {...stroke} />
      <Path d="M12 3a6 6 0 0 0-4 10.5c.6.6 1 1.3 1 2.1V16h6v-.4c0-.8.4-1.5 1-2.1A6 6 0 0 0 12 3z" stroke={color} {...stroke} />
    </Svg>
  ),
  star: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 3l2.7 5.5 6 .9-4.3 4.2 1 6L12 17l-5.4 2.6 1-6L3.3 9.4l6-.9z" stroke={color} {...stroke} />
    </Svg>
  ),
  brain: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M9.5 4a2.5 2.5 0 0 0-2.5 2.5 2.5 2.5 0 0 0-1 4.8A2.5 2.5 0 0 0 7 16a2.5 2.5 0 0 0 5 .5V5.5A1.5 1.5 0 0 0 10.5 4z" stroke={color} {...stroke} />
      <Path d="M14.5 4a2.5 2.5 0 0 1 2.5 2.5 2.5 2.5 0 0 1 1 4.8A2.5 2.5 0 0 1 17 16a2.5 2.5 0 0 1-5 .5" stroke={color} {...stroke} />
    </Svg>
  ),
  virus: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={5} stroke={color} {...stroke} />
      <Path d="M12 2v3" stroke={color} {...stroke} />
      <Path d="M12 19v3" stroke={color} {...stroke} />
      <Path d="M2 12h3" stroke={color} {...stroke} />
      <Path d="M19 12h3" stroke={color} {...stroke} />
      <Path d="m5 5 2 2" stroke={color} {...stroke} />
      <Path d="m17 17 2 2" stroke={color} {...stroke} />
      <Path d="m19 5-2 2" stroke={color} {...stroke} />
      <Path d="m7 17-2 2" stroke={color} {...stroke} />
    </Svg>
  ),
  clipboard: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={5} y={4} width={14} height={17} rx={2} stroke={color} {...stroke} />
      <Path d="M9 4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1H9z" stroke={color} {...stroke} />
      <Path d="M9 11h6" stroke={color} {...stroke} />
      <Path d="M9 15h4" stroke={color} {...stroke} />
    </Svg>
  ),
  smile: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={9} stroke={color} {...stroke} />
      <Path d="M8 14s1.5 2 4 2 4-2 4-2" stroke={color} {...stroke} />
      <Path d="M9 9h.01" stroke={color} {...stroke} />
      <Path d="M15 9h.01" stroke={color} {...stroke} />
    </Svg>
  ),
  clock: ({ size, color }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={9} stroke={color} {...stroke} />
      <Path d="M12 7v5l3 2" stroke={color} {...stroke} />
    </Svg>
  ),
};

export type IconName = keyof typeof ICONS;
