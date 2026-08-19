/**
 * The watchOS Mindfulness app icon, near enough to recognize on the wrist: a
 * teal circle with the eight-petal Breathe flower.
 *
 * Shared rather than redrawn, because it appears twice in the same flow — on the
 * prep card ("Open Mindfulness on your Apple Watch") and again on the reading
 * card, beside the note explaining that the watch does not stream. Those two are
 * the same instruction seen ten seconds apart, so they have to be the same mark;
 * a line-art approximation on the second one read as a different app entirely.
 */
import React, { useId } from 'react';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

export function MindfulnessIcon({ size = 72 }: { size?: number }) {
  const c = size / 2;
  const ring = size * 0.16; // petal centers sit on this ring
  const petal = size * 0.19;
  // react-native-svg resolves gradient ids GLOBALLY, so two instances sharing one
  // literal id fight over it — and both of these can be mounted at once, the prep
  // card sitting under the reading card.
  const gid = `mindfulBg-${useId()}`;
  return (
    <Svg width={size} height={size}>
      <Defs>
        <LinearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#35dcc8" />
          <Stop offset="1" stopColor="#0d9c8c" />
        </LinearGradient>
      </Defs>
      <Circle cx={c} cy={c} r={c} fill={`url(#${gid})`} />
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return (
          <Circle
            key={i}
            cx={c + ring * Math.cos(a)}
            cy={c + ring * Math.sin(a)}
            r={petal}
            fill="#eafffb"
            opacity={0.42}
          />
        );
      })}
    </Svg>
  );
}
