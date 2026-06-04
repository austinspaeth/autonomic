// Clean-day / streak / illness analytics — ported from legacy docs/index.html:
//   dayCleanliness   (2171-2200)
//   streakTier       (2201-2207)
//   streakInfo       (2208-2241)
//   acIllnessEpisodes(5567-5574)
//   acDaysBefore/acRecentDays/acWindowKeys (5560-5562)
//
// Decoupled from legacy globals: every function takes an explicit `days` map
// (Record<DateKey, Day>) instead of reading state.days. The cleanliness sleep
// check uses the *cross-day* sleep calc (prior day's bedtime -> this day's wake
// time) exactly like legacy sleepHours(dk) — distinct from the same-day
// scoreSet sleepHours(day). Matches the inlined ports in DaySummary.tsx /
// reportSections.ts / milestoneData.ts so all four agree.

import type { Day, DateKey } from '@core/types';
import { keyOf, dateFromKey } from '@core/date/dateUtils';

export interface CleanCriterion {
  key: string;
  label: string;
  pass: boolean;
  hard?: boolean;
  broken?: boolean;
  pending?: boolean;
  need?: string;
}
export interface Cleanliness {
  clean: boolean;
  criteria: CleanCriterion[];
}

// Hours slept the night *before* dk: prior day's bedtime to this day's wake.
function cleanSleepHours(days: Record<DateKey, Day>, dk: DateKey): number | null {
  const d = days[dk];
  const wake = d && d.sleep ? d.sleep.wake : '';
  const pd = dateFromKey(dk);
  pd.setDate(pd.getDate() - 1);
  const prev = days[keyOf(pd)];
  const bed = prev && prev.sleep ? prev.sleep.bed : '';
  if (!bed || !wake) return null;
  const [bh, bm] = bed.split(':').map(Number);
  const [wh, wm] = wake.split(':').map(Number);
  let mins = wh * 60 + wm - (bh * 60 + bm);
  if (mins < 0) mins += 1440;
  return mins / 60;
}

// Returns null when the day has no record; else { clean, criteria }.
export function dayCleanliness(days: Record<DateKey, Day>, dk: DateKey): Cleanliness | null {
  const d = days[dk];
  if (!d) return null;
  const meds = d.meds || [];
  const hasMed = (tp: string) => meds.some((m) => m.type === tp);
  const triggers = (d.food && d.food.triggers) || {};
  const trigCount = Object.keys(triggers).reduce(
    (s, k) => s + ((triggers as any)[k] > 0 ? (triggers as any)[k] : 0),
    0,
  );
  const water = (d.food && d.food.water) || 0;
  const hrs = cleanSleepHours(days, dk);
  const sleepLogged = hrs != null;
  const medReq: [string, string][] = [
    ['allegra', 'Allegra'],
    ['pepsidAc', 'Pepcid'],
    ['magGlycinate', 'Mag glycinate'],
  ];
  const missingMeds = medReq.filter(([tp]) => !hasMed(tp));
  const dinners = ((d.food && d.food.meals) || []).filter(
    (m) => (m as any).type === 'dinner' && (m as any).time,
  );
  const criteria: CleanCriterion[] = [
    { key: 'triggers', label: 'No trigger foods', pass: trigCount === 0, hard: true, broken: trigCount > 0 },
    { key: 'water', label: 'Water (2.5 L)', pass: water >= 2.5 },
    {
      key: 'dinner',
      label: 'Dinner by 5pm',
      pass: dinners.some((m) => (m as any).time <= '17:00'),
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
      pass: sleepLogged && (hrs as number) >= 7,
      hard: true,
      broken: sleepLogged && (hrs as number) < 7,
    },
  ];
  const clean = criteria.filter((c) => !c.pending).every((c) => c.pass);
  return { clean, criteria };
}

export const streakTier = (n: number): { tier: string; msg: string } =>
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

export interface StreakInfo {
  current: number;
  longest: number;
  rate: number | null;
  today: Cleanliness | null;
  isToday: boolean;
}

export function streakInfo(days: Record<DateKey, Day>, dk: DateKey): StreakInfo {
  const today = keyOf(new Date());
  const cur = dayCleanliness(days, dk);
  const cursor = dateFromKey(dk);
  if (dk === today && (!cur || !cur.clean)) cursor.setDate(cursor.getDate() - 1);
  let current = 0;
  for (;;) {
    const c = dayCleanliness(days, keyOf(cursor));
    if (!c || !c.clean) break;
    current++;
    cursor.setDate(cursor.getDate() - 1);
  }
  const keys = Object.keys(days).filter((k) => k <= dk).sort();
  let longest = current,
    run = 0;
  if (keys.length) {
    const end = dateFromKey(dk);
    for (let cd = dateFromKey(keys[0]); cd <= end; cd.setDate(cd.getDate() + 1)) {
      const c = dayCleanliness(days, keyOf(cd));
      if (c && c.clean) {
        run++;
        if (run > longest) longest = run;
      } else run = 0;
    }
  }
  let cleanN = 0,
    total = 0;
  const e = dateFromKey(dk);
  for (let i = 0; i < 30; i++) {
    const c = dayCleanliness(days, keyOf(new Date(e.getFullYear(), e.getMonth(), e.getDate() - i)));
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

// ---- date-window helpers (legacy 5560-5562) ----
export const acDayDiff = (a: DateKey, b: DateKey): number =>
  Math.round((dateFromKey(b).getTime() - dateFromKey(a).getTime()) / 86400000);

export function acDaysBefore(days: Record<DateKey, Day>, dk: DateKey, n: number): DateKey[] {
  const out: DateKey[] = [];
  const end = dateFromKey(dk);
  for (let i = 1; i <= n; i++) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    const k = keyOf(d);
    if (days[k]) out.push(k);
  }
  return out;
}

export function acRecentDays(days: Record<DateKey, Day>, n: number): DateKey[] {
  const out: DateKey[] = [];
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  for (let i = 0; i < n; i++) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    const k = keyOf(d);
    if (days[k]) out.push(k);
  }
  return out;
}

export function acWindowKeys(
  days: Record<DateKey, Day>,
  dk: DateKey,
  from: number,
  to: number,
): DateKey[] {
  const out: DateKey[] = [];
  const base = dateFromKey(dk);
  for (let i = from; i <= to; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const k = keyOf(d);
    if (days[k]) out.push(k);
  }
  return out;
}

// ---- illness episodes (legacy 5567) ----
export function acIllnessEpisodes(
  days: Record<DateKey, Day>,
): { start: DateKey; end: DateKey }[] {
  const sick = Object.keys(days)
    .filter((dk) => (days[dk].symptoms || []).some((s) => (s as any).type === 'sick'))
    .sort();
  if (!sick.length) return [];
  const eps: { start: DateKey; end: DateKey }[] = [];
  let start = sick[0],
    prev = sick[0];
  for (let i = 1; i < sick.length; i++) {
    if (acDayDiff(prev, sick[i]) <= 2) prev = sick[i];
    else {
      eps.push({ start, end: prev });
      start = sick[i];
      prev = sick[i];
    }
  }
  eps.push({ start, end: prev });
  return eps;
}
