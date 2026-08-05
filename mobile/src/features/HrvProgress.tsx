/**
 * Interactive HRV section for the Progress view, styled after the HRV design
 * comp: flat sections against the screen background separated by hairline
 * rules (no cards), each with an uppercase title + "?" help dot, a big value
 * line ("37 avg"), a one-line description, and — for metrics — a text-link
 * kind toggle (Both / Baseline / Training / Compare) plus a "Show zones"
 * link. "Both" (the default) averages every reading of either kind into one
 * trace; "Compare" overlays the two kinds in comparison colours; single-series
 * views draw one trace tinted by the grade-zone gradient. Power is a stacked
 * VLF/LF/HF bar per bucket. The big value shows the latest reading by default,
 * mirrors the bucket you drag on the chart, and returns to the latest when you
 * tap away.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { BalanceChart, LineChart, StackedBars, ZonesToggle, balanceCat } from '../components/charts';
import { Ghost, HelpDot, ScoreDot, TextGhost } from '../components/ui';
import { TAIL_STYLE, fonts, radius, readoutTail, usePalette } from '../theme';
import { fmtNum } from '../lib/dates';
import type { DayRecord, Entry, ScoreCat } from '../lib/types';
import { BANDS, catFromBands, HRV_HELP, type ScoreContext } from '../lib/scoring';
import { type DaysMap } from '../lib/scoring/day';
import { isTrustedReading } from '../lib/hrvQuality';
import {
  acBandZones, acBuckets, acReadVals, bucketViews, isEvening, isMorning, makeAgg,
  type BucketView, type Mode,
} from '../lib/analysis/buckets';

export type Filt = 'all' | 'morning' | 'evening';
/** All/Morning/Evening options — shared by the inline HRV header and the pinned
 * progress header so both toggles drive the same filter. */
export const HRV_FILTERS: { val: Filt; label: string }[] = [
  { val: 'all', label: 'All' }, { val: 'morning', label: 'Morning' }, { val: 'evening', label: 'Evening' },
];
const STRUCT = '#60a5fa';   // training — blue
const UNSTRUCT = '#a855f7'; // baseline — purple
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

// Training (breathHrv) key, baseline (hrv) key, grade band, integer?,
// short inline description + longer "?" help copy.
// (`unit` trails the big value, with the shown bucket's date after it; the
// stress index is a unitless composite, so it has none.)
const METRICS: { label: string; s: string; u: string; unit?: string; band: string; integer?: boolean; desc: string; help: string }[] = [
  {
    label: 'SDNN', s: 'sdnn', u: 'sdnn', unit: 'ms', band: 'sdnn', integer: true,
    desc: 'Overall variability across the whole reading, the broadest HRV summary.',
    help: 'Standard deviation of all RR intervals in the reading. SDNN captures every rhythm influence (breathing, blood-pressure waves, slower autonomic swings), so it summarizes total variability rather than just vagal activity. In short readings it runs lower than 24-hour figures you may see quoted elsewhere.',
  },
  {
    label: 'RMSSD', s: 'rmssd', u: 'rmssd', unit: 'ms', band: 'rmssdS', integer: true,
    desc: 'Beat-to-beat variation in your heart rate, a quick read on recovery and rest-state balance.',
    help: 'Root mean square of successive RR-interval differences. RMSSD is the workhorse HRV metric: it reflects parasympathetic (vagal) activity, and higher values generally mean better recovery capacity. Compare readings taken at the same time of day and in the same position. A consistent morning reading is the most reliable trend line.',
  },
  {
    label: 'pNN50', s: 'pnn50', u: 'pnn50', unit: '%', band: 'pnn50', integer: true,
    desc: 'Share of beats that differ from the previous one by more than 50 ms.',
    help: 'The percentage of successive heartbeat intervals that differ by more than 50 ms. Like RMSSD it tracks vagal tone, but it saturates at the extremes. Expect it to move together with RMSSD, and treat sustained changes as more meaningful than single readings.',
  },
  {
    label: 'Avg HR', s: 'hr', u: 'avgHr', unit: 'bpm', band: 'hrBreath', integer: true,
    desc: 'Average heart rate across the reading.',
    help: 'Mean heart rate during the capture. A drifting resting rate is one of the simplest autonomic signals: a falling trend usually accompanies improving recovery, while an unexplained sustained rise is worth noting alongside symptoms.',
  },
  {
    label: 'Mean RR', s: 'meanRr', u: 'meanRr', unit: 'ms', band: 'rrMode', integer: true,
    desc: 'Average time between beats, in milliseconds, the inverse of heart rate.',
    help: 'The mean interval between successive beats. It is the same information as average heart rate seen from the other side (60,000 ÷ HR), but HRV work is done in RR space, so it is shown in milliseconds here.',
  },
  {
    label: 'MxDMn', s: 'mxdmn', u: 'mxdmn', unit: 'ms', band: 'mxdmn',
    desc: 'Spread between your longest and shortest beat intervals.',
    help: 'The difference between the maximum and minimum RR interval in the reading. A wide spread generally reflects healthy variability; a narrow one a rigid rhythm. It is sensitive to stray artifacts, so a single odd value matters less than the trend.',
  },
  {
    label: 'Mode', s: 'mode', u: 'mode', unit: 'ms', band: 'rrMode', integer: true,
    desc: 'Your most common beat interval, where the rhythm settles.',
    help: 'The most frequently occurring RR interval. Together with AMo50 it describes the shape of your beat-interval distribution: the mode is its centre, and shifts in the mode track shifts in your underlying resting rate.',
  },
  {
    label: 'AMo50', s: 'amo50', u: 'amo50', unit: '%', band: 'amo50', integer: true,
    desc: 'How concentrated beats are around the mode; higher means a more rigid rhythm.',
    help: 'The share of beats falling in the modal 50 ms bin. When the autonomic system is under strain the rhythm concentrates around one interval and AMo50 climbs; relaxed states spread the distribution out and it falls.',
  },
  {
    label: 'CV', s: 'cv', u: 'cv', unit: '%', band: 'cv',
    desc: 'Variability relative to your average beat length.',
    help: 'Coefficient of variation: SDNN divided by the mean RR, as a percentage. Because it is normalized by heart rate it makes readings taken at different rates more comparable than raw SDNN.',
  },
  {
    label: 'LF peak', s: 'lfPeak', u: 'lfPeak', unit: 'Hz', band: 'lfPeak',
    desc: 'Dominant frequency in the low band; with slow breathing it should track your breath pace.',
    help: 'The frequency with the most power between 0.04 and 0.15 Hz. During paced breathing the LF peak generally mirrors your breathing pace, so it lands close to your breathing frequency. A 4/6 pattern (four seconds in, six out) is one breath every ten seconds, or 0.1 Hz, which is near the resonance frequency for most people. A clean session concentrates power at that peak, so an LF peak near your pacing frequency is a sign of good coherence.',
  },
  {
    label: 'HF peak', s: 'hfPeak', u: 'hfPeak', unit: 'Hz', band: 'hfPeak',
    desc: 'Dominant frequency in the high band, usually your natural breathing rate.',
    help: 'The frequency with the most power between 0.15 and 0.4 Hz. At rest this band is driven by respiration (each breath speeds and slows the heart slightly), so the HF peak usually sits at your breathing rate.',
  },
  // Kept last so the Balance chart (rendered just before it) closes out the deep
  // dives; see the `m.s === 'stressIndex'` branch in HrvProgress.
  {
    label: 'Stress index', s: 'stressIndex', u: 'stressIndex', band: 'stressIndex', integer: true,
    desc: 'Baevsky strain index that climbs when the rhythm turns rigid under sympathetic load.',
    help: 'A composite of AMo50, mode, and MxDMn that rises steeply as the rhythm becomes rigid. Low and stable is the goal; spikes typically accompany stress, illness, or overreaching, and often lead symptoms by a day or two.',
  },
];

const POWER_HELP = 'Total spectral power of the reading, split into very-low (VLF), low (LF) and high (HF) frequency bands. Bar height is the total in ms², and a higher total is generally better: it means the heart rhythm is varying freely, which is the sign of an adaptable, well-regulated autonomic system. But the mix matters as much as the total; a healthy reading spreads power across the bands rather than piling it into one.\n\nHF (0.15–0.4 Hz) is the fast, breath-linked band. It rides almost purely on parasympathetic (vagal) tone, the "rest and digest" branch, so strong HF means good recovery and calm. LF (0.04–0.15 Hz) is the slower baroreflex band around blood-pressure regulation; it carries a mix of both branches but leans sympathetic (the "fight or flight" side) when you are stressed or standing. Note that slow paced breathing deliberately pumps LF up, so a big LF share during a breathing exercise is expected, not a warning.\n\nVLF (below 0.04 Hz) reflects slow regulatory waves tied to thermoregulation, hormones and vascular tone. A VLF share that dominates the reading (with little HF) can point to poor vagal engagement, physical or emotional stress, poor sleep, inflammation, or simply a reading that was too short or too noisy to resolve the faster bands cleanly. Occasional high VLF is normal; a persistent pattern of high VLF with suppressed HF is worth watching. Growing total power with a balanced spread over weeks is a common recovery pattern.';

const POWER_DESC = 'Total HRV power split across the VLF, LF and HF frequency bands.';

const filterFor = (f: Filt) => (f === 'morning' ? isMorning : f === 'evening' ? isEvening : undefined);

/** Read a numeric key from readings of BOTH HRV kinds (for power). */
function readAnyHrv(d: DayRecord, key: string, filt?: (r: Entry) => boolean): number[] {
  const out: number[] = [];
  (d.readings || []).forEach((r) => {
    if (r.type !== 'hrv' && r.type !== 'breathHrv') return;
    if (!isTrustedReading(r)) return;
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
    const bl = bucketViews(buckets, mode);
    const { acAgg } = makeAgg(days, ctx);
    const f = filterFor(filt);

    const metricCharts = METRICS.map((m) => {
      const structured = acAgg(buckets, (d) => acReadVals(d, 'breathHrv', m.s, f));
      const unstructured = acAgg(buckets, (d) => acReadVals(d, 'hrv', m.u, f));
      // "Both": every reading of either kind pooled per bucket, so the average
      // weights each reading equally (not an average of the two kind-averages).
      const combined = acAgg(buckets, (d) => [
        ...acReadVals(d, 'breathHrv', m.s, f), ...acReadVals(d, 'hrv', m.u, f),
      ]);
      const has = structured.some((v) => v != null) || unstructured.some((v) => v != null);
      return { m, structured, unstructured, combined, has };
    }).filter((x) => x.has);

    // Power: average VLF/LF/HF per bucket over both HRV kinds → stacked bar.
    const vlf = acAgg(buckets, (d) => readAnyHrv(d, 'vlowPower', f));
    const lf = acAgg(buckets, (d) => readAnyHrv(d, 'lowPower', f));
    const hf = acAgg(buckets, (d) => readAnyHrv(d, 'highPower', f));
    const hasPower = [vlf, lf, hf].some((arr) => arr.some((v) => v != null));

    // Balance: average PNS/SNS per bucket over both HRV kinds → the two-line
    // band chart. Needs ≥2 buckets where both indices resolved.
    const pnsB = acAgg(buckets, (d) => readAnyHrv(d, 'pns', f));
    const snsB = acAgg(buckets, (d) => readAnyHrv(d, 'sns', f));
    const hasBalance = bl.filter((_, i) => pnsB[i] != null && snsB[i] != null).length >= 2;

    return { bl, metricCharts, vlf, lf, hf, hasPower, pnsB, snsB, hasBalance };
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

          {view.metricCharts.map(({ m, structured, unstructured, combined }) => (
            <React.Fragment key={m.label}>
              {m.s === 'stressIndex' && view.hasBalance ? (
                <BalanceSection bl={view.bl} pns={view.pnsB} sns={view.snsB} />
              ) : null}
              <MetricSection m={m} structured={structured} unstructured={unstructured} combined={combined} buckets={view.bl} />
            </React.Fragment>
          ))}
        </>
      )}
    </View>
  );
}

/**
 * Placeholder for the HRV section, shown while it waits its turn to mount and
 * under the range-change veil. HRV builds no cards, so its skeleton is written
 * out here instead: the same metric sections the range will open with (their
 * real titles, "?" copy, description and kind toggle — none of which depend on
 * the data) with a placeholder in place of the big value and the chart.
 */
export function HrvProgressSkeleton() {
  const p = usePalette();
  return (
    <View>
      {/* Power leads the real section whenever the range holds any HRV reading
          (every capture resolves the bands), so it leads the skeleton too. */}
      <Section>
        <SectionHead title="Power distribution" help={POWER_HELP} value={null} ghost suffix="" desc={POWER_DESC} />
        <Ghost h={160} r={radius.control} style={{ opacity: 0.55 }} />
        <View style={{ flexDirection: 'row', marginTop: 12, borderTopWidth: 1, borderTopColor: p.border, paddingTop: 12 }}>
          {[['Very low', VLF], ['Low', LF], ['High', HF]].map(([label, color]) => (
            <View key={label} style={{ flex: 1, alignItems: 'center' }}>
              {/* Band names and colours are fixed chrome — only the numbers go. */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: color }} />
                <Text style={{ fontSize: 12, color: p.textDim, fontWeight: '600' }}>{label}</Text>
              </View>
              <View style={{ marginTop: 3 }}>
                <TextGhost style={{ fontSize: 17, fontWeight: '800', fontVariant: ['tabular-nums'] }} sample="888" w={38} inset={2} r={4} />
              </View>
              <TextGhost style={{ fontSize: 11 }} sample="ms² · 00%" w={52} inset={2} r={4} />
            </View>
          ))}
        </View>
      </Section>
      {SKELETON_METRICS.map((m) => (
        <Section key={m.label}>
          <SectionHead
            title={m.label}
            help={m.help}
            value={null}
            ghost
            suffix=""
            desc={m.desc}
            right={<Text style={{ fontSize: 12, fontWeight: '700', color: p.accent }}>Show zones</Text>}
          />
          <View style={{ marginBottom: 12 }}>
            <KindToggle value="both" onChange={NOOP} />
          </View>
          <Ghost h={140} r={radius.control} style={{ opacity: 0.55 }} />
        </Section>
      ))}
    </View>
  );
}
// Power + the first metric is what the real section opens with, and enough to
// fill the viewport below the Outlook section.
const SKELETON_METRICS = METRICS.filter((m) => m.s === 'sdnn');
const NOOP = () => {};

/** Which HRV kind a metric section is showing. "both" averages every reading of
 *  either kind into one line; "compare" overlays the two kinds. */
type Kind = 'both' | 'breath' | 'hrv' | 'compare';
const KIND_OPTS: { val: Kind; label: string }[] = [
  { val: 'both', label: 'Both' }, { val: 'hrv', label: 'Baseline' },
  { val: 'breath', label: 'Training' }, { val: 'compare', label: 'Compare' },
];

/** Text-link kind toggle (per the design comp) — active option in bright white
 *  with a short underline beneath it. */
function KindToggle({ value, onChange }: { value: Kind; onChange: (v: Kind) => void }) {
  const p = usePalette();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 14, rowGap: 8 }}>
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
function SectionHead({ title, help, value, valueColor, value2, pair, suffix, desc, right, cat, ghost }: {
  title: string; help: string; value: string | null; valueColor?: string;
  value2?: { text: string; color: string } | null;
  /** Skeleton mode: the big value is a placeholder block of the same height. */
  ghost?: boolean;
  /** "Both" mode: each series as a legend dot + name on the first row with the
   *  value below it coloured to match (like the Balance/POTS readouts). When set
   *  it replaces the plain value/value2 row and the below-chart legend. */
  pair?: { label: string; color: string; text: string | null }[] | null;
  suffix: string; desc?: string; right?: React.ReactNode; cat?: ScoreCat | null;
}) {
  const p = usePalette();
  return (
    <View style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {cat ? <View style={{ marginRight: 7 }}><ScoreDot cat={cat} size={10} /></View> : null}
        <Text style={{ flexShrink: 1, fontSize: 15, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, color: p.textDim }}>{title}</Text>
        <HelpDot title={title} text={help} />
        <View style={{ flex: 1 }} />
        {right}
      </View>
      {pair ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: 6 }}>
          <View style={{ flexDirection: 'row', gap: 28 }}>
            {pair.map((pp, i) => (
              <View key={pp.label}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: pp.color }} />
                  <Text style={{ fontSize: 12, color: p.textDim, fontWeight: '600' }}>{pp.label}</Text>
                </View>
                <Text style={{ fontSize: 27, fontFamily: fonts.numHeavy, color: pp.color, fontVariant: ['tabular-nums'], marginTop: 3 }}>
                  {pp.text ?? '–'}
                  {/* Unit + date ride on the last value, as on the other cards. */}
                  {suffix && i === pair.length - 1 ? <Text style={TAIL_STYLE(p)}>{suffix}</Text> : null}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : ghost ? (
        // Invisible copy of the real value line, so the placeholder is exactly
        // as tall as the number it stands in for.
        <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 6 }}>
          <TextGhost style={{ fontSize: 27, fontFamily: fonts.numHeavy, fontVariant: ['tabular-nums'] }} sample="888" w={64} />
        </View>
      ) : value != null ? (
        <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 6 }}>
          <Text style={{ fontSize: 27, fontFamily: fonts.numHeavy, color: valueColor ?? p.text, fontVariant: ['tabular-nums'] }}>{value}</Text>
          {value2 ? (
            <Text style={{ fontSize: 27, fontFamily: fonts.numHeavy, color: value2.color, fontVariant: ['tabular-nums'], marginLeft: 14 }}>{value2.text}</Text>
          ) : null}
          <Text style={TAIL_STYLE(p)}>{suffix}</Text>
        </View>
      ) : null}
      {desc ? <Text style={{ color: p.textDim, fontSize: 13, lineHeight: 19, marginTop: 8 }}>{desc}</Text> : null}
    </View>
  );
}

/**
 * One metric's flat section. "Compare" overlays training vs baseline in
 * the blue/purple pair; every other kind (including the default "Both"
 * average) hands LineChart exactly one series, which makes it colour the trace
 * with the grade-zone gradient instead. The big value is the latest reading,
 * or the bucket under your finger while dragging.
 */
function MetricSection({ m, structured, unstructured, combined, buckets }: {
  m: (typeof METRICS)[number];
  structured: (number | null)[];
  unstructured: (number | null)[];
  combined: (number | null)[];
  buckets: BucketView[];
}) {
  const p = usePalette();
  const [kind, setKind] = useState<Kind>('both');
  const [showZones, setShowZones] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  useEffect(() => { setSel(null); }, [kind]);

  const series = kind === 'compare'
    ? [
      { values: structured, color: STRUCT, label: 'Training' },
      { values: unstructured, color: UNSTRUCT, label: 'Baseline' },
    ]
    : kind === 'breath'
      ? [{ values: structured, color: STRUCT, label: 'Training' }]
      : kind === 'hrv'
        ? [{ values: unstructured, color: UNSTRUCT, label: 'Baseline' }]
        : [{ values: combined, color: STRUCT, label: 'Both' }];
  const empty = !series.some((s) => s.values.some((v) => v != null));

  // Big value: the latest reading by default (the newest bucket the shown
  // kind(s) have data in, its label in parentheses), or the drag-selected
  // bucket's value. Tapping away from the chart blurs the selection back to
  // the latest. In "Compare" mode the baseline and training values sit
  // side by side, each tinted its series colour, with the label after the pair.
  // A selection can outlive its dataset (Day→Week shrinks `buckets` while this
  // instance is reused), so an out-of-range index falls back to the latest.
  const selIdx = sel != null && sel < buckets.length ? sel : null;
  const latestIdx = (() => {
    for (let i = buckets.length - 1; i >= 0; i--) {
      if (series.some((s) => { const v = s.values[i]; return v != null && !isNaN(v); })) return i;
    }
    return null;
  })();
  const shownIdx = selIdx ?? latestIdx;
  const pickVal = (vals: (number | null)[]) => (shownIdx != null ? vals[shownIdx] : null);
  const fmtVal = (v: number | null) => (v == null ? null : fmtNum(m.integer ? Math.round(v) : v));
  const sRaw = pickVal(structured);
  const uRaw = pickVal(unstructured);
  const compare = kind === 'compare' && (sRaw != null || uRaw != null);
  const raw = kind === 'compare' ? (sRaw ?? uRaw) : kind === 'breath' ? sRaw : kind === 'hrv' ? uRaw : pickVal(combined);
  const value = compare ? (fmtVal(sRaw) ?? '–') : fmtVal(raw);
  const valueColor = compare ? STRUCT : undefined;
  const value2 = compare ? { text: fmtVal(uRaw) ?? '–', color: UNSTRUCT } : null;
  const suffix = readoutTail(m.unit, shownIdx != null ? buckets[shownIdx]?.when : null);
  const zones = acBandZones(m.band);
  // Grade dot for the displayed value (range average or dragged bucket), so the
  // Progress cards read their grade at a glance like the reading deep-dive.
  const cat = raw != null && BANDS[m.band] ? catFromBands(raw, BANDS[m.band]) : null;

  return (
    <Section>
      <SectionHead
        title={m.label}
        help={m.help}
        cat={cat}
        value={value}
        valueColor={valueColor}
        value2={value2}
        pair={compare ? [
          { label: 'Baseline', color: UNSTRUCT, text: fmtVal(uRaw) },
          { label: 'Training', color: STRUCT, text: fmtVal(sRaw) },
        ] : null}
        suffix={suffix}
        desc={m.desc}
        right={!empty && zones ? <ZonesToggle on={showZones} onPress={() => setShowZones((v) => !v)} /> : undefined}
      />
      <View style={{ marginBottom: 12 }}>
        <KindToggle value={kind} onChange={setKind} />
      </View>
      {empty ? (
        <Text style={{ color: p.textDim, fontSize: 13 }}>
          No {kind === 'breath' ? 'training' : kind === 'hrv' ? 'baseline' : 'HRV'} readings in this range.
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
        </>
      )}
    </Section>
  );
}

/** Autonomic balance section: PNS vs SNS per bucket with the balance-coloured
 *  band fill. Only buckets where both indices resolved are plotted, so the band
 *  stays continuous. */
function BalanceSection({ bl, pns, sns }: {
  bl: BucketView[];
  pns: (number | null)[]; sns: (number | null)[];
}) {
  const pnsPts: { v: number; date: string; when: string | null }[] = [];
  const snsPts: { v: number; date: string; when: string | null }[] = [];
  bl.forEach((b, i) => {
    const pv = pns[i], sv = sns[i];
    if (pv != null && sv != null) {
      pnsPts.push({ v: pv, date: b.label, when: b.when });
      snsPts.push({ v: sv, date: b.label, when: b.when });
    }
  });
  if (pnsPts.length < 2) return null;
  // Default readout = the latest point; a drag selection overrides it and a
  // tap-away blur returns here (BalanceChart owns the selection state).
  const last = pnsPts.length - 1;
  return (
    <Section>
      <SectionHead title="Balance" help={HRV_HELP.balance} value={null} suffix="" cat={balanceCat(pnsPts[last].v, snsPts[last].v)} />
      <View style={{ marginTop: 16 }}>
        <BalanceChart
          pns={pnsPts} sns={snsPts}
          values={{ pns: pnsPts[last].v, sns: snsPts[last].v }}
          defaultWhen={pnsPts[last].when}
          desc="PNS and SNS index across the range. The fill turns green when you are recovered and red when stress takes over."
        />
      </View>
    </Section>
  );
}

/** Power distribution section: big total (latest bucket or selected bucket). */
function PowerSection({ bl, vlf, lf, hf }: {
  bl: BucketView[];
  vlf: (number | null)[]; lf: (number | null)[]; hf: (number | null)[];
}) {
  const [sel, setSel] = useState<number | null>(null);
  const totals = bl.map((_, i) => {
    const parts = [vlf[i], lf[i], hf[i]].filter((v): v is number => v != null);
    return parts.length ? parts.reduce((s, x) => s + x, 0) : null;
  });
  // Same stale-selection fallback as MetricSection — out-of-range → latest.
  const selIdx = sel != null && sel < bl.length ? sel : null;
  const latestIdx = (() => {
    for (let i = bl.length - 1; i >= 0; i--) if (totals[i] != null) return i;
    return null;
  })();
  const shownIdx = selIdx ?? latestIdx;
  const raw = shownIdx != null ? totals[shownIdx] : null;
  // Per-band breakdown mirrors the header: the latest bucket until a bar is
  // selected, then that bucket's values.
  const bandVal = (arr: (number | null)[]) => (shownIdx != null ? arr[shownIdx] : null);
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
        suffix={readoutTail('ms²', shownIdx != null ? bl[shownIdx]?.when : null)}
        desc={POWER_DESC}
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
