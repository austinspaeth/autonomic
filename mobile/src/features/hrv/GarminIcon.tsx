/**
 * Garmin's mark — the blue delta — on a circular ground, matching
 * MindfulnessIcon's shape so the two prep cards read as the same kind of
 * object. Same reasoning as that file: it appears on the prep card and again
 * beside the reading card's note, and those are one instruction seen twice, so
 * they have to be the same mark.
 *
 * Drawn rather than bundled: it is three straight edges, and an SVG stays crisp
 * at any size without shipping a raster per size.
 */
import React, { useId } from 'react';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

export function GarminIcon({ size = 72 }: { size?: number }) {
  const c = size / 2;
  // react-native-svg resolves gradient ids GLOBALLY, so two mounted instances
  // would fight over a literal id — and both can be on screen at once.
  const gid = `garminBg-${useId()}`;

  // Rounded corners come from stroking the path with round joins in the same
  // colour as the fill — SVG has no corner radius for a polygon. The stroke
  // grows the shape by half its width on every edge, so the triangle is drawn
  // smaller by that amount and ends up the intended size.
  const round = size * 0.09;
  const w = size * 0.46 - round;
  const h = size * 0.40 - round;
  const cy = c;
  const d = `M ${c} ${cy - h / 2} L ${c + w / 2} ${cy + h / 2} L ${c - w / 2} ${cy + h / 2} Z`;

  return (
    <Svg width={size} height={size}>
      <Defs>
        <LinearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#1898d8" />
          <Stop offset="1" stopColor="#006aa8" />
        </LinearGradient>
      </Defs>
      <Circle cx={c} cy={c} r={c} fill={`url(#${gid})`} />
      <Path
        d={d}
        fill="#ffffff"
        stroke="#ffffff"
        strokeWidth={round}
        strokeLinejoin="round"
      />
    </Svg>
  );
}
