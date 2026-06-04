// TrendChip — small up/down/flat delta pill. Ported from legacy acTrendChip
// (docs/index.html:4914-4920): flat when |delta| < eps (default 0.5); "good"
// when the direction matches goodUp (default true), else "bad". The displayed
// magnitude is rounded to 1 decimal then run through the legacy fmtNum.
import React from 'react';
import { View, Text } from 'react-native';
import { SCORE_COLORS } from '@core/scoring/colors';
import { useTheme } from '@ui/theme/ThemeProvider';

// Legacy fmtNum (docs/index.html:3280).
const fmtNum = (v: number | null | undefined): string => {
  if (v == null) return '-';
  if (Number.isInteger(v)) return String(v);
  return Math.abs(v) < 1 ? v.toFixed(3) : v.toFixed(1);
};

export interface TrendChipOpts {
  eps?: number;
  unit?: string;
  goodUp?: boolean;
}

export interface TrendChipProps {
  delta: number | null;
  opts?: TrendChipOpts;
}

export function TrendChip({ delta, opts = {} }: TrendChipProps) {
  const t = useTheme();
  if (delta == null) return null;
  const flat = Math.abs(delta) < (opts.eps || 0.5);
  const up = delta > 0;
  const sym = flat ? '→' : up ? '↑' : '↓';
  const good = up === (opts.goodUp !== false);
  const color = flat ? t.textDim : good ? SCORE_COLORS.good : SCORE_COLORS.bad;
  const text = `${sym} ${fmtNum(Math.abs(Math.round(delta * 10) / 10))}${opts.unit || ''}`;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 999,
        backgroundColor: color + '22',
      }}
    >
      <Text style={{ fontSize: 11, fontWeight: '600', color }}>{text}</Text>
    </View>
  );
}
