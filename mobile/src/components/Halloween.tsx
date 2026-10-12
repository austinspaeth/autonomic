/**
 * The Halloween week's two drawings. Both are decoration: they take no touches
 * and sit behind or beside the content, never in its layout.
 */
import React from 'react';
import { View } from 'react-native';
import Svg, { Ellipse, G, Path } from 'react-native-svg';
import { usePalette } from '../theme';

/** A faint web in a card's top-right corner. The card must clip its overflow. */
export function CornerWeb() {
  const p = usePalette();
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, right: 0 }}>
      <Svg width={92} height={92} viewBox="0 0 92 92">
        <G fill="none" stroke={p.dark ? '#ffffff1c' : '#0000001c'} strokeWidth={1}>
          <Path d="M92 0 L10 82 M92 0 L40 90 M92 0 L2 50 M92 0 L70 92 M92 0 L0 18" />
          <Path d="M74 2 Q78 12 89 17" />
          <Path d="M56 3 Q64 22 88 34" />
          <Path d="M38 4 Q50 34 87 52" />
          <Path d="M20 6 Q36 46 86 70" />
        </G>
      </Svg>
    </View>
  );
}

const SPIDER = '#8a8a92';
// Longer than any status bar is tall: the thread runs off the top of the screen.
const THREAD = 300;

/**
 * A small spider on a thread from the top of the screen. Positioned by its
 * parent: `top` is where the spider's body starts, `left` its left edge.
 */
export function HangingSpider({ top, left }: { top: number; left: number }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: top + 2 - THREAD, left, width: 18, height: THREAD + 12, alignItems: 'center' }}>
      <View style={{ width: 1, height: THREAD, backgroundColor: '#ffffff26' }} />
      <Svg width={18} height={14} viewBox="0 0 18 14" style={{ marginTop: -2 }}>
        <G stroke={SPIDER} strokeWidth={1.2} strokeLinecap="round" fill="none">
          <Path d="M6 6 L1 2 M6 7 L0 7 M6 8 L1 12 M12 6 L17 2 M12 7 L18 7 M12 8 L17 12" />
        </G>
        <Ellipse cx={9} cy={7} rx={3.4} ry={4} fill={SPIDER} />
      </Svg>
    </View>
  );
}
