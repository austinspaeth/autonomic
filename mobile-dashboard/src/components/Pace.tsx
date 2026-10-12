/* Is today on track? The block an opened tile carries for a day still
 * filling: a verdict, where the day is heading, and the day's running total
 * drawn against yesterday's and the range's average, each cut off at the same
 * clock time (lib/pace.ts).
 *
 * One chart, four marks, told apart by more than colour: today is the solid
 * line with a filled area and a live dot, its projection the same colour
 * dashed, yesterday a thin grey line, the average a dotted one. Nothing here
 * takes a touch, so the tile under it still closes on a tap. */
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedProps, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { smoothPath, type PaceModel, type PaceRef, type PaceStatus } from '../lib/pace';
import { C, num } from '../theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const YESTERDAY = '#8a8a90';
const H = 128;
const PAD_TOP = 10;
const PAD_END = 7; // room for the end dots

const STATUS: Record<PaceStatus, { label: string; color: string; tint: string; arrow: string }> = {
  ahead: { label: 'Ahead', color: C.up, tint: 'rgba(48,209,88,0.14)', arrow: '▲ ' },
  behind: { label: 'Behind', color: C.down, tint: 'rgba(255,69,58,0.14)', arrow: '▼ ' },
  on: { label: 'On track', color: C.text, tint: 'rgba(255,255,255,0.10)', arrow: '' },
  early: { label: 'Too early', color: C.dim, tint: 'rgba(255,255,255,0.08)', arrow: '' },
};

/** A count as it stands: whole when it is whole or big enough that a tenth is noise, one decimal for a small average. */
const count = (n: number) => (Math.abs(n) >= 20 || Math.abs(n - Math.round(n)) < 0.05 ? Math.round(n).toLocaleString('en-US') : n.toFixed(1));

function clockText(clock: number) {
  const mins = Math.min(24 * 60 - 1, Math.round(clock * 60));
  const h = Math.floor(mins / 60);
  return `${h % 12 || 12}:${String(mins % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'} ET`;
}

const hourText = (h: number) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'} ET`;

export function Pace({ pace, color = C.series }: { pace: PaceModel; color?: string }) {
  const [width, setWidth] = useState(0);
  const st = STATUS[pace.status];
  const { yesterday: y, average: avg } = pace;

  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }), -1, false);
    return () => cancelAnimation(pulse);
  }, [pulse]);
  const halo = useAnimatedProps(() => ({ r: 4 + pulse.value * 10, opacity: 0.4 * (1 - pulse.value) }));

  const max = Math.max(1, pace.now, pace.projected ?? 0, y?.total ?? 0, avg?.total ?? 0);
  const plotW = Math.max(0, width - PAD_END);
  const px = (h: number) => (h / 24) * plotW;
  const py = (v: number) => H - (v / max) * (H - PAD_TOP);
  /* Every line is a running total read at the hour boundaries, drawn as a
     curve through them: the bends are where the day actually sped up or
     slowed, and the curve cannot dip between two readings. */
  const line = (pts: [number, number][]) => smoothPath(pts.map(([h, v]) => [px(h), py(v)]));
  const whole = (curve: number[]) => line(curve.map((v, i) => [i, v]));

  const mine: [number, number][] | null = pace.today ? [...pace.today.map((v, i) => [i, v] as [number, number]), [pace.clock, pace.now]] : null;
  /* The stretch of today from before its hours were being counted: the same
     line, drawn faint, since where it bends there is the usual day's doing. */
  const placed = mine && pace.todayFrom > 0 ? mine.filter(([h]) => h <= pace.todayFrom) : null;
  const counted = mine && placed ? mine.filter(([h]) => h >= pace.todayFrom) : mine;
  const nowX = px(pace.clock);
  const nowY = py(pace.now);

  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.section}>
            Pace <Text style={s.asOf}>· as of {clockText(pace.clock)}</Text>
          </Text>
          {pace.projected === null ? (
            <Text style={s.heroQuiet}>Too early in the day to call</Text>
          ) : (
            <Text style={s.hero}>
              On pace for <Text style={[num, { color: st.color }]}>{count(Math.round(pace.projected))}</Text>
            </Text>
          )}
        </View>
        <View style={[s.status, { backgroundColor: st.tint }]}>
          <Text style={[s.statusText, { color: st.color }]}>
            {st.arrow}
            {st.label}
          </Text>
        </View>
      </View>

      <View style={{ height: H }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 ? (
          <Svg width={width} height={H}>
            <Defs>
              <LinearGradient id="paceFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity={0.32} />
                <Stop offset="1" stopColor={color} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            {[6, 12, 18].map((h) => (
              <Line key={h} x1={px(h)} x2={px(h)} y1={0} y2={H} stroke={C.grid} strokeWidth={1} strokeDasharray="2,4" />
            ))}
            <Line x1={0} x2={width} y1={H - 0.5} y2={H - 0.5} stroke={C.grid} strokeWidth={1} />

            {avg ? <Path d={whole(avg.curve)} stroke={C.text} strokeOpacity={0.6} strokeWidth={2} strokeDasharray="0.5,5" strokeLinecap="round" fill="none" /> : null}
            {y ? <Path d={whole(y.curve)} stroke={YESTERDAY} strokeWidth={1.5} strokeLinejoin="round" fill="none" /> : null}
            {avg ? <Circle cx={px(24)} cy={py(avg.total)} r={2.5} fill={C.text} fillOpacity={0.7} /> : null}
            {y ? <Circle cx={px(24)} cy={py(y.total)} r={2.5} fill={YESTERDAY} /> : null}

            {mine ? (
              <>
                <Path d={`${line(mine)}L${nowX.toFixed(1)},${H}L0,${H}Z`} fill="url(#paceFill)" />
                {placed && placed.length > 1 ? <Path d={line(placed)} stroke={color} strokeOpacity={0.45} strokeWidth={2} strokeLinecap="round" fill="none" /> : null}
                {counted && counted.length > 1 ? <Path d={line(counted)} stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" fill="none" /> : null}
              </>
            ) : null}
            {pace.tail.length ? (
              <>
                <Path d={line(pace.tail)} stroke={color} strokeWidth={2} strokeDasharray="4,5" strokeLinecap="round" fill="none" />
                <Circle cx={px(24)} cy={py(pace.projected ?? pace.now)} r={3} fill={C.surface} stroke={color} strokeWidth={2} />
              </>
            ) : null}

            <Line x1={nowX} x2={nowX} y1={nowY} y2={H} stroke={color} strokeOpacity={0.45} strokeWidth={1} />
            <AnimatedCircle cx={nowX} cy={nowY} fill={color} animatedProps={halo} />
            {/* A surface ring keeps the dot legible where the other lines cross it. */}
            <Circle cx={nowX} cy={nowY} r={5} fill={color} stroke="#18181b" strokeWidth={2} />
          </Svg>
        ) : null}
      </View>
      <View style={s.axis}>
        {['12a', '6a', '12p', '6p', '12a'].map((t, i) => (
          <Text key={i} style={[s.axisText, { textAlign: i === 0 ? 'left' : i === 4 ? 'right' : 'center' }]}>
            {t}
          </Text>
        ))}
      </View>

      <View style={s.legend}>
        <View style={s.legendItem}>
          <View style={[s.swatchLine, { backgroundColor: color }]} />
          <Text style={s.legendText}>Today</Text>
        </View>
        {pace.tail.length ? (
          <View style={s.legendItem}>
            <View style={s.swatchRow}>
              <View style={[s.swatchDash, { backgroundColor: color }]} />
              <View style={[s.swatchDash, { backgroundColor: color }]} />
            </View>
            <Text style={s.legendText}>Projected</Text>
          </View>
        ) : null}
        {y ? (
          <View style={s.legendItem}>
            <View style={[s.swatchThin, { backgroundColor: YESTERDAY }]} />
            <Text style={s.legendText}>Yesterday</Text>
          </View>
        ) : null}
        {avg ? (
          <View style={s.legendItem}>
            <View style={s.swatchRow}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={s.swatchDot} />
              ))}
            </View>
            <Text style={s.legendText}>Range average</Text>
          </View>
        ) : null}
      </View>

      <View style={s.cells}>
        {y ? <Cell title="vs yesterday" now={pace.now} to={y} ends="finished on" /> : null}
        {avg ? <Cell title="vs range average" now={pace.now} to={avg} ends="usually ends on" /> : null}
      </View>

      {pace.todayFrom > 0 ? (
        <Text style={s.foot}>
          Counting by the hour began at {hourText(pace.todayFrom)} today. Today&apos;s total is whole, but when the earlier part of it arrived was never recorded, so that
          stretch of the line (faint) is placed by the usual shape of a day.
        </Text>
      ) : null}
      {y?.exact && avg?.exact ? null : (
        <Text style={s.foot}>
          {pace.shapeDays
            ? `Days from before hourly counts began are placed by the usual shape of a day, measured over ${pace.shapeDays} ${pace.shapeDays === 1 ? 'day' : 'days'}.`
            : 'Hourly counts have only just begun. Until a full day of them is in, other days and the projection follow a typical day, not a measured one.'}
        </Text>
      )}
    </View>
  );
}

/* Today against one reference, both read at the same clock time: the gap in
   counts (the thing to act on), its percentage once the base can carry one,
   and what it is being held up to. */
function Cell({ title, now, to, ends }: { title: string; now: number; to: PaceRef; ends: string }) {
  const gap = now - to.byNow;
  const flat = Math.abs(gap) < 0.5;
  const color = flat ? C.dim : gap > 0 ? C.up : C.down;
  const p = to.byNow >= 5 ? (gap / to.byNow) * 100 : null;
  return (
    <View style={s.cell}>
      <Text style={s.cellTitle}>{title}</Text>
      <View style={s.cellRow}>
        <Text style={[s.cellGap, num, { color }]}>{flat ? 'Level' : `${gap > 0 ? '+' : '−'}${count(Math.abs(gap))}`}</Text>
        {p !== null && !flat ? (
          <Text style={[s.cellPct, num, { color }]}>
            {gap > 0 ? '▲' : '▼'} {Math.abs(p).toFixed(0)}%
          </Text>
        ) : null}
      </View>
      <Text style={[s.cellSub, num]}>
        {to.exact ? '' : 'about '}
        <Text style={s.cellStrong}>{count(to.byNow)}</Text> by this time
      </Text>
      <Text style={[s.cellEnd, num]}>
        {ends} {count(to.total)}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  section: { color: C.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  asOf: { fontWeight: '500', textTransform: 'none', letterSpacing: 0 },
  hero: { color: C.text, fontSize: 22, fontWeight: '700', letterSpacing: -0.4, marginTop: 3 },
  heroQuiet: { color: C.dim, fontSize: 17, fontWeight: '600', marginTop: 4 },
  status: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  statusText: { fontSize: 13, fontWeight: '700' },
  axis: { flexDirection: 'row', marginTop: -4, marginRight: PAD_END },
  axisText: { flex: 1, color: C.muted, fontSize: 11 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, rowGap: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendText: { color: C.dim, fontSize: 12 },
  swatchLine: { width: 14, height: 3, borderRadius: 2 },
  swatchThin: { width: 14, height: 1.5, borderRadius: 1 },
  swatchRow: { flexDirection: 'row', alignItems: 'center', gap: 3, width: 14 },
  swatchDash: { width: 5.5, height: 2.5, borderRadius: 2 },
  swatchDot: { width: 2.5, height: 2.5, borderRadius: 2, backgroundColor: C.text, opacity: 0.7 },
  cells: { flexDirection: 'row', gap: 8, marginTop: 2 },
  cell: { flex: 1, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12 },
  cellTitle: { color: C.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  cellRow: { flexDirection: 'row', alignItems: 'baseline', gap: 7, marginTop: 4 },
  cellGap: { fontSize: 24, fontWeight: '700', letterSpacing: -0.5 },
  cellPct: { fontSize: 12, fontWeight: '700' },
  cellSub: { color: C.dim, fontSize: 12, marginTop: 3 },
  cellStrong: { color: C.text, fontWeight: '600' },
  cellEnd: { color: C.muted, fontSize: 12, marginTop: 1 },
  foot: { color: C.muted, fontSize: 12, lineHeight: 17 },
});
