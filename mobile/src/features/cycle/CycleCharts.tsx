/**
 * The two charts at the top of Cycle impact, after the Claude Design comps:
 *
 *  - "Score by cycle day": the last three finished cycles as faint lines, this
 *    cycle bold white with today's dot, and the usual pre-period dip as a
 *    dashed box — the picture that tells "this happens every month" apart from
 *    a setback.
 *  - "{Metric} by phase": one column per phase, one dot per cycle, the median
 *    as a bar with its number.
 *
 * Both sit in the Insights card shell (`InsightCard`: title, "?", one plain
 * sentence) and use the app's axis type (IBM Plex Mono) and readout type
 * (Manrope). Neutral white throughout: every colour on a chart here is a grade.
 * The data is pure and tested in src/lib/cycle/pattern.
 */
import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { SCORE_CATS, scoreCat } from '../../lib/scoring/day';
import { LinkToggle } from '../../components/ui';
import { smoothPath } from '../../components/charts';
import { fonts, usePalette } from '../../theme';
import { CardRow, InsightCard } from '../insights/Card';
import * as S from '../insights/style';
import { alignByCycleDay, phaseColumns, usualDip, type CycleModel } from '../../lib/cycle';
import type { CycleRowId } from '../../lib/insights/cycle';

type Value = (dk: string) => number | null;

const W = 345;
const PAD_L = 30;
const PAD_R = 8;
const MAX_DAY = 35;

/** Three round ticks spanning [lo, hi]. */
function ticks(lo: number, hi: number): number[] {
  const raw = Math.max(1, (hi - lo) / 2);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || raw;
  const start = Math.floor(lo / step) * step;
  return [start, start + step, start + 2 * step];
}

const signed = (v: number, unit: string, dp = 0) => `${v > 0 ? '+' : v < 0 ? '-' : ''}${Math.abs(v).toFixed(dp)} ${unit}`;

/* ---------- score by cycle day ---------- */

const SCORE_HELP = {
  what: 'Your daily score laid out by cycle day, where day 1 is the first day of your period. The faint lines are your last three finished cycles, the white line is this one, and the dashed box is where your score usually dips before a period.',
  why: 'A dip that arrives at the same point every cycle is your cycle, not a setback. Seeing where this cycle sits against your usual dip is what tells the two apart. It describes your own log, not a diagnosis.',
};

export function ScoreByCycleDay({ model, value }: { model: CycleModel; value: Value }) {
  const p = usePalette();
  const data = useMemo(() => {
    const a = alignByCycleDay(model, value);
    return { past: a.past.slice(-3), current: a.current, todayDay: a.todayDay, dip: usualDip(model, value) };
  }, [model, value]);
  const all = [...data.past.flat(), ...(data.current || [])].filter((v): v is number => v != null);
  if (data.past.length < 1 || !all.length) return null;

  const H = 210, top = 20, bottom = 186;
  const lo0 = Math.min(...all, data.dip ? data.dip.low : Infinity);
  const hi0 = Math.max(...all, data.dip ? data.dip.high : -Infinity);
  const tk = ticks(lo0, hi0);
  const lo = Math.min(lo0, tk[0]), hi = Math.max(hi0, tk[2]);
  const xAt = (day: number) => PAD_L + ((day - 1) / (MAX_DAY - 1)) * (W - PAD_L - PAD_R);
  const yAt = (v: number) => bottom - 26 - ((v - lo) / (hi - lo || 1)) * (bottom - 26 - top - 10);
  // Drawn over a 3-day centred average and as a smooth curve: a day's score
  // wobbles for reasons of its own, and the shape across the cycle is the
  // point. The numbers in the rows below come from the raw values.
  const path = (row: (number | null)[]) => {
    const pts: [number, number][] = [];
    for (let i = 0; i < Math.min(row.length, MAX_DAY); i++) {
      if (row[i] == null) continue;
      const near = [row[i - 1], row[i], row[i + 1]].filter((v): v is number => v != null);
      pts.push([xAt(i + 1), yAt(near.reduce((a, b) => a + b, 0) / near.length)]);
    }
    return pts.length > 1 ? smoothPath(pts) : '';
  };
  const smoothAt = (row: (number | null)[], i: number) => {
    const near = [row[i - 1], row[i], row[i + 1]].filter((v): v is number => v != null);
    return near.length ? near.reduce((a, b) => a + b, 0) / near.length : null;
  };
  // This cycle wears the score's own grade colours (the Outlook's bands),
  // stepping exactly at each band edge; past cycles stay grey.
  const gTop = yAt(hi), gBot = yAt(lo);
  const off = (v: number) => Math.max(0, Math.min(1, (yAt(v) - gTop) / (gBot - gTop || 1)));
  const stops: { o: number; c: string }[] = [{ o: 0, c: scoreCat(hi).color }];
  SCORE_CATS.map((c) => c.min).filter((m) => m > lo && m < hi).sort((x, y) => y - x).forEach((m) => {
    stops.push({ o: off(m), c: scoreCat(m).color });
    stops.push({ o: off(m), c: scoreCat(m - 0.001).color });
  });
  stops.push({ o: 1, c: scoreCat(lo).color });
  const todayIdx = data.todayDay != null ? data.todayDay - 1 : null;
  const todayV = todayIdx != null && data.current && data.current[todayIdx] != null ? smoothAt(data.current, todayIdx) : null;
  const dip = data.dip;

  return (
    <InsightCard title="Score by cycle day" helpText={SCORE_HELP}
      desc={`Your last ${data.past.length} cycle${data.past.length === 1 ? '' : 's'} in grey, this one coloured by its grade.`}>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
        <Defs>
          <LinearGradient id="cycleScoreGrade" x1="0" y1={gTop} x2="0" y2={gBot} gradientUnits="userSpaceOnUse">
            {stops.map((st, i) => <Stop key={i} offset={st.o} stopColor={st.c} />)}
          </LinearGradient>
        </Defs>
        {tk.map((t) => (
          <React.Fragment key={t}>
            <Line x1={PAD_L} x2={W - PAD_R} y1={yAt(t)} y2={yAt(t)} stroke="#fff" strokeOpacity={0.06} />
            <SvgText x={PAD_L - 6} y={yAt(t) + 3} textAnchor="end" fontFamily={fonts.mono} fontSize={9} fill={p.textFaint}>{String(Math.round(t))}</SvgText>
          </React.Fragment>
        ))}
        {dip ? (
          <>
            <Rect x={xAt(dip.fromDay)} y={yAt(dip.high)} width={xAt(dip.toDay) - xAt(dip.fromDay)} height={yAt(dip.low) - yAt(dip.high)}
              rx={6} fill="#fff" fillOpacity={0.08} stroke="#fff" strokeOpacity={0.18} strokeDasharray="3 3" />
            <SvgText x={(xAt(dip.fromDay) + xAt(dip.toDay)) / 2} y={yAt(dip.low) + 13} textAnchor="middle" fontFamily={fonts.mono} fontSize={8.5} letterSpacing={0.5} fill={p.textDim}>USUAL DIP</SvgText>
          </>
        ) : null}
        {data.past.map((row, i) => (
          <Path key={i} d={path(row)} fill="none" stroke="#fff" strokeOpacity={0.17} strokeWidth={1.2} strokeLinejoin="round" />
        ))}
        {todayIdx != null ? (
          <Line x1={xAt(todayIdx + 1)} x2={xAt(todayIdx + 1)} y1={top} y2={bottom} stroke="#fff" strokeOpacity={0.22} strokeDasharray="2 3" />
        ) : null}
        {data.current ? (
          <Path d={path(data.current)} fill="none" stroke="url(#cycleScoreGrade)" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
        ) : null}
        {todayIdx != null && todayV != null ? (
          <Circle cx={xAt(todayIdx + 1)} cy={yAt(todayV)} r={4.5} fill={scoreCat(todayV).color} stroke="#000" strokeWidth={2.5} />
        ) : null}
        {[1, 7, 14, 21, 28, 35].map((d) => (
          <SvgText key={d} x={xAt(d)} y={H - 7} textAnchor="middle" fontFamily={fonts.mono} fontSize={9} fill={p.textFaint}>{String(d)}</SvgText>
        ))}
      </Svg>
      <View style={{ flexDirection: 'row', gap: 16, marginTop: 4, marginBottom: 12 }}>
        <LegendLine label="This cycle" color={scoreCat(70).color} h={2.6} />
        <LegendLine label={`Last ${data.past.length}`} color="rgba(255,255,255,0.35)" h={1.2} />
        {dip ? <LegendBox label="Usual dip" /> : null}
      </View>
      {dip ? (
        <CardRow>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[S.ROW_TITLE, { color: p.text }]}>Usual dip</Text>
            <Text style={[S.ROW_NOTE, { color: p.textDim }]}>{`Days ${dip.fromDay} to ${dip.toDay}, last ${dip.cycles} cycles`}</Text>
          </View>
          <Text style={[S.WATCH_VALUE, { color: p.text, fontFamily: fonts.numHeavy }]}>{signed(-dip.usualDrop, 'points')}</Text>
        </CardRow>
      ) : null}
      {dip && dip.currentDrop != null && data.todayDay != null ? (
        <CardRow>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[S.ROW_TITLE, { color: p.text }]}>This cycle so far</Text>
            <Text style={[S.ROW_NOTE, { color: p.textDim }]}>{`Day ${data.todayDay}`}</Text>
          </View>
          <Text style={[S.WATCH_VALUE, { color: p.text, fontFamily: fonts.numHeavy }]}>{signed(-dip.currentDrop, 'points')}</Text>
        </CardRow>
      ) : null}
    </InsightCard>
  );
}

function LegendLine({ label, color, h }: { label: string; color: string; h: number }) {
  const p = usePalette();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
      <View style={{ width: 16, height: h, borderRadius: 2, backgroundColor: color }} />
      <Text style={{ fontSize: 12, fontWeight: '500', color: p.textDim }}>{label}</Text>
    </View>
  );
}

function LegendBox({ label }: { label: string }) {
  const p = usePalette();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
      <View style={{ width: 14, height: 10, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.3)' }} />
      <Text style={{ fontSize: 12, fontWeight: '500', color: p.textDim }}>{label}</Text>
    </View>
  );
}

/* ---------- a metric by phase ---------- */

const METRICS: { id: CycleRowId; label: string; unit: string }[] = [
  { id: 'baseline', label: 'RMSSD', unit: 'ms' },
  { id: 'restingHr', label: 'Resting HR', unit: 'bpm' },
  { id: 'orthoDelta', label: 'POTS episode', unit: 'bpm' },
];
/** Column strengths, the phase treatment's own neutral steps. */
const COL_ALPHA = [0.07, 0.02, 0.045, 0.035];

const PHASE_HELP = {
  what: 'One column per phase of your cycle. Each dot is one finished cycle: that cycle\'s median in the phase. The bar and its number are the median of those dots.',
  why: 'It shows how much a measurement moves across your cycle, and how steady that is from one cycle to the next. Tightly grouped dots are a pattern you can plan around. It describes your own log, not a diagnosis.',
};

export function MetricByPhase({ model, valueFor }: { model: CycleModel; valueFor: (id: CycleRowId) => Value }) {
  const p = usePalette();
  const [metric, setMetric] = useState<CycleRowId>('baseline');
  const def = METRICS.find((m) => m.id === metric)!;
  const value = useMemo(() => valueFor(metric), [valueFor, metric]);
  const cols = useMemo(() => phaseColumns(model, value), [model, value]);
  const all = cols.flatMap((c) => c.perCycle);
  const cycles = Math.max(0, ...cols.map((c) => c.perCycle.length));
  const fol = cols[1].median, lut = cols[3].median;

  const H = 190, top = 14, base = 162;
  const tk = all.length ? ticks(Math.min(...all), Math.max(...all)) : [0, 1, 2];
  const lo = Math.min(tk[0], ...all), hi = Math.max(tk[2], ...all);
  const yAt = (v: number) => base - ((v - lo) / (hi - lo || 1)) * (base - top - 10) - 5;
  const colW = 68.8, gap = 8, x0 = 34;

  return (
    <InsightCard title={`${def.label} by phase`} helpText={PHASE_HELP} desc="Each dot is one cycle. The bar is your median.">
      <View style={{ marginTop: 6, marginBottom: 12 }}>
        <LinkToggle options={METRICS.map((m) => ({ val: m.id, label: m.label }))} value={metric} onChange={setMetric} />
      </View>
      {cycles < 2 ? (
        <Text style={{ color: p.textDim, fontSize: 14, paddingVertical: 24, textAlign: 'center' }}>
          {`Not enough ${def.label === 'RMSSD' ? 'RMSSD readings' : def.label.toLowerCase()} in your finished cycles yet.`}
        </Text>
      ) : (
        <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
          {tk.map((t) => (
            <React.Fragment key={t}>
              <Line x1={PAD_L} x2={W - PAD_R} y1={yAt(t)} y2={yAt(t)} stroke="#fff" strokeOpacity={0.06} />
              <SvgText x={PAD_L - 6} y={yAt(t) + 3} textAnchor="end" fontFamily={fonts.mono} fontSize={9} fill={p.textFaint}>{String(Math.round(t))}</SvgText>
            </React.Fragment>
          ))}
          {cols.map((c, ci) => {
            const x = x0 + ci * (colW + gap);
            const n = c.perCycle.length;
            return (
              <React.Fragment key={c.phase}>
                <Rect x={x} y={top} width={colW} height={base - top} rx={10} fill="#fff" fillOpacity={COL_ALPHA[ci]} />
                {c.perCycle.map((v, i) => (
                  <Circle key={i} cx={x + colW / 2 + (i - (n - 1) / 2) * 6.4} cy={yAt(v)} r={3} fill="#fff" fillOpacity={0.32} />
                ))}
                {c.median != null ? (
                  <>
                    <Rect x={x + colW / 2 - 22} y={yAt(c.median) - 1.6} width={44} height={3.2} rx={1.6} fill={p.text} />
                    <SvgText x={x + colW / 2} y={yAt(c.median) - 7} textAnchor="middle" fontFamily={fonts.numHeavy} fontSize={12} fill={p.text}>{String(Math.round(c.median))}</SvgText>
                  </>
                ) : null}
                <SvgText x={x + colW / 2} y={H - 8} textAnchor="middle" fontFamily={fonts.mono} fontSize={8.5} letterSpacing={0.4} fill={p.textDim}>{c.label.toUpperCase()}</SvgText>
              </React.Fragment>
            );
          })}
        </Svg>
      )}
      {fol != null && lut != null && cycles >= 2 ? (
        <CardRow>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[S.ROW_TITLE, { color: p.text }]}>Luteal vs follicular</Text>
            <Text style={[S.ROW_NOTE, { color: p.textDim }]}>{`Last ${cycles} cycles`}</Text>
          </View>
          <Text style={[S.WATCH_VALUE, { color: p.text, fontFamily: fonts.numHeavy }]}>{signed(lut - fol, def.unit)}</Text>
        </CardRow>
      ) : null}
    </InsightCard>
  );
}
