/* "Are we on track?" for a day still filling: today's count against the
 * range's daily average scaled to how much of the (US Eastern) day has gone.
 *
 * The counters carry no time of day, so "expected by now" assumes the average
 * day arrives evenly through its 24 hours. That reads a little behind in the
 * small hours, when few people open anything, and catches up by evening; the
 * note under the gauge says so rather than pretend to a curve we do not have.
 *
 * The arc runs 0 to 200% of pace with the 100% mark at the top, so on track
 * is the fill reaching the white tick. */
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';
import { C, num } from '../theme';

const W = 220;
const STROKE = 14;
const R = (W - STROKE) / 2;
const CX = W / 2;
const CY = R + STROKE / 2;
const H = CY + STROKE / 2 + 4;
/** Before this much of the day, a projection is mostly noise. */
const PROJECT_AFTER = 0.15;

const point = (p: number, r = R) => {
  const a = Math.PI * (1 - p);
  return { x: CX + r * Math.cos(a), y: CY - r * Math.sin(a) };
};
const arc = (p0: number, p1: number) => {
  const a = point(p0);
  const b = point(p1);
  return `M ${a.x} ${a.y} A ${R} ${R} 0 0 1 ${b.x} ${b.y}`;
};

export function PaceGauge({
  now,
  avg,
  fraction,
  format = (n: number) => String(Math.round(n)),
}: {
  /** Today's count so far. */
  now: number;
  /** The range's average for a whole day (completed days only). */
  avg: number | null;
  /** Share of the day gone, 0..1. */
  fraction: number;
  format?: (n: number) => string;
}) {
  if (avg === null || avg <= 0) {
    return (
      <View style={st.wrap}>
        <Text style={st.section}>On track for the range average?</Text>
        <Text style={st.note}>No completed days in the range to compare against yet.</Text>
      </View>
    );
  }
  const expected = avg * fraction;
  const pace = expected > 0 ? now / expected : now > 0 ? Infinity : 1;
  const p = Math.max(0, Math.min(1, pace / 2));
  const tone = pace >= 1 ? C.up : pace >= 0.85 ? C.gold : C.down;
  const verdict = pace >= 1.15 ? 'Ahead of pace' : pace >= 1 ? 'On track' : pace >= 0.85 ? 'Just behind' : 'Behind pace';
  const projected = fraction >= PROJECT_AFTER ? now / fraction : null;
  const pctLabel = Number.isFinite(pace) ? `${Math.round(pace * 100)}%` : '–';

  return (
    <View style={st.wrap}>
      <Text style={st.section}>On track for the range average?</Text>
      <View style={st.gauge}>
        <Svg width={W} height={H}>
          <Path d={arc(0, 1)} stroke="rgba(255,255,255,0.08)" strokeWidth={STROKE} strokeLinecap="round" fill="none" />
          {p > 0.005 ? <Path d={arc(0, p)} stroke={tone} strokeWidth={STROKE} strokeLinecap="round" fill="none" /> : null}
          {/* The 100% mark: matching the average exactly. */}
          <Line x1={CX} y1={CY - R - STROKE / 2 - 2} x2={CX} y2={CY - R + STROKE / 2 + 2} stroke="#fff" strokeWidth={2} />
        </Svg>
        <View style={st.readout} pointerEvents="none">
          <Text style={[st.pct, num, { color: tone }]}>{pctLabel}</Text>
          <Text style={[st.verdict, { color: tone }]}>{verdict}</Text>
        </View>
      </View>
      <View style={st.rows}>
        <View style={st.row}>
          <Text style={st.rowLabel}>So far today</Text>
          <Text style={[st.rowValue, num]}>{format(now)}</Text>
        </View>
        <View style={st.row}>
          <Text style={st.rowLabel}>Expected by now</Text>
          <Text style={[st.rowValue, num]}>{format(expected)}</Text>
        </View>
        <View style={st.row}>
          <Text style={st.rowLabel}>Range average, whole day</Text>
          <Text style={[st.rowValue, num]}>{format(avg)}</Text>
        </View>
        {projected !== null ? (
          <View style={st.row}>
            <Text style={st.rowLabel}>On pace to finish near</Text>
            <Text style={[st.rowValue, num]}>{format(projected)}</Text>
          </View>
        ) : null}
      </View>
      <Text style={st.note}>
        {Math.round(fraction * 100)}% of the day (US Eastern) has gone. Expected assumes the average day arrives evenly, so the small hours read a
        little behind.
      </Text>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { gap: 10 },
  section: { color: C.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  gauge: { alignItems: 'center' },
  readout: { position: 'absolute', bottom: 2, alignItems: 'center' },
  pct: { fontSize: 34, fontWeight: '800', letterSpacing: -0.5 },
  verdict: { fontSize: 12, fontWeight: '700' },
  rows: { gap: 2, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: 4 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 10 },
  rowLabel: { color: C.dim, fontSize: 14 },
  rowValue: { color: C.text, fontSize: 14, fontWeight: '600' },
  note: { color: C.muted, fontSize: 12, lineHeight: 17 },
});
