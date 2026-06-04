// ReadingSummary — read-only reading overview sheet with an Edit header action.
// Ported from legacy docs/index.html:
//   openReadingSummary       (~3463-3477)
//   metricRow                (~3200-3210)
//   genericReadingSummary    (~3479-3526)
//   orthostaticSummary       (~3531-3590)
//   breathingSummary         (~3606-3679)
//   bpSummary                (~3689-3732)
//   ecgSummary               (~3734-3769)
//   restingHrSummary         (~3773-3788)
//   bloodO2Summary           (~3790-3808)
//   unstructuredHrvSummary   (~3810-3850)
//   heroCard / sumCard helpers (~3441-3461)
//
// Decouplings from legacy globals:
//   - state.days  -> repo.allDays() (sparkline metricHistory)
//   - state.profile -> repo.getProfile() (computeScores + qtcBands sex + BMI height)
//   - openModal(build, { action }) -> openSheet(render, { action }); the Edit
//     action's onclick (readingForm) -> opts.onEdit passed in by the caller.
//   - buildSpark(...)/el(...) DOM building -> <Spark> + JSX components.
//   - GRADE_LABEL / CAT_POINTS / HRV_EXPLAIN / the bp derived-metric helpers /
//     ecgPattern are inlined here (kept verbatim) since they were summary-local.
//
// Numeric thresholds, explanation strings, weights, and category logic are
// preserved verbatim.

import React from 'react';
import { View } from 'react-native';
import { Box, Text } from '@ui/primitives';
import { useTheme } from '@ui/theme/ThemeProvider';
import { H2 } from '@ui/components/SheetText';
import { Spark } from '@ui/charts/Spark';
import { openSheet } from '@ui/sheets/useSheets';

import { useRepository } from '@data/RepositoryProvider';
import { READING_TYPES } from '@core/domain/readingTypes';
import { entryFields } from '@core/domain/entryHelpers';
import { isDivider, type InputField, type TypeDef } from '@core/domain/fieldSchema';
import { computeScores } from '@core/scoring/computeScores';
import {
  BANDS,
  bandsFor,
  catFromBands,
  qtcBands,
  restingHrBands,
  type Bands,
} from '@core/scoring/bands';
import { SCORE_COLORS, numOr, worstCat } from '@core/scoring/colors';
import { bmiFor, bmiZone } from '@core/scoring/bmi';
import { totalPower, expectedHf } from '@core/scoring/scorers';
import { metricHistory } from '@core/analytics/metricHistory';
import { fmtTime12 } from '@core/date/dateUtils';
import type { Reading, ScoreCategory } from '@core/types';

// ---------------------------------------------------------------------------
// Small inlined helpers (legacy summary-local)
// ---------------------------------------------------------------------------

const GRADE_LABEL: Record<string, string> = {
  great: 'Great',
  good: 'Good',
  ok: 'OK',
  bad: 'Bad',
  crash: 'Crash',
  concerning: 'Concerning',
  warning: 'Warning',
};

// legacy CAT_POINTS (~3604)
const CAT_POINTS: Record<string, number> = {
  great: 90,
  good: 75,
  ok: 55,
  bad: 38,
  crash: 18,
  concerning: 18,
  warning: 72,
};

// legacy HRV_EXPLAIN (~3592-3603)
const HRV_EXPLAIN: Record<string, string> = {
  rmssd: 'Beat-to-beat parasympathetic activity - your most reliable vagal-tone indicator.',
  pnn50: 'Percent of successive beats differing by 50ms+. Sensitive parasympathetic depth.',
  sdnn: 'Overall heart-rate variability. Reflects total autonomic activity.',
  hr: 'Beats per minute during the reading. Lower usually means more vagal dominance.',
  meanRr: 'Average milliseconds between beats (inverse of HR).',
  mxdmn: 'Longest minus shortest RR interval - the range of variability.',
  mode: 'Most common RR interval - a stability indicator.',
  amo50: 'Stress-index marker. Higher suggests sympathetic dominance.',
  cv: 'Relative variability. Higher is generally better.',
  coherence: 'Synchronization of heart rhythm with breathing - reflects vagal training.',
};

// legacy ecgPattern (~3178)
const ecgPattern = (r: Reading): string =>
  r.svt ? 'SVT' : r.otherArrhythmia ? 'Other' : r.sinus ? 'Sinus' : '-';

// legacy fmtNum (~3280)
const fmtNum = (v: number | null | undefined): string => {
  if (v == null) return '-';
  if (Number.isInteger(v)) return String(v);
  return Math.abs(v) < 1 ? v.toFixed(3) : v.toFixed(1);
};

// legacy numEx (~3277): numeric extractor for a field key.
const numEx = (key: string) => (rr: Reading): number | null => {
  const v = parseFloat(rr[key] as string);
  return isNaN(v) ? null : v;
};

// Derived blood-pressure metrics (legacy ~3682-3687).
const bpMap = (rr: Reading): number | null => {
  const s = +(rr.sys as number), d = +(rr.dia as number);
  return !isNaN(s) && !isNaN(d) ? (s + 2 * d) / 3 : null;
};
const bpPP = (rr: Reading): number | null => {
  const s = +(rr.sys as number), d = +(rr.dia as number);
  return !isNaN(s) && !isNaN(d) ? s - d : null;
};
const bpKerdo = (rr: Reading): number | null => {
  const d = +(rr.dia as number), p = +(rr.pulse as number);
  return !isNaN(d) && !isNaN(p) && p ? (1 - d / p) * 100 : null;
};
const bpRobinson = (rr: Reading): number | null => {
  const s = +(rr.sys as number), p = +(rr.pulse as number);
  return !isNaN(s) && !isNaN(p) ? (s * p) / 100 : null;
};
const bpKvas = (rr: Reading): number | null => {
  const s = +(rr.sys as number), d = +(rr.dia as number), p = +(rr.pulse as number);
  const pp = s - d;
  return !isNaN(p) && pp > 0 ? (10 * p) / pp : null;
};
const bpBce = (rr: Reading): number | null => {
  const s = +(rr.sys as number), d = +(rr.dia as number), p = +(rr.pulse as number);
  return !isNaN(s) && !isNaN(d) && !isNaN(p) ? (s - d) * p : null;
};

// rowScoreCategory (legacy ~3161-3175) — overall tint for a reading row/hero.
function rowScoreCategory(r: Reading, s: Record<string, ScoreCategory>): ScoreCategory | null {
  switch (r.type) {
    case 'hrv': return s.sdnn ?? null;
    case 'breathHrv': return s.overall || s.sdnn || null;
    case 'bp': return s.bp ?? null;
    case 'bloodO2': return s.value ?? null;
    case 'restingHr': return s.hr ?? null;
    case 'ecg': return s.overall ?? null;
    case 'mood': return s.mood ?? null;
    case 'weight': return s.weight ?? null;
    case 'orthostatic': return s.overall || s.increase || null;
    default: return null;
  }
}

// readingRowValue (legacy ~3179-3190) — headline value string for the hero.
function readingRowValue(r: Reading, def: TypeDef | undefined): string {
  switch (r.type) {
    case 'hrv':
    case 'breathHrv':
      return r.sdnn != null && r.sdnn !== '' ? `${r.sdnn} SDNN` : '';
    case 'bp':
      return r.sys || r.dia ? `${r.sys || '-'}/${r.dia || '-'}` : '';
    case 'bloodO2':
      return r.value ? `${r.value}%` : '';
    case 'restingHr':
      return r.hr != null && r.hr !== '' ? `${r.hr} hr` : '';
    case 'ecg':
      return ecgPattern(r);
    case 'mood':
      return (
        ({
          'Feeling amazing': 'Amazing',
          'Feeling normal': 'Normal',
          'Feeling bad': 'Bad',
          'Feeling like a crash': 'Crash',
        } as Record<string, string>)[r.mood as string] || (r.mood as string) || ''
      );
    default: {
      // summarizeFields equivalent (first filled number field)
      for (const f of entryFields(def)) {
        if (isDivider(f)) continue;
        const ff = f as InputField;
        if (ff.type && ff.type !== 'number') continue;
        const v = r[ff.key];
        if (v != null && v !== '') return String(v) + (ff.unit || '');
      }
      return '';
    }
  }
}

// ---------------------------------------------------------------------------
// Layout primitives (legacy sumCard / heroCard / metricRow / power bar)
// ---------------------------------------------------------------------------

const hexA = (hex: string, a: number): string => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

// Parent section card; metric cards are nested inside it (legacy .sum-card).
function SumCard({ title, children }: { title?: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <Box
      style={{
        backgroundColor: t.surface,
        borderWidth: 1,
        borderColor: t.border,
        borderRadius: t.radius,
        padding: 12,
        marginTop: 12,
      }}
    >
      {title ? (
        <Text
          style={{
            fontSize: 12,
            textTransform: 'uppercase',
            letterSpacing: 0.7,
            color: t.textDim,
            fontWeight: '700',
            marginBottom: 4,
          }}
        >
          {title}
        </Text>
      ) : null}
      {children}
    </Box>
  );
}

// Colored "hero" header tinted by the rating, with a solid rating chip
// (legacy heroCard ~3447-3461).
interface HeroOpts {
  cat?: ScoreCategory | null;
  label?: string;
  big?: string | number | null;
  den?: string;
  sub?: string;
  tip?: string;
}
function HeroCard(o: HeroOpts) {
  const t = useTheme();
  const color = (o.cat && SCORE_COLORS[o.cat]) || '#9aa0a6';
  return (
    <Box
      style={{
        backgroundColor: hexA(color, 0.15),
        borderWidth: 1,
        borderColor: hexA(color, 0.45),
        borderRadius: t.radius,
        padding: 16,
        marginTop: 4,
      }}
    >
      {o.cat ? (
        <View style={{ flexDirection: 'row' }}>
          <Text
            style={{
              backgroundColor: color,
              color: '#fff',
              fontSize: 12,
              fontWeight: '700',
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 999,
              overflow: 'hidden',
            }}
          >
            {GRADE_LABEL[o.cat] || ''}
          </Text>
        </View>
      ) : null}
      {o.label ? (
        <Text style={{ color: t.textDim, fontSize: 13, marginTop: o.cat ? 8 : 0 }}>{o.label}</Text>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 4 }}>
        <Text style={{ color: t.text, fontSize: 34, fontWeight: '800', lineHeight: 38 }}>
          {o.big != null && o.big !== '' ? String(o.big) : '-'}
        </Text>
        {o.den ? (
          <Text style={{ color: t.textDim, fontSize: 14, marginLeft: 4, marginBottom: 5 }}>
            {o.den}
          </Text>
        ) : null}
      </View>
      {o.sub ? <Text style={{ color: t.textDim, fontSize: 13, marginTop: 2 }}>{o.sub}</Text> : null}
      {o.tip ? <Text style={{ color: t.text, fontSize: 13, marginTop: 8 }}>{o.tip}</Text> : null}
    </Box>
  );
}

// metricRow (legacy ~3200-3210): score dot, name, tinted value, explanation, spark.
// `cat === false` => no dot (legacy convention); a `spark` ReactNode renders below.
function MetricRow({
  label,
  value,
  cat,
  explain,
  spark,
}: {
  label: string;
  value: string | number | null | undefined;
  cat?: ScoreCategory | null | false;
  explain?: string;
  spark?: React.ReactNode;
}) {
  const t = useTheme();
  const dotColor = cat && SCORE_COLORS[cat] ? SCORE_COLORS[cat] : t.border;
  return (
    <View
      style={{
        paddingVertical: 8,
        borderTopWidth: 1,
        borderTopColor: t.border,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {cat === false ? null : (
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: dotColor,
              marginRight: 8,
            }}
          />
        )}
        <Text style={{ flex: 1, color: t.text, fontSize: 14 }}>{label}</Text>
        <Text style={{ color: t.text, fontSize: 14, fontWeight: '600' }}>
          {value == null || value === '' ? '-' : String(value)}
        </Text>
      </View>
      {explain ? (
        <Text style={{ color: t.textDim, fontSize: 12, marginTop: 4 }}>{explain}</Text>
      ) : null}
      {spark ? <View style={{ marginTop: 8 }}>{spark}</View> : null}
    </View>
  );
}

// Free-text card content (legacy .sum-text inside a .metric-card).
function SumText({ text }: { text: string }) {
  const t = useTheme();
  return <Text style={{ color: t.text, fontSize: 14, lineHeight: 20 }}>{text}</Text>;
}

// Power-distribution bar (legacy .powerbar ~3648-3651).
function PowerBar({
  vlf,
  lf,
  hf,
  total,
}: {
  vlf: number | null;
  lf: number | null;
  hf: number | null;
  total: number;
}) {
  const t = useTheme();
  const pct = (x: number | null): number => Math.round(((x || 0) / total) * 100);
  const segs: { v: number | null; color: string; lab: string }[] = [
    { v: vlf, color: '#f59e0b', lab: 'VLF' },
    { v: lf, color: '#6366f1', lab: 'LF' },
    { v: hf, color: '#22c55e', lab: 'HF' },
  ];
  return (
    <View>
      <View
        style={{
          flexDirection: 'row',
          height: 22,
          borderRadius: 6,
          overflow: 'hidden',
          marginTop: 4,
        }}
      >
        {segs.map((s, i) => {
          if (s.v == null) return null;
          const p = pct(s.v);
          return (
            <View
              key={i}
              style={{
                width: `${p}%`,
                backgroundColor: s.color,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {p >= 12 ? (
                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{`${s.lab} ${p}%`}</Text>
              ) : null}
            </View>
          );
        })}
      </View>
      <Text style={{ color: t.textDim, fontSize: 11, marginTop: 6 }}>
        {`VLF ${pct(vlf)}% · LF ${pct(lf)}% · HF ${pct(hf)}%`}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Spark wiring — reads allDays() from the repo so history is reactive.
// ---------------------------------------------------------------------------

function useSpark() {
  const repo = useRepository();
  const days = repo.allDays();
  return (type: string, extractor: (r: Reading) => number | null, bands?: Bands | null, limit = 15) => (
    <Spark points={metricHistory(days, type, extractor, limit)} bands={bands} />
  );
}

// ---------------------------------------------------------------------------
// Per-type summaries
// ---------------------------------------------------------------------------

function GenericSummary({ r }: { r: Reading }) {
  const repo = useRepository();
  const profile = repo.getProfile();
  const def = READING_TYPES[r.type];
  const s = computeScores(r, profile);
  const spark = useSpark();
  const rv = readingRowValue(r, def);

  if (r.type === 'weight') {
    const bmi = bmiFor(r.weight as number | string | null | undefined, profile.height);
    const z = bmi != null ? bmiZone(bmi) : null;
    const verdict: Record<string, string> = {
      Underweight: 'Below the healthy BMI range.',
      Healthy: 'Weight is in the healthy BMI range.',
      Overweight: 'Above the healthy BMI range.',
      Obese: 'Well above the healthy BMI range.',
    };
    return (
      <>
        <HeroCard
          cat={rowScoreCategory(r, s)}
          label="Weight"
          big={r.weight != null && r.weight !== '' ? (r.weight as string) : ''}
          den="lbs"
          sub={z ? `BMI ${bmi!.toFixed(1)} · ${z.zone}` : 'Set your height in Profile for BMI'}
          tip={z ? verdict[z.zone] || '' : ''}
        />
        <SumCard title="Details">
          {renderDetailFields(r, def, s, spark)}
          {bmi != null ? (
            <MetricRow
              label="BMI"
              value={`${bmi.toFixed(1)} · ${bmiZone(bmi).zone}`}
              cat={bmiZone(bmi).cat}
              explain="Body Mass Index from this weight and the height set in Profile. Zones: under 18.5 underweight, 18.5–24.9 healthy, 25–29.9 overweight, 30+ obese."
            />
          ) : (
            <MetricRow
              label="BMI"
              value="-"
              cat={null}
              explain="Set your height in Profile to grade weight by BMI."
            />
          )}
        </SumCard>
      </>
    );
  }

  return (
    <>
      <HeroCard cat={rowScoreCategory(r, s)} big={typeof rv === 'string' ? rv : ''} label="Result" />
      <SumCard title="Details">{renderDetailFields(r, def, s, spark)}</SumCard>
    </>
  );
}

// Shared field renderer for the generic Details card (legacy ~3504-3515).
function renderDetailFields(
  r: Reading,
  def: TypeDef | undefined,
  s: Record<string, ScoreCategory>,
  spark: ReturnType<typeof useSpark>,
): React.ReactNode {
  const out: React.ReactNode[] = [];
  entryFields(def).forEach((f, i) => {
    if (isDivider(f)) return;
    const ff = f as InputField;
    if (ff.type === 'time') return;
    if (ff.type === 'check') {
      out.push(
        <MetricRow
          key={i}
          label={ff.label}
          value={r[ff.key] ? 'Yes' : 'No'}
          cat={r[ff.key] ? (ff.key === 'sinus' ? 'great' : 'bad') : null}
        />,
      );
      return;
    }
    if (ff.type === 'textarea') {
      if (r[ff.key]) {
        out.push(<TextAreaRow key={i} label={ff.label} text={String(r[ff.key])} />);
      }
      return;
    }
    const v = r[ff.key];
    if (v == null || v === '') return;
    out.push(
      <MetricRow
        key={i}
        label={ff.label}
        value={(v as string) + (ff.unit ? ` ${ff.unit}` : '')}
        cat={s[ff.key]}
        spark={spark(r.type, numEx(ff.key), bandsFor(r.type, ff.key))}
      />,
    );
  });
  return out;
}

function TextAreaRow({ label, text }: { label: string; text: string }) {
  const t = useTheme();
  return (
    <View style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: t.border }}>
      <Text style={{ color: t.text, fontSize: 14, fontWeight: '600', marginBottom: 4 }}>{label}</Text>
      <SumText text={text} />
    </View>
  );
}

function NotesCard({ r }: { r: Reading }) {
  if (!r.note) return null;
  return (
    <SumCard title="Notes">
      <SumText text={String(r.note)} />
    </SumCard>
  );
}

// Orthostatic (legacy ~3531-3590)
function OrthostaticSummary({ r }: { r: Reading }) {
  const spark = useSpark();
  const before = numOr(r.beforeHr), after = numOr(r.afterHr), min1 = numOr(r.hr1min);
  const increase = before != null && after != null ? after - before : null;
  const drop = after != null && min1 != null ? after - min1 : null;
  const incCat = increase != null ? catFromBands(increase, BANDS.orthoIncrease) : null;
  const dropCat = drop != null ? catFromBands(drop, BANDS.orthoRecovery) : null;
  const signed = (v: number): string => (v > 0 ? '+' + v : String(v));

  const verdict: Record<string, string> = {
    great: 'Minimal heart-rate rise on standing - a healthy orthostatic response.',
    good: 'Normal orthostatic rise, within the expected physiologic range.',
    ok: 'Borderline rise at the upper end of normal. Worth keeping an eye on.',
    bad: 'Large rise - at or above the adult ≥30 bpm POTS-range threshold. Note context like hydration, heat, deconditioning, or meds.',
    concerning: 'Marked rise - at or above the ≥40 bpm threshold. Hydrate, sit or lie down, and log the surrounding context.',
  };

  const incEx = (rr: Reading): number | null => {
    const b = numOr(rr.beforeHr), a = numOr(rr.afterHr);
    return b != null && a != null ? a - b : null;
  };
  const dropEx = (rr: Reading): number | null => {
    const a = numOr(rr.afterHr), m = numOr(rr.hr1min);
    return a != null && m != null ? a - m : null;
  };

  return (
    <>
      <HeroCard
        cat={incCat}
        label={(r.transition as string) || 'Orthostatic event'}
        big={increase != null ? signed(increase) : ''}
        den="bpm rise"
        sub="Rated on the heart-rate increase from baseline to standing."
        tip={incCat ? verdict[incCat] : 'Enter Before HR and After HR to rate this event.'}
      />

      <SumCard title="Heart rate">
        <OrthoDuo
          before={before != null ? String(before) : '-'}
          after={after != null ? String(after) : '-'}
        />
      </SumCard>

      <SumCard title="HR increase">
        <MetricRow
          label="Standing HR increase"
          value={increase != null ? signed(increase) + ' bpm' : ''}
          cat={incCat}
          explain="After HR minus Before HR. A sustained rise of 30+ bpm (40+ in teens) within 10 minutes of standing is the POTS threshold; a 10–20 bpm rise is a normal response."
          spark={spark('orthostatic', incEx, BANDS.orthoIncrease)}
        />
      </SumCard>

      <SumCard title="Recovery after 1 minute">
        <MetricRow
          label="HR after 1 min"
          value={min1 != null ? min1 + ' bpm' : ''}
          cat={false}
          explain="Heart rate one minute after standing, as recorded. As blood pressure rebounds a healthy response settles back toward baseline."
        />
        <MetricRow
          label="HR drop by 1 min"
          value={drop != null ? drop + ' bpm' : ''}
          cat={dropCat}
          explain="How far HR fell from its standing peak after one minute (Peak − HR@1min). A larger settle-down means stronger baroreflex and vagal recovery; little or no drop - or a further climb - points to an attenuated, dysautonomic response."
          spark={spark('orthostatic', dropEx, BANDS.orthoRecovery)}
        />
      </SumCard>

      <NotesCard r={r} />
    </>
  );
}

function OrthoDuo({ before, after }: { before: string; after: string }) {
  const t = useTheme();
  const Stat = ({ label, val, unit }: { label: string; val: string; unit: string }) => (
    <View style={{ flex: 1 }}>
      <Text style={{ color: t.textDim, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: t.text, fontSize: 28, fontWeight: '800' }}>{val}</Text>
      <Text style={{ color: t.textDim, fontSize: 11 }}>{unit}</Text>
    </View>
  );
  return (
    <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
      <Stat label="Before HR" val={before} unit="bpm · baseline" />
      <Stat label="After HR" val={after} unit="bpm · standing" />
    </View>
  );
}

// Breathing HRV (legacy ~3606-3679)
function BreathingSummary({ r }: { r: Reading }) {
  const repo = useRepository();
  const profile = repo.getProfile();
  const s = computeScores(r, profile);
  const spark = useSpark();
  const n = (k: string): number | null => {
    const x = parseFloat(r[k] as string);
    return isNaN(x) ? null : x;
  };
  const vlf = n('vlowPower'), lf = n('lowPower'), hf = n('highPower');
  const total = [vlf, lf, hf].some((v) => v != null)
    ? [vlf, lf, hf].reduce((a, b) => (a as number) + (b || 0), 0)
    : null;
  const lfhf = lf != null && hf ? lf / hf : null;
  const sp = (ex: (r: Reading) => number | null, bands?: Bands | null) => spark('breathHrv', ex, bands, 15);
  const lfhfEx = (rr: Reading): number | null => {
    const a = parseFloat(rr.lowPower as string), b = parseFloat(rr.highPower as string);
    return !isNaN(a) && !isNaN(b) && b !== 0 ? a / b : null;
  };

  const overall = worstCat([s.rmssd, s.pnn50, s.totalPower].filter(Boolean));
  const verdict: Record<string, string> = {
    great: 'Strong parasympathetic reserves today. Fine for your normal protocol or intervals.',
    good: 'Solid recovery state. Easy to normal activity is reasonable.',
    ok: 'Moderate reserves. Keep it easy and avoid pushing.',
    bad: 'Low reserves. Favor rest and gentle activity today.',
    crash: 'Very low reserves. Prioritize rest and recovery.',
  };
  const weights: Record<string, number> = {
    rmssd: 25,
    pnn50: 15,
    totalPower: 15,
    lfPeak: 20,
    hfPeak: 15,
    lfhf: 10,
  };
  let sum = 0, wsum = 0;
  Object.keys(weights).forEach((k) => {
    const c = s[k];
    if (c && CAT_POINTS[c] != null) {
      sum += CAT_POINTS[c] * weights[k];
      wsum += weights[k];
    }
  });

  const e = expectedHf(r.style as string);

  return (
    <>
      <HeroCard
        cat={overall}
        label="Autonomic score"
        big={wsum ? Math.round(sum / wsum) : '-'}
        den={wsum ? '/100' : ''}
        sub="Composite of vagal tone, power, and baroreflex position."
        tip={(overall && verdict[overall]) || ''}
      />

      <SumCard title="Details">
        <MetricRow label="Coherence" value={r.coherence as string} cat={false} explain={HRV_EXPLAIN.coherence} />
        {r.style ? (
          <MetricRow label="Breathing style" value={r.style as string} cat={false} explain="Intended pace for this reading." />
        ) : null}
        {r.period ? <MetricRow label="Reading type" value={r.period as string} cat={false} /> : null}
        <MetricRow label="Swallowing" value={r.swallowing ? 'Yes' : 'No'} cat={false} />
      </SumCard>

      <SumCard title="Power">
        {total ? <PowerBar vlf={vlf} lf={lf} hf={hf} total={total} /> : null}
        <MetricRow
          label="Total power"
          value={total != null ? Math.round(total) : ''}
          cat={s.totalPower}
          explain="Total autonomic engagement across all frequencies."
          spark={sp((rr) => totalPower(rr), BANDS.totalPower)}
        />
        <MetricRow
          label="LF/HF ratio"
          value={lfhf != null ? lfhf.toFixed(2) : ''}
          cat={s.lfhf}
          explain="Sympathetic vs vagal balance. Balanced or low favors flexibility."
          spark={sp(lfhfEx, BANDS.lfhf)}
        />
        <MetricRow
          label="VLF power"
          value={r.vlowPower as string}
          cat={s.vlf}
          explain="Slow regulatory processes and stress load. Elevated means system stress."
          spark={sp(numEx('vlowPower'), BANDS.vlf)}
        />
        <MetricRow
          label="LF power"
          value={r.lowPower as string}
          cat={null}
          explain="Baroreflex band, your training target."
          spark={sp(numEx('lowPower'), null)}
        />
        <MetricRow
          label="HF power"
          value={r.highPower as string}
          cat={null}
          explain="Vagal activity tied to breathing. Higher means better recovery state."
          spark={sp(numEx('highPower'), null)}
        />
        <MetricRow
          label="LF peak"
          value={r.lfPeak ? `${r.lfPeak} Hz` : ''}
          cat={s.lfPeak}
          explain="Baroreflex frequency. Target 0.08 to 0.10 Hz; shifting toward it is progress."
          spark={sp(numEx('lfPeak'), BANDS.lfPeak)}
        />
        <MetricRow
          label="HF peak"
          value={r.hfPeak ? `${r.hfPeak} Hz` : ''}
          cat={s.hfPeak}
          explain={
            e
              ? `Expected about ${e[0]} to ${e[1]} Hz for ${r.style} breathing; large deviation means the pace drifted.`
              : 'Respiratory peak position.'
          }
          spark={sp(numEx('hfPeak'), null)}
        />
      </SumCard>

      <SumCard title="Metrics">
        <MetricRow label="RMSSD" value={r.rmssd as string} cat={s.rmssd} explain={HRV_EXPLAIN.rmssd} spark={sp(numEx('rmssd'), BANDS.rmssdS)} />
        <MetricRow label="pNN50" value={r.pnn50 ? `${r.pnn50}%` : ''} cat={s.pnn50} explain={HRV_EXPLAIN.pnn50} spark={sp(numEx('pnn50'), BANDS.pnn50)} />
        <MetricRow label="SDNN" value={r.sdnn as string} cat={s.sdnn} explain={HRV_EXPLAIN.sdnn} spark={sp(numEx('sdnn'), BANDS.sdnn)} />
        <MetricRow label="HR" value={r.hr as string} cat={s.hr} explain={HRV_EXPLAIN.hr} spark={sp(numEx('hr'), BANDS.hrBreath)} />
        <MetricRow label="Mean RR" value={r.meanRr as string} cat={s.meanRr} explain={HRV_EXPLAIN.meanRr} spark={sp(numEx('meanRr'), BANDS.rrMode)} />
        <MetricRow label="MxDMn" value={r.mxdmn as string} cat={s.mxdmn} explain={HRV_EXPLAIN.mxdmn} spark={sp(numEx('mxdmn'), BANDS.mxdmn)} />
        <MetricRow label="Mode" value={r.mode as string} cat={s.mode} explain={HRV_EXPLAIN.mode} spark={sp(numEx('mode'), BANDS.rrMode)} />
        <MetricRow label="AMo50" value={r.amo50 as string} cat={s.amo50} explain={HRV_EXPLAIN.amo50} spark={sp(numEx('amo50'), BANDS.amo50)} />
        <MetricRow label="CV" value={r.cv as string} cat={s.cv} explain={HRV_EXPLAIN.cv} spark={sp(numEx('cv'), BANDS.cv)} />
      </SumCard>

      <NotesCard r={r} />
    </>
  );
}

// Blood pressure (legacy ~3689-3732)
function BpSummary({ r }: { r: Reading }) {
  const repo = useRepository();
  const profile = repo.getProfile();
  const s = computeScores(r, profile);
  const spark = useSpark();
  const cat = rowScoreCategory(r, s);
  const verdict: Record<string, string> = {
    great: 'Pressure is in a healthy range.',
    good: 'Pressure is reasonable today.',
    ok: 'Slightly outside your ideal range; keep an eye on it.',
    bad: 'Out of range; note context like salt, fluids, meds, or stress.',
    concerning: 'Well outside range; consider rechecking and noting context.',
  };

  const Stat = ({ label, ex, bands, explain }: { label: string; ex: (r: Reading) => number | null; bands: Bands; explain: string }) => {
    const v = ex(r);
    const c = v != null && bands ? catFromBands(v, bands) : null;
    return (
      <MetricRow
        label={label}
        value={v != null ? fmtNum(v) : ''}
        cat={c}
        explain={explain}
        spark={spark('bp', ex, bands)}
      />
    );
  };

  return (
    <>
      <HeroCard
        cat={cat}
        label="Blood pressure"
        big={r.sys || r.dia ? `${r.sys || '-'}/${r.dia || '-'}` : ''}
        sub="Systolic / diastolic"
        tip={(cat && verdict[cat]) || ''}
      />

      <SumCard title="Details">
        <MetricRow label="Systolic" value={r.sys as string} cat={s.sys} explain="Peak arterial pressure during a heartbeat." spark={spark('bp', numEx('sys'), BANDS.sys)} />
        <MetricRow label="Diastolic" value={r.dia as string} cat={s.dia} explain="Arterial pressure between beats." spark={spark('bp', numEx('dia'), BANDS.dia)} />
        <MetricRow label="Pulse" value={r.pulse as string} cat={false} explain="Heart rate at the time of the reading." spark={spark('bp', numEx('pulse'), null)} />
        {r.period ? <MetricRow label="Reading type" value={r.period as string} cat={false} /> : null}
      </SumCard>

      <SumCard title="Pressure statistics">
        <Stat label="Mean arterial pressure" ex={bpMap} bands={BANDS.map} explain="Average pressure perfusing your organs and brain. Low MAP drives lightheadedness and poor cerebral perfusion in dysautonomia; very high strains the system." />
        <Stat label="Pulse pressure" ex={bpPP} bands={BANDS.pp} explain="Gap between systolic and diastolic. Low (under 30) suggests low stroke volume or dehydration; high (over 60) suggests arterial stiffness." />
      </SumCard>

      <SumCard title="Indexes">
        <Stat label="Kerdo index" ex={bpKerdo} bands={BANDS.kerdo} explain="Autonomic balance from pulse and diastolic. Positive means sympathetic dominance, negative means parasympathetic; near zero is balanced." />
        <Stat label="Robinson index" ex={bpRobinson} bands={BANDS.robinson} explain="Double product (systolic x pulse / 100): myocardial oxygen demand and cardiac workload at rest. Lower is more efficient." />
        <Stat label="BCE index" ex={bpBce} bands={BANDS.bce} explain="Blood-circulation economy (pulse pressure x pulse). Higher values mean a less economical, more strained circulation." />
        <Stat label="Kvas coefficient" ex={bpKvas} bands={BANDS.kvas} explain="Coefficient of endurance (10 x pulse / pulse pressure). Around 16 is typical; higher suggests cardiovascular fatigue, lower suggests stronger conditioning." />
      </SumCard>

      <NotesCard r={r} />
    </>
  );
}

// ECG (legacy ~3734-3769)
function EcgSummary({ r }: { r: Reading }) {
  const repo = useRepository();
  const profile = repo.getProfile();
  const s = computeScores(r, profile);
  const spark = useSpark();
  const verdict: Record<string, string> = {
    great: 'Clean reading - normal intervals and rhythm.',
    good: 'Largely normal intervals and rhythm.',
    ok: 'Minor findings worth monitoring.',
    bad: 'Abnormal findings; review context.',
    concerning: 'Significant findings; consider clinical follow-up.',
  };
  const spk = (key: string, bands: Bands) => spark('ecg', numEx(key), bands);
  const hrCat = r.hr !== '' && r.hr != null ? catFromBands(+(r.hr as number), BANDS.hrBreath) : null;

  return (
    <>
      <HeroCard cat={s.overall} label="ECG" big={ecgPattern(r)} sub="Rhythm" tip={(s.overall && verdict[s.overall]) || ''} />

      <SumCard title="Rhythm">
        <MetricRow label="Pattern" value={ecgPattern(r)} cat={s.rhythm} explain="Recorded rhythm. Sinus is normal; SVT or any other pattern is flagged." />
        <MetricRow label="Ectopic beats" value={r.ectopic as string} cat={s.ectopic} explain="Extra beats in the reading. A few are common; many, or runs, are concerning." spark={spk('ectopic', BANDS.ectopic)} />
      </SumCard>

      <SumCard title="Intervals">
        <MetricRow label="QRS" value={r.qrs as string} cat={s.qrs} explain="Ventricular depolarization time. A wide QRS can indicate a conduction delay." spark={spk('qrs', BANDS.qrs)} />
        <MetricRow label="QTc" value={r.qtc as string} cat={s.qtc} explain="Heart-rate-corrected QT. Prolongation raises arrhythmia risk; very short is also abnormal." spark={spark('ecg', numEx('qtc'), qtcBands(profile.sex))} />
        <MetricRow label="PR" value={r.pr as string} cat={s.pr} explain="AV conduction time from atria to ventricles." spark={spk('pr', BANDS.pr)} />
      </SumCard>

      <SumCard title="Rate & variability">
        <MetricRow label="HR" value={r.hr as string} cat={hrCat} explain="Heart rate during the ECG." spark={spk('hr', BANDS.hrBreath)} />
        <MetricRow label="HRV" value={r.hrv as string} cat={s.hrv} explain="Heart-rate variability captured by the ECG (SDNN-style)." spark={spk('hrv', BANDS.ecgHrv)} />
      </SumCard>

      <NotesCard r={r} />
      {r.techReview ? (
        <SumCard title="Technician review">
          <SumText text={String(r.techReview)} />
        </SumCard>
      ) : null}
    </>
  );
}

// Resting HR (legacy ~3773-3788)
function RestingHrSummary({ r }: { r: Reading }) {
  const repo = useRepository();
  const profile = repo.getProfile();
  const s = computeScores(r, profile);
  const spark = useSpark();
  const cat = rowScoreCategory(r, s);
  const verdict: Record<string, string> = {
    great: 'Resting heart rate is in a strong range.',
    good: 'Resting heart rate is healthy.',
    ok: 'Slightly elevated for rest.',
    bad: 'Elevated resting heart rate; note context.',
    concerning: 'High resting heart rate; consider rechecking and context.',
  };
  const band = restingHrBands(r.position as string);
  const hrCat = r.hr !== '' && r.hr != null ? catFromBands(+(r.hr as number), band) : null;
  return (
    <>
      <HeroCard cat={cat} label="Resting heart rate" big={(r.hr as string) || ''} den="bpm" sub={(r.position as string) || ''} tip={(cat && verdict[cat]) || ''} />
      <SumCard title="Heart rate">
        <MetricRow
          label="HR"
          value={r.hr as string}
          cat={hrCat}
          explain={`Resting heart rate (${((r.position as string) || 'laying').toLowerCase()}). Lower generally reflects stronger parasympathetic tone.`}
          spark={spark('restingHr', numEx('hr'), band)}
        />
        <MetricRow label="Position" value={r.position as string} cat={false} explain="Body position during the reading; thresholds differ for laying vs sitting." />
      </SumCard>
      <NotesCard r={r} />
    </>
  );
}

// Blood oxygen (legacy ~3790-3808)
function BloodO2Summary({ r }: { r: Reading }) {
  const repo = useRepository();
  const profile = repo.getProfile();
  const s = computeScores(r, profile);
  const spark = useSpark();
  const cat = rowScoreCategory(r, s);
  const verdict: Record<string, string> = {
    great: 'Oxygen saturation is excellent.',
    good: 'Oxygen saturation is good.',
    ok: 'Oxygen saturation is borderline.',
    bad: 'Low oxygen saturation; recheck.',
    concerning: 'Low oxygen saturation; recheck and note context.',
  };
  const piCat = r.perfusion !== '' && r.perfusion != null ? catFromBands(+(r.perfusion as number), BANDS.perfusion) : null;
  return (
    <>
      <HeroCard cat={cat} label="Blood oxygen" big={r.value ? `${r.value}%` : ''} sub="SpO2" tip={(cat && verdict[cat]) || ''} />
      <SumCard title="Oxygenation">
        <MetricRow
          label="Blood oxygen"
          value={r.value ? `${r.value}%` : ''}
          cat={s.value}
          explain="Percent of hemoglobin carrying oxygen. Use the left hand; the right can read low from peripheral vasoconstriction."
          spark={spark('bloodO2', numEx('value'), BANDS.spo2)}
        />
      </SumCard>
      <SumCard title="Signal quality">
        <MetricRow
          label="Perfusion index"
          value={r.perfusion as string}
          cat={piCat}
          explain="Signal strength of the reading. 5+ trust it, 2-4 moderate confidence, under 2 is unreliable (try another finger or hand)."
          spark={spark('bloodO2', numEx('perfusion'), BANDS.perfusion)}
        />
        <MetricRow label="Pulse" value={r.pulse as string} cat={false} explain="Heart rate at the time of the reading." spark={spark('bloodO2', numEx('pulse'), null)} />
      </SumCard>
      <NotesCard r={r} />
    </>
  );
}

// Unstructured HRV (legacy ~3810-3850)
function UnstructuredHrvSummary({ r }: { r: Reading }) {
  const repo = useRepository();
  const profile = repo.getProfile();
  const s = computeScores(r, profile);
  const spark = useSpark();
  const cat = rowScoreCategory(r, s);
  const verdict: Record<string, string> = {
    great: 'Strong readiness today.',
    good: 'Good readiness.',
    ok: 'Moderate readiness; keep it easy.',
    bad: 'Low readiness; favor rest.',
    crash: 'Very low readiness; prioritize rest.',
    warning: 'Readiness is unusually high (blue zone), which can signal fragility. Do less, not more.',
  };
  const sp = (k: string, bands?: Bands | null) => spark('hrv', numEx(k), bands);
  const lfhfEx = (rr: Reading): number | null => {
    const a = +(rr.lowPower as number), b = +(rr.highPower as number);
    return !isNaN(a) && !isNaN(b) && b ? a / b : null;
  };
  const lfhfV = lfhfEx(r);

  return (
    <>
      <HeroCard cat={cat} label="Readiness" big={r.readiness ? `${r.readiness}%` : ''} sub="Recovery readiness" tip={(cat && verdict[cat]) || ''} />

      <SumCard title="Readiness">
        <MetricRow label="Readiness" value={r.readiness ? `${r.readiness}%` : ''} cat={s.readiness} explain="Device recovery readiness. 70-85% is ideal; 86%+ can paradoxically signal fragility." spark={sp('readiness', BANDS.readiness)} />
      </SumCard>

      <SumCard title="Autonomic balance">
        <MetricRow label="PNS index" value={r.pns as string} cat={s.pns} explain="Parasympathetic (rest and recovery) activity. Higher means more vagal dominance." spark={sp('pns', BANDS.pns)} />
        <MetricRow label="SNS index" value={r.sns as string} cat={s.sns} explain="Sympathetic (activation and stress) activity. Lower is calmer." spark={sp('sns', BANDS.sns)} />
        <MetricRow label="Stress index" value={r.stressIndex as string} cat={s.stressIndex} explain="Baevsky stress index. Higher means more sympathetic strain and rigidity." spark={sp('stressIndex', BANDS.stressIndex)} />
      </SumCard>

      <SumCard title="Variability">
        <MetricRow label="RMSSD" value={r.rmssd as string} cat={s.rmssd} explain={HRV_EXPLAIN.rmssd} spark={sp('rmssd', BANDS.rmssdU)} />
        <MetricRow label="SDNN" value={r.sdnn as string} cat={s.sdnn} explain={HRV_EXPLAIN.sdnn} spark={sp('sdnn', BANDS.sdnn)} />
        <MetricRow label="Avg HR" value={r.avgHr as string} cat={s.avgHr} explain="Average heart rate during the reading. Lower usually reflects more vagal tone." spark={sp('avgHr', BANDS.hrBreath)} />
      </SumCard>

      <SumCard title="Power">
        <MetricRow label="Low power" value={r.lowPower as string} cat={false} explain="Low-frequency power (baroreflex and sympathovagal activity)." spark={sp('lowPower', null)} />
        <MetricRow label="High power" value={r.highPower as string} cat={false} explain="High-frequency power (vagal, tied to breathing)." spark={sp('highPower', null)} />
        <MetricRow label="LF/HF ratio" value={lfhfV != null ? fmtNum(lfhfV) : ''} cat={s.lfhf} explain="Sympathetic vs vagal balance. Balanced or low favors flexibility." spark={spark('hrv', lfhfEx, BANDS.lfhf)} />
      </SumCard>

      <SumCard title="Details">
        <MetricRow label="Physiological age" value={r.age as string} cat={false} explain="Device-estimated physiological age (not your actual age)." />
        <MetricRow label="Swallowing" value={r.swallowing ? 'Yes' : 'No'} cat={false} />
      </SumCard>

      <NotesCard r={r} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Root summary body — dispatches to the per-type view (legacy openReadingSummary)
// ---------------------------------------------------------------------------

function ReadingSummaryBody({ r }: { r: Reading }) {
  const t = useTheme();
  const def = READING_TYPES[r.type];
  let view: React.ReactNode;
  switch (r.type) {
    case 'breathHrv': view = <BreathingSummary r={r} />; break;
    case 'bp': view = <BpSummary r={r} />; break;
    case 'ecg': view = <EcgSummary r={r} />; break;
    case 'restingHr': view = <RestingHrSummary r={r} />; break;
    case 'bloodO2': view = <BloodO2Summary r={r} />; break;
    case 'hrv': view = <UnstructuredHrvSummary r={r} />; break;
    case 'orthostatic': view = <OrthostaticSummary r={r} />; break;
    default: view = <GenericSummary r={r} />;
  }
  return (
    <>
      <H2>{def?.label ?? ''}</H2>
      {r.time ? (
        <Text style={{ color: t.textDim, fontSize: 13, marginTop: -8, marginBottom: 8 }}>
          {fmtTime12(r.time)}
        </Text>
      ) : null}
      {view}
    </>
  );
}

/**
 * Opens a read-only reading-summary sheet with an Edit header action.
 * `opts.onEdit` runs when the user taps Edit (legacy stacked the editable form).
 */
export function openReadingSummary(
  reading: Reading,
  opts: { dateKey: string; onEdit: () => void },
): void {
  openSheet(() => <ReadingSummaryBody r={reading} />, {
    action: { icon: 'edit', label: 'Edit', onPress: opts.onEdit },
  });
}

export default openReadingSummary;
