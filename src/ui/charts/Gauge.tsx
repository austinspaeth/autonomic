// Arc gauge showing a 0-100 score: a track arc plus a colored value arc with a
// faint halo behind it. Geometry ported verbatim from the legacy single-file app
// scoreGauge() (docs/index.html:3324-3343). The legacy SVG used
// var(--gauge-track) for the track stroke; here that becomes t.gaugeTrack.
import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '@ui/theme/ThemeProvider';

export interface GaugeProps {
  /** Score 0-100; clamped to that range for the arc fraction. */
  score: number;
  /** Color of the value arc (and its halo). */
  color: string;
  /** Rendered height in px. Defaults to the legacy day-card size (176). */
  size?: number;
}

// Legacy constants (docs/index.html:3327-3328).
const VIEW = 176;
const cx = VIEW / 2;
const cy = VIEW / 2;
const r = 74;
const sw = 12;
const START = 135; // bottom-left
const SWEEP = 270; // clockwise over the top

// docs/index.html:3329 — polar point on the gauge circle.
function pol(deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

// docs/index.html:3330-3335 — arc path command for a given fraction [0,1].
function arc(frac: number): string {
  const a1 = START + SWEEP * Math.max(0.0001, frac);
  const [x0, y0] = pol(START);
  const [x1, y1] = pol(a1);
  const large = SWEEP * frac > 180 ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
}

export function Gauge({ score, color, size = VIEW }: GaugeProps) {
  const t = useTheme();
  // docs/index.html:3336 — clamp score to a fraction.
  const frac = Math.max(0, Math.min(1, (score || 0) / 100));

  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      preserveAspectRatio="none"
    >
      {/* track arc — docs/index.html:3338 */}
      <Path
        d={arc(1)}
        fill="none"
        stroke={t.gaugeTrack}
        strokeWidth={sw}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* faint colored halo behind the value arc — docs/index.html:3340 */}
      <Path
        d={arc(frac)}
        fill="none"
        stroke={color}
        strokeWidth={sw + 7}
        strokeLinecap="round"
        opacity={0.16}
        vectorEffect="non-scaling-stroke"
      />
      {/* value arc — docs/index.html:3341 */}
      <Path
        d={arc(frac)}
        fill="none"
        stroke={color}
        strokeWidth={sw}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </Svg>
  );
}
