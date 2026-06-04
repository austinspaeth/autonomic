// DaySummary — the colored "Autonomic Outlook" hero card (rating, big score,
// gauge arc, guidance), the clean-day streak chip, and a "How this score was
// calculated" section. Ported from the legacy single-file app:
//   renderDaySummary (docs/index.html ~2243-2434)
//   compAccordion    (~2486-2516)
//   openScoreExplain (~2517-2576)
//   streakInfo       (~2208-2242)
//   SCORE_TIPS / OUTLOOK_GUIDE / TOMORROW maps, plus the supporting helpers
//   zoneAdvice / improveLine / fmtMetricVal / dayCleanliness / streakTier.
//
// Decouplings from the legacy globals:
//   - State is read via the Repository (useRepository / useRepoSelector). The
//     cross-day sleep lookup (prior day's bedtime → this day's wake) used by
//     dayCleanliness/streakInfo is reimplemented here against repo.getDay,
//     since the ported sleepHours(day) is single-day.
//   - GRADE_LABEL was a legacy global; defined locally here.
//   - openScoreExplain becomes an openSheet drawer; the inline accordions are
//     local collapsible React components (compAccordion).
//   - hexA (rgba-with-alpha) is reimplemented locally for the tinted hero.
import React, { useState } from 'react';
import { View, ScrollView } from 'react-native';
import type { Day, DateKey, Profile, Reading, ScoreCategory } from '@core/types';
import {
  scoreSet,
  blueZone,
  sleepGrade,
  activityGrade,
  type ScoreComp,
  type ScoreResult,
} from '@core/scoring/scoreSet';
import { GRADE_PTS, SCORE_COLORS, scoreCat } from '@core/scoring/colors';
import { catFromBands, type Bands } from '@core/scoring/bands';
import { keyOf, dateFromKey } from '@core/date/dateUtils';
import { useRepository, useRepoSelector } from '@data/RepositoryProvider';
import { Box, Icon, Pressable, Text } from '@ui/primitives';
import { Gauge } from '@ui/charts/Gauge';
import { H2 } from '@ui/components/SheetText';
import { openSheet } from '@ui/sheets/useSheets';
import { useTheme } from '@ui/theme/ThemeProvider';
import type { Tokens } from '@ui/theme/tokens';

// ---- legacy maps (verbatim) ----
const OUTLOOK_GUIDE: Record<string, string> = {
  Excellent:
    "Strong autonomic baseline. Good for the full protocol, including intervals, core, and strength. Capitalize on the capacity; don't push past the plan.",
  Good:
    "Solid baseline. Easy cycling, strength, normal activities. Hold off on intervals unless you've trended up across several days.",
  Moderate:
    'Reduced reserves. Walking, gentle activity, light core only. Skip cycling and intervals, and lean on hydration and rest.',
  Compromised:
    'Significantly reduced reserves. Rest, gentle stretching, basic ADLs. Avoid structured exercise and late dinners. This is a recovery day.',
  Bad:
    'System is stressed. Complete rest and gentle breathing only. Look at what\'s driving it: sleep, food, illness, or accumulated load.',
  Crash:
    'System in a crash state. Full rest, Liquid IV, magnesium, all meds. Check for illness or stacked triggers; seek care if symptoms warrant.',
};
const TOMORROW: Record<string, string> = {
  Excellent: 'Tomorrow likely Good to Excellent.',
  Good: 'Tomorrow likely Good.',
  Moderate: 'Tomorrow likely Moderate, so skip intervals.',
  Compromised: 'Tomorrow likely Compromised to Moderate, so keep it light.',
  Bad: 'Tomorrow likely Bad. Plan a rest day.',
  Crash: 'Tomorrow Bad to Crash. Prepare for full rest.',
};
const SCORE_TIPS: Record<string, string> = {
  'HRV (RMSSD)':
    'Vagal tone responds to rest, hydration, slow breathing, and avoiding triggers or over-exertion the day before.',
  'Total power':
    'Low total power means little overall autonomic engagement - favor rest, fluids, and gentle movement over intensity.',
  pNN50: 'Parasympathetic depth builds on genuine recovery days and consistent, earlier sleep.',
  'VLF power':
    'Elevated VLF reflects stress load - cut late stimulation, manage stress, and wind down earlier.',
  'LF peak':
    'Aim slow-breathing sessions toward about 0.08–0.10 Hz to train the baroreflex back into range.',
  'Blood pressure':
    'Support pressure with fluids and electrolytes; note salt, meds, posture, and heat as context.',
  'Resting HR':
    'A lower resting HR follows from hydration, rest, and avoiding stimulants and late activity.',
  Sleep: 'Target 7h+ - an earlier, consistent bedtime is usually the single biggest lever here.',
  'ECG rhythm':
    'Rhythm irregularities are worth flagging for your clinician; reduce stimulants and stress in the meantime.',
  Activity: "Match activity to today's capacity; pacing now prevents a post-exertional setback later.",
};
const GRADE_LABEL: Record<ScoreCategory, string> = {
  great: 'Great',
  good: 'Good',
  ok: 'OK',
  bad: 'Bad',
  crash: 'Crash',
  concerning: 'Concerning',
  warning: 'Warning',
};

// ---- small pure helpers (ported) ----

// rgba-with-alpha from a #rrggbb hex (legacy hexA, used for tinted backgrounds).
function hexA(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

// Which part of the day a reading belongs to (explicit period wins over clock).
function readingPeriod(r: Reading): 'morning' | 'midday' | 'evening' {
  if (r.period === 'Morning') return 'morning';
  if (r.period === 'Evening') return 'evening';
  const m = /^(\d{1,2}):/.exec((r.time as string) || '');
  if (!m) return 'midday';
  const h = +m[1];
  return h < 12 ? 'morning' : h >= 18 ? 'evening' : 'midday';
}

const fmtMetricVal = (v: number | null | undefined, u?: string): string =>
  (v == null
    ? '-'
    : Number.isInteger(v)
      ? String(v)
      : Math.abs(v) < 1
        ? v.toFixed(3)
        : v.toFixed(1)) + (u ? ` ${u}` : '');

interface CompMetric {
  label: string;
  raw: number;
  bands?: Bands | null;
  unit?: string;
  lowerBetter?: boolean;
}
interface CompDetail {
  value?: string;
  metrics?: (CompMetric | null)[];
  note?: string;
  maxCat?: ScoreCategory;
}

interface ZoneAdvice {
  cur: ScoreCategory | null;
  ideal: string | null;
  done: boolean;
  dir?: string;
}

// Given a value + its grade bands, describe the ideal ("great") range and which
// way to move to reach it. Returns null when not banded (legacy zoneAdvice).
function zoneAdvice(
  raw: number | null | undefined,
  bands: Bands | null | undefined,
  unit?: string,
): ZoneAdvice | null {
  if (raw == null || !bands) return null;
  const cur = catFromBands(raw, bands);
  let lo = -Infinity;
  let hi = Infinity;
  let prev = -Infinity;
  let found = false;
  for (const b of bands) {
    if (b.cat === 'great') {
      if (!found) {
        lo = prev;
        found = true;
      }
      hi = b.max;
    } else if (found) break; // first contiguous "great" block
    prev = b.max;
  }
  const fmtEdge = (x: number): string =>
    Number.isInteger(x) ? String(x) : Math.abs(x) < 1 ? x.toFixed(3) : x.toFixed(1);
  const u = unit ? ` ${unit}` : '';
  let ideal: string | null;
  if (!found) ideal = null;
  else if (lo === -Infinity) ideal = `${fmtEdge(hi)}${u} or below`;
  else if (hi === Infinity) ideal = `${fmtEdge(lo)}${u} or higher`;
  else ideal = `${fmtEdge(lo)}–${fmtEdge(hi)}${u}`;
  if (cur === 'great') return { cur, ideal, done: true };
  let dir = 'into range';
  if (found) {
    if (raw <= lo) dir = `higher (toward ${fmtEdge(lo)}${u} and up)`;
    else if (raw >= hi) dir = `lower (toward ${fmtEdge(hi)}${u} and below)`;
  }
  return { cur, ideal, done: false, dir };
}

// One concrete "to improve this" sentence for a component (legacy improveLine).
function improveLine(c: ScoreComp): string {
  const det = (c.detail as CompDetail) || {};
  const m = (det.metrics || []).find(
    (x): x is CompMetric => !!x && x.raw != null && catFromBands(x.raw, x.bands) !== 'great',
  );
  if (m) {
    const adv = zoneAdvice(m.raw, m.bands, m.unit);
    if (adv && !adv.done && adv.ideal)
      return `${m.label} is ${fmtMetricVal(m.raw, m.unit)} (${GRADE_LABEL[adv.cur!]}). Move it ${adv.dir}; the ideal range is ${adv.ideal}.`;
  }
  return det.note || SCORE_TIPS[c.label] || '';
}

// pts → category (legacy ptsToCat, inside openScoreExplain).
const ptsToCat = (p: number): ScoreCategory =>
  p >= 88 ? 'great' : p >= 70 ? 'good' : p >= 48 ? 'ok' : p >= 23 ? 'bad' : 'crash';

// ---- clean-day streak (ported dayCleanliness / sleepHours / streakInfo) ----

interface Criterion {
  key: string;
  label: string;
  pass: boolean;
  hard?: boolean;
  broken?: boolean;
  pending?: boolean;
  need?: string;
}
interface Cleanliness {
  clean: boolean;
  criteria: Criterion[];
}

// Hours slept the night *before* `dk`: the prior day's bedtime to this day's
// wake time. Reimplemented against the repo (legacy sleepHours read state.days).
function cleanSleepHours(getDay: (k: DateKey) => Day, dk: DateKey): number | null {
  const d = getDay(dk);
  const wake = d && d.sleep ? d.sleep.wake : '';
  const pd = dateFromKey(dk);
  pd.setDate(pd.getDate() - 1);
  const prev = getDay(keyOf(pd));
  const bed = prev && prev.sleep ? prev.sleep.bed : '';
  if (!bed || !wake) return null;
  const [bh, bm] = bed.split(':').map(Number);
  const [wh, wm] = wake.split(':').map(Number);
  let mins = wh * 60 + wm - (bh * 60 + bm);
  if (mins < 0) mins += 1440;
  return mins / 60;
}

// Returns null when the day has no record; else { clean, criteria }.
function dayCleanliness(
  has: (k: DateKey) => boolean,
  getDay: (k: DateKey) => Day,
  dk: DateKey,
): Cleanliness | null {
  if (!has(dk)) return null;
  const d = getDay(dk);
  const meds = d.meds || [];
  const hasMed = (tp: string) => meds.some((m) => m.type === tp);
  const triggers = (d.food && d.food.triggers) || {};
  const trigCount = Object.keys(triggers).reduce((s, k) => s + (triggers[k] > 0 ? triggers[k] : 0), 0);
  const water = (d.food && d.food.water) || 0;
  const hrs = cleanSleepHours(getDay, dk);
  const sleepLogged = hrs != null;
  const medReq: [string, string][] = [
    ['allegra', 'Allegra'],
    ['pepsidAc', 'Pepcid'],
    ['magGlycinate', 'Mag glycinate'],
  ];
  const missingMeds = medReq.filter(([tp]) => !hasMed(tp));
  const dinners = ((d.food && d.food.meals) || []).filter(
    (m) => m.type === 'dinner' && m.time,
  ) as Reading[];
  const criteria: Criterion[] = [
    { key: 'triggers', label: 'No trigger foods', pass: trigCount === 0, hard: true, broken: trigCount > 0 },
    { key: 'water', label: 'Water (2.5 L)', pass: water >= 2.5 },
    {
      key: 'dinner',
      label: 'Dinner by 5pm',
      pass: dinners.some((m) => (m.time as string) <= '17:00'),
      pending: dinners.length === 0,
    },
    {
      key: 'meds',
      label: 'Allegra, Pepcid, Mag glycinate',
      pass: missingMeds.length === 0,
      need: missingMeds.map(([, n]) => n).join(', '),
    },
    {
      key: 'sleep',
      label: 'Sleep 7h or more',
      pass: sleepLogged && hrs! >= 7,
      hard: true,
      broken: sleepLogged && hrs! < 7,
    },
  ];
  const clean = criteria.filter((c) => !c.pending).every((c) => c.pass);
  return { clean, criteria };
}

const streakTier = (n: number): { tier: string; msg: string } =>
  n <= 0
    ? { tier: 'Start fresh', msg: 'Today is day 1. Start fresh.' }
    : n <= 3
      ? { tier: 'Building', msg: 'Building momentum.' }
      : n <= 7
        ? { tier: 'Established', msg: 'Strong week forming.' }
        : n <= 14
          ? { tier: 'Excellent', msg: 'Exceptional consistency.' }
          : n <= 30
            ? { tier: 'Outstanding', msg: 'Major recovery period.' }
            : { tier: 'Elite', msg: 'Sustained protocol mastery.' };

interface StreakInfo {
  current: number;
  longest: number;
  rate: number | null;
  today: Cleanliness | null;
  isToday: boolean;
}

function streakInfo(
  has: (k: DateKey) => boolean,
  getDay: (k: DateKey) => Day,
  allKeys: DateKey[],
  dk: DateKey,
): StreakInfo {
  const today = keyOf(new Date());
  const clean = (k: DateKey) => dayCleanliness(has, getDay, k);
  const cur = clean(dk);
  // Current streak: walk back over consecutive days. Today still in progress
  // doesn't break the streak, so start from yesterday when today isn't clean yet.
  const cursor = dateFromKey(dk);
  if (dk === today && (!cur || !cur.clean)) cursor.setDate(cursor.getDate() - 1);
  let current = 0;
  for (;;) {
    const c = clean(keyOf(cursor));
    if (!c || !c.clean) break;
    current++;
    cursor.setDate(cursor.getDate() - 1);
  }
  // Longest run + 30-day clean rate over recorded days up to dk.
  const keys = allKeys.filter((k) => k <= dk).sort();
  let longest = current;
  let run = 0;
  if (keys.length) {
    const end = dateFromKey(dk);
    for (let cd = dateFromKey(keys[0]); cd <= end; cd.setDate(cd.getDate() + 1)) {
      const c = clean(keyOf(cd));
      if (c && c.clean) {
        run++;
        if (run > longest) longest = run;
      } else run = 0;
    }
  }
  let cleanN = 0;
  let total = 0;
  const e = dateFromKey(dk);
  for (let i = 0; i < 30; i++) {
    const c = clean(keyOf(new Date(e.getFullYear(), e.getMonth(), e.getDate() - i)));
    if (c) {
      total++;
      if (c.clean) cleanN++;
    }
  }
  return {
    current,
    longest,
    rate: total ? Math.round((cleanN / total) * 100) : null,
    today: cur,
    isToday: dk === today,
  };
}

// ==========================================================================
//  Component
// ==========================================================================

export function DaySummary({ dateKey }: { dateKey: DateKey }) {
  const t = useTheme();
  const repo = useRepository();
  // Subscribe to the repo so the card recomputes on any mutation. putDay swaps
  // in a new Day object, so getDay's identity changes when this day is edited.
  const day = useRepoSelector((r) => r.getDay(dateKey));
  const profile: Profile = repo.getProfile();

  const today = keyOf(new Date());
  const readings = (day.readings || [])
    .slice()
    .sort((a, b) => ((a.time as string) || '').localeCompare((b.time as string) || ''));
  const morning = readings.filter((r) => readingPeriod(r) === 'morning');
  const evening = readings.filter((r) => readingPeriod(r) === 'evening');
  const all = scoreSet(readings, day, profile);

  // Yesterday's cleanliness feeds the mandatory-recovery flag (legacy `yest`).
  const pd = dateFromKey(dateKey);
  pd.setDate(pd.getDate() - 1);
  const yest = dayCleanliness((k) => repo.hasDay(k), (k) => repo.getDay(k), keyOf(pd));
  const yestClean = yest ? yest.clean : null;

  const hasScore = all.score != null && all.confidence >= 40;

  return (
    <Box
      style={[
        {
          backgroundColor: t.surface,
          borderWidth: 1,
          borderColor: t.border,
          borderRadius: t.radius,
          marginBottom: t.gap,
          overflow: 'hidden',
          ...t.shadow,
        },
        hasScore && {
          borderColor: hexA(scoreCat(all.score!).color, 0.5),
        },
      ]}
    >
      <Hero
        all={all}
        readings={readings}
        morning={morning}
        evening={evening}
        day={day}
        profile={profile}
        dateKey={dateKey}
        today={today}
        yestClean={yestClean}
        t={t}
      />
      <Streak repo={repo} dateKey={dateKey} t={t} />
    </Box>
  );
}

// --------------------------------------------------------------------------
//  Hero
// --------------------------------------------------------------------------

function Hero({
  all,
  readings,
  morning,
  evening,
  day,
  profile,
  dateKey,
  today,
  yestClean,
  t,
}: {
  all: ScoreResult;
  readings: Reading[];
  morning: Reading[];
  evening: Reading[];
  day: Day;
  profile: Profile;
  dateKey: DateKey;
  today: DateKey;
  yestClean: boolean | null;
  t: Tokens;
}) {
  // Awaiting / low-confidence: prompt the user (legacy "Autonomic Outlook" stub).
  if (all.score == null || all.confidence < 40) {
    const future = dateKey > today;
    return (
      <Box style={{ padding: 18, alignItems: 'center' }}>
        <Text style={modeStyle(t)}>Autonomic Outlook</Text>
        {!readings.length ? (
          <>
            <Text style={awaitTitleStyle(t)}>{future ? 'Future day' : 'Awaiting morning data'}</Text>
            <Text style={awaitSubStyle(t)}>
              {future
                ? 'Nothing logged yet for this day.'
                : "Add a morning HRV reading to see today's autonomic profile."}
            </Text>
          </>
        ) : (
          <>
            <Text style={awaitTitleStyle(t)}>Insufficient data</Text>
            <Text style={awaitSubStyle(t)}>
              {(all.score != null
                ? `Provisional ${all.score} / 100 at ${all.confidence}% confidence. `
                : '') +
                (all.hasStruct
                  ? 'Add more readings to firm up the score.'
                  : all.hasUnstruct
                    ? 'Awaiting a structured (breathing) reading for higher confidence.'
                    : 'Add a morning HRV reading for higher confidence.')}
            </Text>
          </>
        )}
      </Box>
    );
  }

  const cat = scoreCat(all.score);
  const hasEvening = evening.length > 0;
  const mornScore = morning.length ? scoreSet(morning, day, profile).score : null;
  const delta = mornScore != null ? all.score - mornScore : null;
  const updated = readings.length >= 2 || readings.some((r) => readingPeriod(r) === 'midday');

  let mode: string;
  if (hasEvening) mode = dateKey < today ? 'Day Complete' : 'Reflectance';
  else mode = 'Autonomic Outlook';

  // Guidance: forward-looking for outlook, retrospective for reflectance.
  let guide: string;
  if (hasEvening) {
    if (delta == null) guide = 'Evening reading logged. ' + (TOMORROW[cat.short] || '');
    else if (delta <= -20)
      guide = 'Major setback versus this morning. Multiple triggers likely stacked. ' + TOMORROW[cat.short];
    else if (delta <= -10)
      guide = 'Day cost more than the morning predicted. Check food, exertion, or stress. ' + TOMORROW[cat.short];
    else if (delta >= 10)
      guide = 'Day went better than the morning predicted. Note what worked and repeat it. ' + TOMORROW[cat.short];
    else guide = 'Day held its morning baseline; activity matched capacity. ' + TOMORROW[cat.short];
  } else {
    guide = OUTLOOK_GUIDE[cat.short];
    if (updated && delta != null && Math.abs(delta) >= 5)
      guide =
        (delta < 0
          ? 'Trending down from this morning. Watch food and activity through the afternoon. '
          : 'Trending up from this morning. ') + guide;
  }

  // Flags.
  const isBlue = blueZone(readings, profile);
  const mandatory = cat.short === 'Crash' || (yestClean === false && all.score < 55);

  return (
    <Box
      style={{
        padding: 18,
        alignItems: 'center',
        backgroundColor: hexA(cat.color, 0.1),
      }}
    >
      {/* head: mode + chip */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          alignSelf: 'stretch',
        }}
      >
        <Text style={modeStyle(t)}>{mode}</Text>
        <View
          style={{
            backgroundColor: cat.color,
            borderRadius: 999,
            paddingVertical: 3,
            paddingHorizontal: 11,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 12.5, fontWeight: '700' }}>{cat.short}</Text>
        </View>
      </View>

      {/* gauge with centered score */}
      <View style={{ width: 176, height: 176, marginTop: 8, justifyContent: 'center', alignItems: 'center' }}>
        <Gauge score={all.score} color={cat.color} />
        <View style={{ position: 'absolute', alignItems: 'center' }}>
          <Text style={{ fontSize: 46, fontWeight: '800', color: t.text, lineHeight: 50 }}>{all.score}</Text>
          <Text style={{ fontSize: 10, letterSpacing: 1, fontWeight: '700', color: t.textDim }}>OUT OF 100</Text>
        </View>
      </View>

      {delta != null && Math.abs(delta) >= 3 ? (
        <Text
          style={{
            fontSize: 13,
            fontWeight: '700',
            marginTop: 4,
            color: delta > 0 ? SCORE_COLORS.good : SCORE_COLORS.bad,
          }}
        >
          {(delta > 0 ? '▲ ' : '▼ ') + Math.abs(delta) + ' vs AM'}
        </Text>
      ) : null}

      {/* "What powers this" */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="How this score was calculated"
        onPress={() => openScoreExplain(all)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          marginTop: 10,
          paddingVertical: 6,
          paddingHorizontal: 12,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: t.border,
          backgroundColor: t.surface,
        }}
      >
        <Icon name="info" size={15} color={t.textDim} />
        <Text style={{ fontSize: 13, color: t.textDim, fontWeight: '600' }}>What powers this</Text>
      </Pressable>

      <Text style={{ fontSize: 13, color: t.textDim, marginTop: 10, textAlign: 'center' }}>
        {`${cat.label} · ${all.confidence}% confidence`}
      </Text>

      <Text style={{ fontSize: 14, color: t.text, marginTop: 10, textAlign: 'center', lineHeight: 20 }}>
        {guide}
      </Text>

      {isBlue ? (
        <Flag
          color="#7c5cd6"
          bg={hexA(SCORE_COLORS.warning, 0.16)}
          text="Blue-zone risk. High readiness may mask fragility, so do less today, not more."
        />
      ) : null}
      {mandatory ? (
        <Flag
          color={SCORE_COLORS.crash}
          bg={hexA(SCORE_COLORS.crash, 0.14)}
          text="Mandatory recovery day. Full rest, hydration, and protocol."
        />
      ) : null}
    </Box>
  );
}

function Flag({ color, bg, text }: { color: string; bg: string; text: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        alignSelf: 'stretch',
        marginTop: 12,
        padding: 10,
        borderRadius: 10,
        backgroundColor: bg,
      }}
    >
      <Icon name="alert" size={18} color={color} />
      <Text style={{ flex: 1, fontSize: 13, color, lineHeight: 18 }}>{text}</Text>
    </View>
  );
}

// --------------------------------------------------------------------------
//  Streak
// --------------------------------------------------------------------------

function Streak({
  repo,
  dateKey,
  t,
}: {
  repo: ReturnType<typeof useRepository>;
  dateKey: DateKey;
  t: Tokens;
}) {
  const [open, setOpen] = useState(false);
  // Recompute on mutation.
  useRepoSelector((r) => r.allDayKeys().length);

  const has = (k: DateKey) => repo.hasDay(k);
  const getDay = (k: DateKey) => repo.getDay(k);
  const si = streakInfo(has, getDay, repo.allDayKeys(), dateKey);
  const tier = streakTier(si.current);
  const c = si.today;

  // Badge icon escalates with the streak.
  const icon =
    si.current >= 14 ? 'moon' : si.current >= 7 ? 'rocket' : si.current >= 3 ? 'flame' : 'sparkles';

  // Sub line (legacy logic).
  let sub = tier.msg;
  if (c) {
    if (c.clean) {
      sub = 'Clean day. Streak continues.';
    } else {
      const hardFail = c.criteria.some((x) => x.broken);
      const needLabel = (x: Criterion) => (x.need != null ? x.need : x.label).toLowerCase();
      const needed = c.criteria.filter((x) => !x.pass && !x.broken).map(needLabel);
      if (si.isToday) {
        sub = hardFail
          ? 'Too late for today. Try again to start fresh tomorrow.'
          : needed.length
            ? `Today is day ${si.current + 1}. Still needed: ${needed.join(', ')}.`
            : `Today is day ${si.current + 1}.`;
      } else {
        const reasons = c.criteria
          .filter((x) => !x.pass && !x.pending)
          .map(needLabel)
          .slice(0, 3)
          .join(', ');
        sub = `Not a clean day. ${reasons}.`;
      }
    }
  } else {
    sub = 'No data logged for this day.';
  }

  const stats = [`Longest ${si.longest}`];
  if (si.rate != null) stats.push(`30-day clean ${si.rate}%`);

  return (
    <Pressable
      onPress={() => setOpen((o) => !o)}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        padding: 14,
        borderTopWidth: 1,
        borderTopColor: t.border,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: si.current > 0 ? hexA('#e0a000', 0.18) : t.surface2,
        }}
      >
        <Icon name={icon} size={22} color={si.current > 0 ? '#e0a000' : t.textDim} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 15, color: t.text }}>
              <Text style={{ fontWeight: '800' }}>{si.current}</Text>
              {` clean day${si.current === 1 ? '' : 's'} · `}
              <Text style={{ color: t.accent, fontWeight: '700' }}>{tier.tier}</Text>
            </Text>
            <Text style={{ fontSize: 12.5, color: t.textDim, marginTop: 2 }}>{sub}</Text>
          </View>
          <View style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}>
            <Icon name="chevron" size={18} color={t.textDim} />
          </View>
        </View>
        {open ? (
          <View style={{ marginTop: 10 }}>
            <Text style={{ fontSize: 12.5, color: t.textDim, marginBottom: 8 }}>{stats.join(' · ')}</Text>
            {c ? (
              <View style={{ gap: 6 }}>
                {c.criteria.map((x) => {
                  let st: 'pending' | 'met' | 'broken' | 'todo';
                  if (x.pending) st = 'pending';
                  else if (x.pass) st = 'met';
                  else if (!si.isToday || x.broken) st = 'broken';
                  else st = 'todo';
                  const dotColor =
                    st === 'met'
                      ? SCORE_COLORS.good
                      : st === 'broken'
                        ? SCORE_COLORS.crash
                        : st === 'todo'
                          ? t.accent
                          : t.textDim;
                  return (
                    <View key={x.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: 8,
                          backgroundColor: st === 'met' ? dotColor : 'transparent',
                          borderWidth: st === 'met' ? 0 : 1.5,
                          borderColor: dotColor,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {st === 'met' ? (
                          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900' }}>✓</Text>
                        ) : null}
                      </View>
                      <Text
                        style={{
                          fontSize: 13,
                          color: st === 'broken' ? t.textDim : t.text,
                          textDecorationLine: st === 'broken' ? 'line-through' : 'none',
                        }}
                      >
                        {x.label}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

// --------------------------------------------------------------------------
//  Score-explain drawer + accordions (ported openScoreExplain / compAccordion)
// --------------------------------------------------------------------------

type ExplainComp = ScoreComp & { cat: ScoreCategory };

function CompAccordion({ c }: { c: ExplainComp }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const det = (c.detail as CompDetail) || {};
  const contrib =
    c.p >= 80
      ? { txt: 'Lifting your score', color: SCORE_COLORS.good }
      : c.p >= 60
        ? { txt: 'About neutral', color: t.textDim }
        : { txt: 'Pulling your score down', color: SCORE_COLORS.bad };

  return (
    <Box
      style={{
        borderWidth: 1,
        borderColor: t.border,
        borderRadius: t.radiusSm,
        backgroundColor: t.surface2,
        marginBottom: 8,
        overflow: 'hidden',
      }}
    >
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 }}
      >
        <Dot cat={c.cat} />
        <Text style={{ flex: 1, fontSize: 15, color: t.text, fontWeight: '600' }}>{c.label}</Text>
        <Text style={{ fontSize: 14, color: t.textDim }}>{det.value || ''}</Text>
        <View style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}>
          <Icon name="chevron" size={16} color={t.textDim} />
        </View>
      </Pressable>
      {open ? (
        <View style={{ paddingHorizontal: 12, paddingBottom: 12, gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 12.5, fontWeight: '700', color: contrib.color }}>{contrib.txt}</Text>
            <Text style={{ fontSize: 12.5, color: t.textDim }}>{`${GRADE_LABEL[c.cat]} · weight ${c.w}%`}</Text>
          </View>
          {(det.metrics || []).map((m, i) => {
            if (!m || m.raw == null) return null;
            const mcat = catFromBands(m.raw, m.bands);
            const adv = zoneAdvice(m.raw, m.bands, m.unit);
            return (
              <View key={i} style={{ gap: 3 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Dot cat={mcat} />
                  <Text style={{ fontSize: 13.5, color: t.text }}>
                    {`${m.label}: ${fmtMetricVal(m.raw, m.unit)}`}
                  </Text>
                </View>
                {adv && adv.ideal ? (
                  <Text style={{ fontSize: 12.5, color: t.textDim, lineHeight: 17, marginLeft: 18 }}>
                    {adv.done
                      ? `In the ideal range (${adv.ideal}). Already at full points, so keep it steady.`
                      : `Currently ${GRADE_LABEL[adv.cur!].toLowerCase()}. Aim ${adv.dir}; ideal range is ${adv.ideal}.`}
                  </Text>
                ) : null}
              </View>
            );
          })}
          {det.note ? (
            <Text style={{ fontSize: 12.5, color: t.textDim, lineHeight: 17 }}>{det.note}</Text>
          ) : null}
          {SCORE_TIPS[c.label] ? (
            <Text style={{ fontSize: 12.5, color: t.textDim, fontStyle: 'italic', lineHeight: 17 }}>
              {SCORE_TIPS[c.label]}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Box>
  );
}

function Dot({ cat }: { cat: ScoreCategory | null }) {
  const t = useTheme();
  const color = cat ? SCORE_COLORS[cat] : t.textDim;
  return <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />;
}

function SumCard({ title, children }: { title: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ marginBottom: 16 }}>
      <Text
        style={{
          fontSize: 12,
          textTransform: 'uppercase',
          letterSpacing: 0.7,
          color: t.textDim,
          fontWeight: '700',
          marginBottom: 10,
        }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

function MetricCard({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: t.border,
        borderRadius: t.radiusSm,
        backgroundColor: t.surface2,
        padding: 12,
        marginBottom: 8,
      }}
    >
      {children}
    </View>
  );
}

function ScoreExplainBody({ all }: { all: ScoreResult }) {
  const t = useTheme();
  const cat = scoreCat(all.score!);
  const comps: ExplainComp[] = (all.comps || []).map((c) => ({ ...c, cat: ptsToCat(c.p) }));
  const byW = (a: ExplainComp, b: ExplainComp) => b.w - a.w;
  const helped = comps.filter((c) => c.cat === 'great' || c.cat === 'good').sort(byW);
  const hurt = comps
    .filter((c) => c.cat === 'bad' || c.cat === 'crash' || c.cat === 'concerning')
    .sort(byW);
  const neutral = comps.filter((c) => c.cat === 'ok' || c.cat === 'warning').sort(byW);
  const have = new Set(comps.map((c) => c.label));

  // Headroom: weight × gap to top zone / available weight.
  const ceil = (c: ExplainComp) =>
    (c.detail as CompDetail)?.maxCat ? GRADE_PTS[(c.detail as CompDetail).maxCat!] : 95;
  const avail = all.confidence || 100;
  const headroom = comps
    .map((c) => ({ c, gain: (c.w * (ceil(c) - c.p)) / avail }))
    .filter((x) => x.gain > 0.05)
    .sort((a, b) => b.gain - a.gain);

  const bigMissing: string[] = [];
  if (!all.hasStruct) bigMissing.push('a structured breathing HRV reading');
  if (!have.has('Blood pressure')) bigMissing.push('blood pressure');
  if (!have.has('Sleep')) bigMissing.push("last night's sleep");

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <H2>How this score was calculated</H2>

      <View
        style={{
          borderWidth: 1,
          borderColor: hexA(cat.color, 0.45),
          backgroundColor: hexA(cat.color, 0.15),
          borderRadius: t.radius,
          padding: 16,
          marginBottom: 16,
          alignItems: 'center',
        }}
      >
        <View
          style={{ backgroundColor: cat.color, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 11 }}
        >
          <Text style={{ color: '#fff', fontSize: 12.5, fontWeight: '700' }}>{cat.short}</Text>
        </View>
        <Text style={{ fontSize: 15, color: t.text, marginTop: 8, fontWeight: '600' }}>{cat.label}</Text>
        <Text style={{ marginTop: 4 }}>
          <Text style={{ fontSize: 40, fontWeight: '800', color: t.text }}>{all.score}</Text>
          <Text style={{ fontSize: 16, color: t.textDim }}> / 100</Text>
        </Text>
        <Text style={{ fontSize: 12.5, color: t.textDim, marginTop: 6, textAlign: 'center', lineHeight: 17 }}>
          {`Confidence ${all.confidence}% - the share of the full input set that was available to score today.`}
        </Text>
      </View>

      <Text style={{ fontSize: 13.5, color: t.textDim, lineHeight: 19, marginBottom: 10 }}>
        The Autonomic Score is a weighted blend of the day's readings. Each input is graded, turned into
        points, and combined by weight. Missing inputs drop out and the remaining weights are rescaled -
        that rescaling is the confidence percentage. The most recent reading of each type is used, and
        structured (breathing) HRV outranks the unstructured reading when both are present.
      </Text>
      <Text style={{ fontSize: 13.5, color: t.textDim, lineHeight: 19, marginBottom: 16 }}>
        Tap any input below to see the actual values behind it, whether it is helping or hurting, and what it
        would take to push it higher.
      </Text>

      {helped.length ? (
        <SumCard title="What helped">
          {helped.map((c) => (
            <CompAccordion key={c.label} c={c} />
          ))}
        </SumCard>
      ) : null}
      {hurt.length ? (
        <SumCard title="What hurt">
          {hurt.map((c) => (
            <CompAccordion key={c.label} c={c} />
          ))}
        </SumCard>
      ) : null}
      {neutral.length ? (
        <SumCard title="Middle of the range">
          {neutral.map((c) => (
            <CompAccordion key={c.label} c={c} />
          ))}
        </SumCard>
      ) : null}

      <SumCard title="What would raise your score">
        {headroom.length ? (
          headroom.slice(0, 4).map(({ c, gain }) => (
            <MetricCard key={c.label}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Dot cat={c.cat} />
                <Text style={{ flex: 1, fontSize: 14, color: t.text, fontWeight: '600' }}>{c.label}</Text>
                <Text style={{ fontSize: 13, color: t.textDim }}>{`+${gain.toFixed(1)} pt`}</Text>
              </View>
              <Text style={{ fontSize: 12.5, color: t.textDim, lineHeight: 17, marginTop: 6 }}>
                {improveLine(c)}
              </Text>
            </MetricCard>
          ))
        ) : (
          <MetricCard>
            <Text style={{ fontSize: 13, color: t.textDim, lineHeight: 18 }}>
              Every scored input is already in its top zone, so this is about as high as the score goes. Keep
              the inputs consistent to hold it.
            </Text>
          </MetricCard>
        )}
        {OUTLOOK_GUIDE[cat.short] ? (
          <MetricCard>
            <Text style={{ fontSize: 13, color: t.textDim, lineHeight: 18 }}>{OUTLOOK_GUIDE[cat.short]}</Text>
          </MetricCard>
        ) : null}
      </SumCard>

      {all.confidence < 100 && bigMissing.length ? (
        <SumCard title="Firm up the score">
          <MetricCard>
            <Text style={{ fontSize: 13, color: t.textDim, lineHeight: 18 }}>
              {`Confidence is ${all.confidence}%. Logging ${bigMissing.join(', ')} would raise it and steady the number.`}
            </Text>
          </MetricCard>
        </SumCard>
      ) : null}
    </ScrollView>
  );
}

function openScoreExplain(all: ScoreResult) {
  openSheet(() => <ScoreExplainBody all={all} />);
}

// ---- shared text styles ----
const modeStyle = (t: Tokens) => ({
  fontSize: 12,
  textTransform: 'uppercase' as const,
  letterSpacing: 0.9,
  fontWeight: '700' as const,
  color: t.textDim,
});
const awaitTitleStyle = (t: Tokens) => ({
  fontSize: 18,
  fontWeight: '700' as const,
  color: t.text,
  marginTop: 12,
  textAlign: 'center' as const,
});
const awaitSubStyle = (t: Tokens) => ({
  fontSize: 14,
  color: t.textDim,
  marginTop: 6,
  textAlign: 'center' as const,
  lineHeight: 19,
});
