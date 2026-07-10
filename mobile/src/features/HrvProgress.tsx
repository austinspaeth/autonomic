/**
 * Interactive HRV section for the Progress view, styled after the HRV design
 * comp: flat sections against the screen background separated by hairline
 * rules (no cards), each with an uppercase title + "?" help dot, a big value
 * line ("37 avg"), a one-line description, and — for metrics — a text-link
 * kind toggle (Unstructured / Breathing / Both) plus a "Show zones" link.
 * "Both" overlays the two kinds in blue/green comparison colours; a single
 * kind draws one trace tinted by the grade-zone gradient. Power is a stacked
 * VLF/LF/HF bar per bucket. The big value shows the range average by default
 * and mirrors the bucket you drag on the chart.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { LineChart, StackedBars, ZonesToggle } from '../components/charts';
import { HelpDot } from '../components/ui';
import { fonts, radius, usePalette } from '../theme';
import { fmtNum } from '../lib/dates';
import type { DayRecord, Entry } from '../lib/types';
import { type ScoreContext } from '../lib/scoring';
import { type DaysMap } from '../lib/scoring/day';
import {
  acBandZones, acBuckets, acReadVals, isEvening, isMorning, makeAgg, type Mode,
} from '../lib/analysis/buckets';

export type Filt = 'all' | 'morning' | 'night';
/** All/Morning/Night options — shared by the inline HRV header and the pinned
 * progress header so both toggles drive the same filter. */
export const HRV_FILTERS: { val: Filt; label: string }[] = [
  { val: 'all', label: 'All' }, { val: 'morning', label: 'Morning' }, { val: 'night', label: 'Night' },
];
const STRUCT = '#60a5fa';   // structured — blue
const UNSTRUCT = '#a855f7'; // unstructured — purple
const VLF = '#f59e0b', LF = '#6366f1', HF = '#22c55e';

/** Pill filter: the selected option sits in a dark-grey pill that animates its
 *  size and position between options. No parent container (unlike Segmented) —
 *  the pills float against whatever backdrop. Selected text is white, the rest
 *  are light grey. Used inline beside the section title and in the sticky bar. */
export function HrvFilterLinks({ value, onChange }: { value: Filt; onChange: (f: Filt) => void }) {
  const p = usePalette();
  const [cells, setCells] = useState<{ x: number; w: number }[]>([]);
  const idx = Math.max(0, HRV_FILTERS.findIndex((o) => o.val === value));
  const anim = useRef(new Animated.Value(idx)).current;
  useEffect(() => {
    Animated.spring(anim, { toValue: idx, useNativeDriver: false, speed: 16, bounciness: 8 }).start();
  }, [idx, anim]);
  const measured = cells.filter(Boolean).length === HRV_FILTERS.length;
  return (
    <View style={{ position: 'relative', flexDirection: 'row', alignItems: 'center' }}>
      {measured && (
        <Animated.View
          style={{
            position: 'absolute', top: 0, bottom: 0, left: 0, borderRadius: radius.pill, backgroundColor: p.surface2,
            width: anim.interpolate({ inputRange: HRV_FILTERS.map((_, i) => i), outputRange: cells.map((c) => c.w) }),
            transform: [{ translateX: anim.interpolate({ inputRange: HRV_FILTERS.map((_, i) => i), outputRange: cells.map((c) => c.x) }) }],
          }}
        />
      )}
      {HRV_FILTERS.map((o, i) => {
        const on = o.val === value;
        return (
          <Pressable
            key={o.val}
            onPress={() => onChange(o.val)}
            onLayout={(e) => {
              const { x, width } = e.nativeEvent.layout;
              setCells((prev) => {
                if (prev[i] && prev[i].x === x && prev[i].w === width) return prev;
                const next = prev.slice();
                next[i] = { x, w: width };
                return next;
              });
            }}
            style={{ paddingVertical: 6, paddingHorizontal: 13, alignItems: 'center', zIndex: 1 }}
          >
            <Text style={{ fontSize: 14, fontWeight: '600', color: on ? '#fff' : p.textDim }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Structured (breathHrv) key, unstructured (hrv) key, grade band, integer?,
// short inline description + longer "?" help copy.
const METRICS: { label: string; s: string; u: string; band: string; integer?: boolean; desc: string; help: string }[] = [
  {
    label: 'SDNN', s: 'sdnn', u: 'sdnn', band: 'sdnn', integer: true,
    desc: 'Overall variability across the whole reading, the broadest HRV summary.',
    help: 'Standard deviation of all RR intervals in the reading. SDNN captures every rhythm influence (breathing, blood-pressure waves, slower autonomic swings), so it summarizes total variability rather than just vagal activity. In short readings it runs lower than 24-hour figures you may see quoted elsewhere.',
  },
  {
    label: 'RMSSD', s: 'rmssd', u: 'rmssd', band: 'rmssdS', integer: true,
    desc: 'Beat-to-beat variation in your heart rate, a quick read on recovery and rest-state balance.',
    help: 'Root mean square of successive RR-interval differences. RMSSD is the workhorse HRV metric: it reflects parasympathetic (vagal) activity, and higher values generally mean better recovery capacity. Compare readings taken at the same time of day and in the same position. A consistent morning reading is the most reliable trend line.',
  },
  {
    label: 'pNN50', s: 'pnn50', u: 'pnn50', band: 'pnn50', integer: true,
    desc: 'Share of beats that differ from the previous one by more than 50 ms.',
    help: 'The percentage of successive heartbeat intervals that differ by more than 50 ms. Like RMSSD it tracks vagal tone, but it saturates at the extremes. Expect it to move together with RMSSD, and treat sustained changes as more meaningful than single readings.',
  },
  {
    label: 'Avg HR', s: 'hr', u: 'avgHr', band: 'hrBreath', integer: true,
    desc: 'Average heart rate across the reading.',
    help: 'Mean heart rate during the capture. A drifting resting rate is one of the simplest autonomic signals: a falling trend usually accompanies improving recovery, while an unexplained sustained rise is worth noting alongside symptoms.',
  },
  {
    label: 'Mean RR', s: 'meanRr', u: 'meanRr', band: 'rrMode', integer: true,
    desc: 'Average time between beats, in milliseconds, the inverse of heart rate.',
    help: 'The mean interval between successive beats. It is the same information as average heart rate seen from the other side (60,000 ÷ HR), but HRV work is done in RR space, so it is shown in milliseconds here.',
  },
  {
    label: 'MxDMn', s: 'mxdmn', u: 'mxdmn', band: 'mxdmn',
    desc: 'Spread between your longest and shortest beat intervals.',
    help: 'The difference between the maximum and minimum RR interval in the reading. A wide spread generally reflects healthy variability; a narrow one a rigid rhythm. It is sensitive to stray artifacts, so a single odd value matters less than the trend.',
  },
  {
    label: 'Mode', s: 'mode', u: 'mode', band: 'rrMode', integer: true,
    desc: 'Your most common beat interval, where the rhythm settles.',
    help: 'The most frequently occurring RR interval. Together with AMo50 it describes the shape of your beat-interval distribution: the mode is its centre, and shifts in the mode track shifts in your underlying resting rate.',
  },
  {
    label: 'AMo50', s: 'amo50', u: 'amo50', band: 'amo50', integer: true,
    desc: 'How concentrated beats are around the mode; higher means a more rigid rhythm.',
    help: 'The share of beats falling in the modal 50 ms bin. When the autonomic system is under strain the rhythm concentrates around one interval and AMo50 climbs; relaxed states spread the distribution out and it falls.',
  },
  {
    label: 'CV', s: 'cv', u: 'cv', band: 'cv',
    desc: 'Variability relative to your average beat length.',
    help: 'Coefficient of variation: SDNN divided by the mean RR, as a percentage. Because it is normalized by heart rate it makes readings taken at different rates more comparable than raw SDNN.',
  },
  {
    label: 'Stress index', s: 'stressIndex', u: 'stressIndex', band: 'stressIndex', integer: true,
    desc: 'Baevsky strain index that climbs when the rhythm turns rigid under sympathetic load.',
    help: 'A composite of AMo50, mode, and MxDMn that rises steeply as the rhythm becomes rigid. Low and stable is the goal; spikes typically accompany stress, illness, or overreaching, and often lead symptoms by a day or two.',
  },
  {
    label: 'LF peak', s: 'lfPeak', u: 'lfPeak', band: 'lfPeak',
    desc: 'Dominant frequency in the low band; with slow breathing it should track your breath pace.',
    help: 'The frequency with the most power between 0.04 and 0.15 Hz. During paced breathing the LF peak generally mirrors your breathing pace, so it lands close to your breathing frequency. A 4/6 pattern (four seconds in, six out) is one breath every ten seconds, or 0.1 Hz, which is near the resonance frequency for most people. A clean session concentrates power at that peak, so an LF peak near your pacing frequency is a sign of good coherence.',
  },
  {
    label: 'HF peak', s: 'hfPeak', u: 'hfPeak', band: 'hfPeak',
    desc: 'Dominant frequency in the high band, usually your natural breathing rate.',
    help: 'The frequency with the most power between 0.15 and 0.4 Hz. At rest this band is driven by respiration (each breath speeds and slows the heart slightly), so the HF peak usually sits at your breathing rate.',
  },
];

const POWER_HELP = 'Total spectral power of the reading, split into very-low (VLF), low (LF) and high (HF) frequency bands. Bar height is the total in ms², and a higher total is generally better: it means the heart rhythm is varying freely, which is the sign of an adaptable, well-regulated autonomic system. But the mix matters as much as the total; a healthy reading spreads power across the bands rather than piling it into one.\n\nHF (0.15–0.4 Hz) is the fast, breath-linked band. It rides almost purely on parasympathetic (vagal) tone, the "rest and digest" branch, so strong HF means good recovery and calm. LF (0.04–0.15 Hz) is the slower baroreflex band around blood-pressure regulation; it carries a mix of both branches but leans sympathetic (the "fight or flight" side) when you are stressed or standing. Note that slow paced breathing deliberately pumps LF up, so a big LF share during a breathing exercise is expected, not a warning.\n\nVLF (below 0.04 Hz) reflects slow regulatory waves tied to thermoregulation, hormones and vascular tone. A VLF share that dominates the reading (with little HF) can point to poor vagal engagement, physical or emotional stress, poor sleep, inflammation, or simply a reading that was too short or too noisy to resolve the faster bands cleanly. Occasional high VLF is normal; a persistent pattern of high VLF with suppressed HF is worth watching. Growing total power with a balanced spread over weeks is a common recovery pattern.';

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

    return { bl, metricCharts, vlf, lf, hf, hasPower };
  }, [days, mode, ctx, filt]);

  const hasAny = view.metricCharts.length > 0 || view.hasPower;

  return (
    <View>
      {!hasAny ? (
        <Text style={{ color: p.textDim }}>No {filt === 'all' ? '' : filt + ' '}HRV readings in this range.</Text>
      ) : (
        <>
          {view.hasPower ? (
            <PowerSection bl={view.bl} vlf={view.vlf} lf={view.lf} hf={view.hf} />
          ) : null}

          {view.metricCharts.map(({ m, structured, unstructured }) => (
            <MetricSection key={m.label} m={m} structured={structured} unstructured={unstructured} buckets={view.bl} />
          ))}
        </>
      )}
    </View>
  );
}

/** Which HRV kind a metric section is showing. */
type Kind = 'hrv' | 'breath' | 'both';
const KIND_OPTS: { val: Kind; label: string }[] = [
  { val: 'breath', label: 'Breathing' }, { val: 'hrv', label: 'Unstructured' }, { val: 'both', label: 'Both' },
];

/** Text-link kind toggle (per the design comp) — active option in bright white
 *  with a short underline beneath it. */
function KindToggle({ value, onChange }: { value: Kind; onChange: (v: Kind) => void }) {
  const p = usePalette();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
      {KIND_OPTS.map((o) => {
        const on = o.val === value;
        return (
          <Pressable key={o.val} onPress={() => onChange(o.val)} hitSlop={6} style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: on ? '#fff' : p.textDim }}>{o.label}</Text>
            <View style={{ height: 2, borderRadius: 1, alignSelf: 'stretch', marginTop: 3, backgroundColor: on ? '#fff' : 'transparent' }} />
          </Pressable>
        );
      })}
    </View>
  );
}

/** Card container — the flat section design sits inside a surface card. */
function Section({ children }: { children: React.ReactNode }) {
  const p = usePalette();
  return <View style={{ backgroundColor: p.surface, borderColor: p.border, borderWidth: 1, borderRadius: radius.card, padding: 16, marginBottom: 12 }}>{children}</View>;
}

/** Section header per the comp: uppercase title + "?" (left), optional action
 *  (right); beneath it the big value with its dim suffix, then a description. */
function SectionHead({ title, help, value, suffix, desc, right }: {
  title: string; help: string; value: string | null; suffix: string; desc: string; right?: React.ReactNode;
}) {
  const p = usePalette();
  return (
    <View style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ flexShrink: 1, fontSize: 15, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, color: p.textDim }}>{title}</Text>
        <HelpDot title={title} text={help} />
        <View style={{ flex: 1 }} />
        {right}
      </View>
      {value != null ? (
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 7, marginTop: 6 }}>
          <Text style={{ fontSize: 27, fontFamily: fonts.numHeavy, color: p.text, fontVariant: ['tabular-nums'] }}>{value}</Text>
          <Text style={{ fontSize: 13, fontWeight: '600', color: p.textDim }}>{suffix}</Text>
        </View>
      ) : null}
      <Text style={{ color: p.textDim, fontSize: 13, lineHeight: 19, marginTop: 8 }}>{desc}</Text>
    </View>
  );
}

/** Mean of the non-null values in a series. */
const meanOf = (vals: (number | null)[]) => {
  const xs = vals.filter((v): v is number => v != null && !isNaN(v));
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
};

/**
 * One metric's flat section. "Both" compares structured vs unstructured in the
 * blue/green pair; a single kind hands LineChart exactly one series, which
 * makes it colour the trace with the grade-zone gradient instead. The big
 * value is the range average, or the bucket under your finger while dragging.
 */
function MetricSection({ m, structured, unstructured, buckets }: {
  m: (typeof METRICS)[number];
  structured: (number | null)[];
  unstructured: (number | null)[];
  buckets: { label: string }[];
}) {
  const p = usePalette();
  const [kind, setKind] = useState<Kind>('breath');
  const [showZones, setShowZones] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  useEffect(() => { setSel(null); }, [kind]);

  const series = kind === 'both'
    ? [
      { values: structured, color: STRUCT, label: 'Structured' },
      { values: unstructured, color: UNSTRUCT, label: 'Unstructured' },
    ]
    : kind === 'breath'
      ? [{ values: structured, color: STRUCT, label: 'Breathing' }]
      : [{ values: unstructured, color: UNSTRUCT, label: 'Unstructured' }];
  const empty = !series.some((s) => s.values.some((v) => v != null));

  // Big value: range average of the primary displayed series (structured when
  // comparing both), or the drag-selected bucket's value with its label.
  // A selection can outlive its dataset (Day→Week shrinks `buckets` while this
  // instance is reused), so an out-of-range index falls back to the average.
  const selIdx = sel != null && sel < buckets.length ? sel : null;
  const primary = series.find((s) => s.values.some((v) => v != null))?.values ?? [];
  const raw = selIdx != null ? primary[selIdx] : meanOf(primary);
  const value = raw == null ? null : fmtNum(m.integer ? Math.round(raw) : raw);
  const suffix = selIdx != null ? `(${buckets[selIdx]?.label ?? ''})` : 'avg';
  const zones = acBandZones(m.band);

  return (
    <Section>
      <SectionHead
        title={m.label}
        help={m.help}
        value={value}
        suffix={suffix}
        desc={m.desc}
        right={!empty && zones ? <ZonesToggle on={showZones} onPress={() => setShowZones((v) => !v)} /> : undefined}
      />
      <View style={{ marginBottom: 12 }}>
        <KindToggle value={kind} onChange={setKind} />
      </View>
      {empty ? (
        <Text style={{ color: p.textDim, fontSize: 13 }}>
          No {kind === 'breath' ? 'breathing' : 'unstructured'} readings in this range.
        </Text>
      ) : (
        <>
          <LineChart
            buckets={buckets}
            integer={m.integer}
            zones={zones}
            series={series}
            hideHeader
            zonesOn={showZones}
            onSelect={setSel}
          />
          {kind === 'both' ? <Legend items={[['Structured', STRUCT], ['Unstructured', UNSTRUCT]]} /> : null}
        </>
      )}
    </Section>
  );
}

/** Power distribution section: big total (range average or selected bucket). */
function PowerSection({ bl, vlf, lf, hf }: {
  bl: { label: string }[];
  vlf: (number | null)[]; lf: (number | null)[]; hf: (number | null)[];
}) {
  const [sel, setSel] = useState<number | null>(null);
  const totals = bl.map((_, i) => {
    const parts = [vlf[i], lf[i], hf[i]].filter((v): v is number => v != null);
    return parts.length ? parts.reduce((s, x) => s + x, 0) : null;
  });
  // Same stale-selection fallback as MetricSection — out-of-range → average.
  const selIdx = sel != null && sel < bl.length ? sel : null;
  const raw = selIdx != null ? totals[selIdx] : meanOf(totals);
  // Per-band breakdown mirrors the header: range average until a bar is
  // selected, then that bucket's values.
  const bandVal = (arr: (number | null)[]) => (selIdx != null ? arr[selIdx] : meanOf(arr));
  const bands = [
    { label: 'Very low', color: VLF, power: bandVal(vlf) },
    { label: 'Low', color: LF, power: bandVal(lf) },
    { label: 'High', color: HF, power: bandVal(hf) },
  ];
  const bandTotal = bands.reduce((s, b) => s + (b.power ?? 0), 0);
  const pct = (x: number | null) => (bandTotal && x != null ? Math.round((x / bandTotal) * 100) : 0);
  return (
    <Section>
      <SectionHead
        title="Power distribution"
        help={POWER_HELP}
        value={raw == null ? null : String(Math.round(raw))}
        suffix={selIdx != null ? `ms² · (${bl[selIdx]?.label ?? ''})` : 'ms² · avg'}
        desc="Total HRV power split across the VLF, LF and HF frequency bands."
      />
      <StackedBars
        buckets={bl}
        unit="ms²"
        hideHeader
        onSelect={setSel}
        segments={[
          { label: 'VLF', color: VLF, values: vlf },
          { label: 'LF', color: LF, values: lf },
          { label: 'HF', color: HF, values: hf },
        ]}
      />
      <BandBreakdown bands={bands} pct={pct} />
    </Section>
  );
}

/** Per-band readout matching the HRV reading deep-dive: dot + name on one row,
 *  the power number below, then "ms² · %" under that. */
function BandBreakdown({ bands, pct }: {
  bands: { label: string; color: string; power: number | null }[];
  pct: (x: number | null) => number;
}) {
  const p = usePalette();
  return (
    <View style={{ flexDirection: 'row', marginTop: 12, borderTopWidth: 1, borderTopColor: p.border, paddingTop: 12 }}>
      {bands.map((b) => (
        <View key={b.label} style={{ flex: 1, alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: b.color }} />
            <Text style={{ fontSize: 12, color: p.textDim, fontWeight: '600' }}>{b.label}</Text>
          </View>
          <Text style={{ fontSize: 17, fontWeight: '800', color: p.text, fontVariant: ['tabular-nums'], marginTop: 3 }}>{b.power == null ? '–' : Math.round(b.power)}</Text>
          <Text style={{ fontSize: 11, color: p.textDim }}>{`ms² · ${pct(b.power)}%`}</Text>
        </View>
      ))}
    </View>
  );
}

function Legend({ items }: { items: [string, string][] }) {
  const p = usePalette();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 10 }}>
      {items.map(([name, color]) => (
        <View key={name} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color }} />
          <Text style={{ fontSize: 12, color: p.textDim, fontWeight: '600' }}>{name}</Text>
        </View>
      ))}
    </View>
  );
}
