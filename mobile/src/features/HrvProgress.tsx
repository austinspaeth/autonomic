/**
 * Interactive HRV section for the Progress view. A pill toggle (All / Morning /
 * Night) filters which readings feed the aggregates. Every metric is charted as
 * structured (breathing) vs unstructured so you can compare them over the range;
 * power is a stacked VLF/LF/HF bar per bucket (its height is total power); and
 * the section closes with the filtered overall autonomic score. Every line chart
 * carries the grade-zone toggle.
 */
import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { LineChart, StackedBars } from '../components/charts';
import { radius, usePalette } from '../theme';
import type { DayRecord, Entry } from '../lib/types';
import { hrvComposite, type ScoreContext } from '../lib/scoring';
import { scoreCat, type DaysMap } from '../lib/scoring/day';
import {
  acBandZones, acBuckets, acReadVals, isEvening, isMorning, makeAgg, type Mode,
} from '../lib/analysis/buckets';

export type Filt = 'all' | 'morning' | 'night';
/** All/Morning/Night pill options — shared by the inline HRV header and the
 * pinned progress header so both toggles drive the same filter. */
export const HRV_FILTERS: { val: Filt; label: string }[] = [
  { val: 'all', label: 'All' }, { val: 'morning', label: 'Morning' }, { val: 'night', label: 'Night' },
];
const STRUCT = '#4ade80';
const UNSTRUCT = '#38bdf8';

// Structured (breathHrv) key, unstructured (hrv) key, grade band, integer?
const METRICS: { label: string; s: string; u: string; band: string; integer?: boolean }[] = [
  { label: 'RMSSD', s: 'rmssd', u: 'rmssd', band: 'rmssdS', integer: true },
  { label: 'pNN50', s: 'pnn50', u: 'pnn50', band: 'pnn50', integer: true },
  { label: 'SDNN', s: 'sdnn', u: 'sdnn', band: 'sdnn', integer: true },
  { label: 'Avg HR', s: 'hr', u: 'avgHr', band: 'hrBreath', integer: true },
  { label: 'Mean RR', s: 'meanRr', u: 'meanRr', band: 'rrMode', integer: true },
  { label: 'MxDMn', s: 'mxdmn', u: 'mxdmn', band: 'mxdmn' },
  { label: 'Mode', s: 'mode', u: 'mode', band: 'rrMode', integer: true },
  { label: 'AMo50', s: 'amo50', u: 'amo50', band: 'amo50', integer: true },
  { label: 'CV', s: 'cv', u: 'cv', band: 'cv' },
  { label: 'Stress index', s: 'stressIndex', u: 'stressIndex', band: 'stressIndex', integer: true },
  { label: 'LF peak', s: 'lfPeak', u: 'lfPeak', band: 'lfPeak' },
  { label: 'HF peak', s: 'hfPeak', u: 'hfPeak', band: 'hfPeak' },
];

const filterFor = (f: Filt) => (f === 'morning' ? isMorning : f === 'night' ? isEvening : undefined);

/** Read a numeric key from readings of BOTH HRV kinds (for power). */
function readAnyHrv(d: DayRecord, key: string, filt?: (r: Entry) => boolean): number[] {
  const out: number[] = [];
  (d.readings || []).forEach((r) => {
    if (r.type !== 'hrv' && r.type !== 'breathHrv') return;
    if (filt && !filt(r)) return;
    const v = parseFloat(r[key] as string);
    if (!isNaN(v)) out.push(v);
  });
  return out;
}

export function HrvProgress({ days, mode, ctx, filt }: { days: DaysMap; mode: Mode; ctx: ScoreContext; filt: Filt }) {
  const p = usePalette();

  const view = useMemo(() => {
    const buckets = acBuckets(days, mode);
    const bl = buckets.map((b) => ({ label: b.label }));
    const { acAgg } = makeAgg(days, ctx);
    const f = filterFor(filt);

    const metricCharts = METRICS.map((m) => {
      const structured = acAgg(buckets, (d) => acReadVals(d, 'breathHrv', m.s, f));
      const unstructured = acAgg(buckets, (d) => acReadVals(d, 'hrv', m.u, f));
      const has = structured.some((v) => v != null) || unstructured.some((v) => v != null);
      return { m, structured, unstructured, has };
    }).filter((x) => x.has);

    // Power: average VLF/LF/HF per bucket over both HRV kinds → stacked bar.
    const vlf = acAgg(buckets, (d) => readAnyHrv(d, 'vlowPower', f));
    const lf = acAgg(buckets, (d) => readAnyHrv(d, 'lowPower', f));
    const hf = acAgg(buckets, (d) => readAnyHrv(d, 'highPower', f));
    const hasPower = [vlf, lf, hf].some((arr) => arr.some((v) => v != null));

    // Overall autonomic score of the filtered set (mean composite over readings).
    const rangeStart = buckets.length ? buckets[0].start : null;
    const rangeEnd = buckets.length ? buckets[buckets.length - 1].end : null;
    let sum = 0, cnt = 0;
    if (rangeStart != null && rangeEnd != null) Object.keys(days).forEach((dk) => {
      const inRange = dk >= rangeStart && dk <= rangeEnd;
      if (!inRange) return;
      (days[dk].readings || []).forEach((r) => {
        if (r.type !== 'hrv' && r.type !== 'breathHrv') return;
        if (f && !f(r)) return;
        const sc = hrvComposite(r, ctx).score;
        if (sc != null) { sum += sc; cnt++; }
      });
    });
    const overall = cnt ? Math.round(sum / cnt) : null;

    return { bl, metricCharts, vlf, lf, hf, hasPower, overall, count: cnt };
  }, [days, mode, ctx, filt]);

  const hasAny = view.metricCharts.length > 0 || view.hasPower;

  return (
    <View>
      {!hasAny ? (
        <Text style={{ color: p.textDim }}>No {filt === 'all' ? '' : filt + ' '}HRV readings in this range.</Text>
      ) : (
        <>
          {view.hasPower ? (
            <Card>
              <CardTitle title="Power distribution" sub="Stacked VLF / LF / HF — bar height is total power (ms²)" />
              <StackedBars
                buckets={view.bl}
                unit="ms²"
                segments={[
                  { label: 'VLF', color: '#f59e0b', values: view.vlf },
                  { label: 'LF', color: '#6366f1', values: view.lf },
                  { label: 'HF', color: '#22c55e', values: view.hf },
                ]}
              />
              <Legend items={[['VLF', '#f59e0b'], ['LF', '#6366f1'], ['HF', '#22c55e']]} />
            </Card>
          ) : null}

          {view.metricCharts.map(({ m, structured, unstructured }) => (
            <Card key={m.label}>
              <CardTitle title={m.label} />
              <LineChart
                buckets={view.bl}
                integer={m.integer}
                zones={acBandZones(m.band)}
                series={[
                  { values: structured, color: STRUCT, label: 'Structured' },
                  { values: unstructured, color: UNSTRUCT, label: 'Unstructured' },
                ]}
              />
              <Legend items={[['Structured', STRUCT], ['Unstructured', UNSTRUCT]]} />
            </Card>
          ))}

          <Card>
            <CardTitle title="Overall autonomic score" sub={`Mean of ${view.count} ${filt === 'all' ? '' : filt + ' '}reading${view.count === 1 ? '' : 's'} in range`} />
            {view.overall != null ? (
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                <Text style={{ fontSize: 40, fontWeight: '800', color: scoreCat(view.overall).color, fontVariant: ['tabular-nums'] }}>{view.overall}</Text>
                <Text style={{ fontSize: 15, fontWeight: '700', color: p.textDim }}>/ 100 · {scoreCat(view.overall).short}</Text>
              </View>
            ) : <Text style={{ color: p.textDim }}>Not enough data to score.</Text>}
          </Card>
        </>
      )}
    </View>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  const p = usePalette();
  return <View style={{ backgroundColor: p.surface, borderColor: p.border, borderWidth: 1, borderRadius: radius.card, padding: 14, marginBottom: 12 }}>{children}</View>;
}
function CardTitle({ title, sub }: { title: string; sub?: string }) {
  const p = usePalette();
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ fontSize: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, color: p.textDim }}>{title}</Text>
      {sub ? <Text style={{ fontSize: 11, color: p.textDim, marginTop: 2 }}>{sub}</Text> : null}
    </View>
  );
}
function Legend({ items }: { items: [string, string][] }) {
  const p = usePalette();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 }}>
      {items.map(([name, color]) => (
        <View key={name} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color }} />
          <Text style={{ fontSize: 11, color: p.textDim }}>{name}</Text>
        </View>
      ))}
    </View>
  );
}
