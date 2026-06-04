// Per-section prompt data formatters + the section registry — ported verbatim
// from legacy docs/index.html:
//   rv / stamp / noteSuffix / MED_KEYS  (~6138-6147)
//   eachEntry / orNone                  (~6192-6201)
//   secHRV..secCleanDays + SECTION_DEFS (~6203-6407)
//   renderSections                      (~6402-6407)
//   universalHeader                     (~6411-6449)
//   entryCount / hasAnyData             (~6176-6189)
//   reportDateRange                     (~6150-6173)
//
// Decouplings from the legacy globals:
//   - All functions take an explicit `days: Record<DateKey, Day>` map (and
//     `profile` where scoring/header needs it) instead of reading the global
//     `state.days` / `state.profile`.
//   - secScores calls the ported scoreSet(readings, day, profile) (legacy
//     passed the date key as the 3rd arg; the ported signature threads profile).
//   - secSleep / sleepHoursForKey / dayCleanliness keep the legacy cross-day
//     prior-bedtime lookup by reading the previous day's record out of the map.
//   - dayCleanliness is inlined here (not yet in core); same thresholds/logic.

import type { Day, DateKey, Profile } from '@core/types';
import { keyOf, dateFromKey, fmtTime12, ageFromBirthday } from '@core/date/dateUtils';
import { scoreSet, blueZone } from '@core/scoring/scoreSet';
import { ACTIVITY_TYPES } from '@core/domain/activityTypes';
import { MED_TYPES, SYMPTOM_TYPES, TRIGGER_TYPES, MEAL_TYPES } from '@core/domain/otherTypes';
import { isDivider, type Field, type InputField } from '@core/domain/fieldSchema';

type Days = Record<DateKey, Day>;

// Meds vs supplements split (legacy ~6138).
const MED_KEYS = new Set(['allegra', 'pepsidAc', 'gaviscon', 'melatonin']);

// Value getter: returns null for missing/empty so we can render "-".
const rv = (o: any, k: string): any => {
  if (!o) return null;
  const x = o[k];
  return x === undefined || x === null || x === '' ? null : x;
};
const stamp = (k: string, t?: string) => `[${k}${t ? ' ' + fmtTime12(t) : ''}]`;
const noteSuffix = (r: any) => (r && r.note ? ` | Note: ${r.note}` : '');

// Walk every present day, collecting lines via pick(day, key) -> string[].
function eachEntry(days: Days, keys: DateKey[], pick: (d: Day, k: DateKey) => string[]): string[] {
  const out: string[] = [];
  keys.forEach((k) => {
    const d = days[k];
    if (!d) return;
    pick(d, k).forEach((s) => out.push(s));
  });
  return out;
}
const orNone = (lines: string[]) => (lines.length ? lines.join('\n') : '(none recorded)');

// Legacy sleepHours read the *previous* day's bedtime + this day's wake.
function sleepHoursForKey(days: Days, dk: DateKey): number | null {
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

interface CleanCriterion {
  key: string;
  label: string;
  pass: boolean;
  hard?: boolean;
  broken?: boolean;
  pending?: boolean;
  need?: string;
}
// Returns null when the day has no record; else { clean, criteria }.
function dayCleanliness(days: Days, dk: DateKey): { clean: boolean; criteria: CleanCriterion[] } | null {
  const d = days[dk];
  if (!d) return null;
  const meds = d.meds || [];
  const hasMed = (t: string) => meds.some((m) => m.type === t);
  const triggers = (d.food && d.food.triggers) || {};
  const trigCount = Object.keys(triggers).reduce((s, k) => s + (triggers[k] > 0 ? triggers[k] : 0), 0);
  const water = (d.food && d.food.water) || 0;
  const hrs = sleepHoursForKey(days, dk);
  const sleepLogged = hrs != null;
  const medReq: [string, string][] = [['allegra', 'Allegra'], ['pepsidAc', 'Pepcid'], ['magGlycinate', 'Mag glycinate']];
  const missingMeds = medReq.filter(([t]) => !hasMed(t));
  const dinners = ((d.food && d.food.meals) || []).filter((m) => m.type === 'dinner' && m.time);
  const criteria: CleanCriterion[] = [
    { key: 'triggers', label: 'No trigger foods', pass: trigCount === 0, hard: true, broken: trigCount > 0 },
    { key: 'water', label: 'Water (2.5 L)', pass: water >= 2.5 },
    { key: 'dinner', label: 'Dinner by 5pm', pass: dinners.some((m) => (m.time as string) <= '17:00'), pending: dinners.length === 0 },
    { key: 'meds', label: 'Allegra, Pepcid, Mag glycinate', pass: missingMeds.length === 0, need: missingMeds.map(([, n]) => n).join(', ') },
    { key: 'sleep', label: 'Sleep 7h or more', pass: !!sleepLogged && (hrs as number) >= 7, hard: true, broken: !!sleepLogged && (hrs as number) < 7 },
  ];
  const clean = criteria.filter((c) => !c.pending).every((c) => c.pass);
  return { clean, criteria };
}

// ---- Per-section data formatters ----
function secHRV(days: Days, keys: DateKey[]) {
  return orNone(
    eachEntry(days, keys, (d, k) => {
      const out: string[] = [];
      (d.readings || []).forEach((r) => {
        if (r.type === 'hrv') {
          out.push(`${stamp(k, r.time)} Type: Unstructured | HR: ${rv(r, 'avgHr') ?? '-'} | RMSSD: ${rv(r, 'rmssd') ?? '-'} | SDNN: ${rv(r, 'sdnn') ?? '-'} | Readiness: ${rv(r, 'readiness') ?? '-'}% | PNS: ${rv(r, 'pns') ?? '-'} | SNS: ${rv(r, 'sns') ?? '-'} | Stress: ${rv(r, 'stressIndex') ?? '-'} | LF: ${rv(r, 'lowPower') ?? '-'} | HF: ${rv(r, 'highPower') ?? '-'}${noteSuffix(r)}`);
        }
        if (r.type === 'breathHrv') {
          const vlf = rv(r, 'vlowPower'),
            lf = rv(r, 'lowPower'),
            hf = rv(r, 'highPower');
          const total = [vlf, lf, hf].map(Number).filter((n) => !isNaN(n)).reduce((s, n) => s + n, 0);
          out.push(`${stamp(k, r.time)} Type: Structured (${rv(r, 'style') ?? '?'}) | HR: ${rv(r, 'hr') ?? '-'} | RMSSD: ${rv(r, 'rmssd') ?? '-'} | pNN50: ${rv(r, 'pnn50') ?? '-'}% | SDNN: ${rv(r, 'sdnn') ?? '-'} | MeanRR: ${rv(r, 'meanRr') ?? '-'} | Power: ${total || '-'} | VLF: ${vlf ?? '-'} | LF: ${lf ?? '-'} | HF: ${hf ?? '-'} | LF Peak: ${rv(r, 'lfPeak') ?? '-'} Hz | HF Peak: ${rv(r, 'hfPeak') ?? '-'} Hz | Coherence: ${rv(r, 'coherence') ?? '-'}% | Stress: ${rv(r, 'stressIndex') ?? '-'}${noteSuffix(r)}`);
        }
      });
      return out;
    }),
  );
}
function secBreathStyles(days: Days, keys: DateKey[]) {
  return orNone(
    eachEntry(days, keys, (d, k) =>
      (d.readings || [])
        .filter((r) => r.type === 'breathHrv')
        .map((r) => `${stamp(k, r.time)} Style: ${rv(r, 'style') ?? '-'} | Reading type: ${rv(r, 'period') ?? '-'}`),
    ),
  );
}
function secBP(days: Days, keys: DateKey[]) {
  return orNone(
    eachEntry(days, keys, (d, k) =>
      (d.readings || [])
        .filter((r) => r.type === 'bp')
        .map((r) => `${stamp(k, r.time)} BP: ${rv(r, 'sys') ?? '-'}/${rv(r, 'dia') ?? '-'} | Pulse: ${rv(r, 'pulse') ?? '-'} | Type: ${rv(r, 'period') ?? '-'}${noteSuffix(r)}`),
    ),
  );
}
function secECG(days: Days, keys: DateKey[]) {
  return orNone(
    eachEntry(days, keys, (d, k) =>
      (d.readings || [])
        .filter((r) => r.type === 'ecg')
        .map((r) => {
          const rhythm = [r.sinus && 'Sinus', r.svt && 'SVT', r.otherArrhythmia && 'Other arrhythmia'].filter(Boolean).join(', ') || '-';
          return `${stamp(k, r.time)} QTc: ${rv(r, 'qtc') ?? '-'} | QRS: ${rv(r, 'qrs') ?? '-'} | PR: ${rv(r, 'pr') ?? '-'} | HRV: ${rv(r, 'hrv') ?? '-'} | HR: ${rv(r, 'hr') ?? '-'} | Ectopics: ${rv(r, 'ectopic') ?? '-'} | Rhythm: ${rhythm}${noteSuffix(r)}${r.techReview ? ` | Tech: ${r.techReview}` : ''}`;
        }),
    ),
  );
}
function secRHR(days: Days, keys: DateKey[]) {
  return orNone(
    eachEntry(days, keys, (d, k) =>
      (d.readings || [])
        .filter((r) => r.type === 'restingHr')
        .map((r) => `${stamp(k, r.time)} Position: ${rv(r, 'position') ?? '-'} | HR: ${rv(r, 'hr') ?? '-'}${noteSuffix(r)}`),
    ),
  );
}
function secSPO2(days: Days, keys: DateKey[]) {
  return orNone(
    eachEntry(days, keys, (d, k) =>
      (d.readings || [])
        .filter((r) => r.type === 'bloodO2')
        .map((r) => `${stamp(k, r.time)} SPO2: ${rv(r, 'value') ?? '-'}% | PI: ${rv(r, 'perfusion') ?? '-'} | Pulse: ${rv(r, 'pulse') ?? '-'}${noteSuffix(r)}`),
    ),
  );
}
function secSleep(days: Days, keys: DateKey[]) {
  const lines: string[] = [];
  keys.forEach((k) => {
    const d = days[k];
    if (!d || !d.sleep) return;
    const s = d.sleep;
    const pd = dateFromKey(k);
    pd.setDate(pd.getDate() - 1);
    const prev = days[keyOf(pd)];
    const bed = prev && prev.sleep ? prev.sleep.bed : '';
    if (!bed && !s.wake && !rv(s, 'hrLow') && !rv(s, 'hrHigh')) return;
    const hrs = sleepHoursForKey(days, k);
    lines.push(`[${k}] Bedtime: ${bed ? fmtTime12(bed) : '-'} | Wake: ${s.wake ? fmtTime12(s.wake) : '-'} | Duration: ${hrs != null ? hrs.toFixed(1) + ' hrs' : '-'} | Quality: ${s.quality === 'interrupted' ? 'Interrupted' : 'Good'} | Low HR: ${rv(s, 'hrLow') ?? '-'} | High HR: ${rv(s, 'hrHigh') ?? '-'}`);
  });
  return orNone(lines);
}
function secActivities(days: Days, keys: DateKey[]) {
  return orNone(
    eachEntry(days, keys, (d, k) =>
      (d.activities || []).map((a) => {
        const def = ACTIVITY_TYPES[a.type];
        const label = def ? def.label : a.type;
        const parts: string[] = [];
        if (def && def.custom === 'bike') {
          if (def.summary) {
            const sm = def.summary(a);
            if (sm) parts.push(sm);
          }
          if (def.detail) {
            const dt = def.detail(a);
            if (dt) parts.push(dt);
          }
        } else if (def) {
          (def.fields || []).forEach((f) => {
            if (isDivider(f) || (f as InputField).type === 'time' || (f as InputField).type === 'textarea' || (f as InputField).type === 'check') return;
            const fi = f as InputField;
            const val = rv(a, fi.key);
            if (val != null) parts.push(`${fi.label}: ${val}${fi.unit ? fi.unit : ''}`);
          });
          (def.fields || [])
            .filter((f): f is InputField => (f as InputField).type === 'check' && !!a[(f as InputField).key])
            .forEach((f) => parts.push(f.label));
        }
        if (a.note) parts.push(`Note: ${a.note}`);
        return `${stamp(k, a.time)} ${label}${parts.length ? ' | ' + parts.join(' | ') : ''}`;
      }),
    ),
  );
}
function secFood(days: Days, keys: DateKey[]) {
  const lines: string[] = [];
  keys.forEach((k) => {
    const d = days[k];
    if (!d || !d.food) return;
    const f = d.food;
    (f.meals || [])
      .slice()
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''))
      .forEach((m) => {
        const bits: string[] = [];
        if (m.calories) bits.push(`${m.calories} cal`);
        if (m.note) bits.push(m.note);
        lines.push(`${stamp(k, m.time)} Meal: ${MEAL_TYPES[m.type] || m.type}${bits.length ? ' | ' + bits.join(' | ') : ''}`);
      });
    const trigs = f.triggers || {};
    const tlist = Object.keys(trigs)
      .filter((t) => trigs[t] > 0 && TRIGGER_TYPES[t])
      .map((t) => `${TRIGGER_TYPES[t].label}${trigs[t] > 1 ? ` x${trigs[t]}` : ''}`);
    if (tlist.length) lines.push(`[${k}] Trigger foods: ${tlist.join(', ')}`);
  });
  return orNone(lines);
}
function secMeds(days: Days, keys: DateKey[], supplements: boolean) {
  return orNone(
    eachEntry(days, keys, (d, k) =>
      (d.meds || [])
        .filter((m) => (supplements ? !MED_KEYS.has(m.type) : MED_KEYS.has(m.type)))
        .map((m) => {
          const label = MED_TYPES[m.type] ? MED_TYPES[m.type].label : m.type;
          const bits: string[] = [];
          if (m.amount) bits.push(m.amount as string);
          if (m.note) bits.push(m.note);
          return `${stamp(k, m.time)} ${label}${bits.length ? ' | ' + bits.join(' | ') : ''}`;
        }),
    ),
  );
}
function secHydration(days: Days, keys: DateKey[]) {
  const lines: string[] = [];
  keys.forEach((k) => {
    const d = days[k];
    if (!d) return;
    const water = (d.food && d.food.water) || 0;
    const liquidIv = (d.meds || []).filter((m) => m.type === 'liquidIv').length;
    const lmnt = (d.meds || []).filter((m) => m.type === 'lmnt').length;
    if (!water && !liquidIv && !lmnt) return;
    lines.push(`[${k}] Water: ${water} L | Liquid IV: ${liquidIv} packet(s) | LMNT: ${lmnt} packet(s)`);
  });
  return orNone(lines);
}
function secBM(days: Days, keys: DateKey[]) {
  return orNone(
    eachEntry(days, keys, (d, k) =>
      ((d.digestion && d.digestion.movements) || []).map((m) => {
        const bits: string[] = [];
        if (m.kind) bits.push(m.kind as string);
        if (m.volume) bits.push(`Vol ${m.volume}`);
        if (m.straining) bits.push('Straining');
        if (m.note) bits.push(m.note);
        return `${stamp(k, m.time)} BM${bits.length ? ': ' + bits.join(', ') : ''}`;
      }),
    ),
  );
}
function secSymptoms(days: Days, keys: DateKey[]) {
  return orNone(
    eachEntry(days, keys, (d, k) =>
      (d.symptoms || []).map((s) => {
        const def = SYMPTOM_TYPES[s.type];
        const label = def ? def.label : s.type;
        const parts: string[] = [];
        if (def)
          (def.fields || []).forEach((f: Field) => {
            if (isDivider(f) || (f as InputField).type === 'time' || (f as InputField).type === 'textarea') return;
            const fi = f as InputField;
            const v = rv(s, fi.key);
            if (v != null) parts.push(`${fi.label}: ${v}`);
          });
        if (s.note) parts.push(`Note: ${s.note}`);
        return `${stamp(k, s.time)} ${label}${parts.length ? ' | ' + parts.join(' | ') : ''}`;
      }),
    ),
  );
}
function secOrthostatic(days: Days, keys: DateKey[]) {
  return orNone(
    eachEntry(days, keys, (d, k) => {
      const out: string[] = [];
      (d.readings || [])
        .filter((r) => r.type === 'orthostatic')
        .forEach((r) =>
          out.push(`${stamp(k, r.time)} ${rv(r, 'transition') ?? 'Position change'} | Before HR: ${rv(r, 'beforeHr') ?? '-'} | After HR: ${rv(r, 'afterHr') ?? '-'} | HR @1min: ${rv(r, 'hr1min') ?? '-'}${noteSuffix(r)}`),
        );
      (d.symptoms || [])
        .filter((s) => s.type === 'labileHr')
        .forEach((s) =>
          out.push(`${stamp(k, s.time)} High HR event | HR: ${rv(s, 'hr') ?? '-'} | Position: ${rv(s, 'position') ?? '-'} | HR @5min rest: ${rv(s, 'hr5') ?? '-'}${noteSuffix(s)}`),
        );
      return out;
    }),
  );
}
function secScores(days: Days, keys: DateKey[], profile: Profile) {
  const lines: string[] = [];
  keys.forEach((k) => {
    const d = days[k];
    if (!d) return;
    const ss = scoreSet(d.readings || [], d, profile);
    if (ss.score == null) return;
    lines.push(`[${k}] Autonomic Score: ${ss.score}/100 (confidence ${ss.confidence}%)${blueZone(d.readings || [], profile) ? ' [BLUE ZONE - high readiness masking fragile RMSSD]' : ''}`);
  });
  return orNone(lines);
}
function secCleanDays(days: Days, keys: DateKey[]) {
  const lines: string[] = [];
  keys.forEach((k) => {
    const c = dayCleanliness(days, k);
    if (!c) return;
    const missed = c.criteria.filter((x) => !x.pending && !x.pass).map((x) => x.label);
    lines.push(`[${k}] Clean day: ${c.clean ? 'YES' : 'NO'}${missed.length ? ` (missed: ${missed.join(', ')})` : ''}`);
  });
  return orNone(lines);
}

// Section registry: key -> [heading, builder].
type SecBuilder = (days: Days, keys: DateKey[], profile: Profile) => string;
const SECTION_DEFS: Record<string, [string, SecBuilder]> = {
  hrv: ['HRV READINGS (structured + unstructured)', (d, k) => secHRV(d, k)],
  breathStyles: ['BREATHING PATTERN USED', (d, k) => secBreathStyles(d, k)],
  bp: ['BLOOD PRESSURE READINGS', (d, k) => secBP(d, k)],
  ecg: ['ECG DATA', (d, k) => secECG(d, k)],
  rhr: ['RESTING HEART RATE', (d, k) => secRHR(d, k)],
  spo2: ['BLOOD OXYGEN', (d, k) => secSPO2(d, k)],
  sleep: ['SLEEP DATA', (d, k) => secSleep(d, k)],
  activities: ['ACTIVITIES', (d, k) => secActivities(d, k)],
  food: ['FOOD LOG', (d, k) => secFood(d, k)],
  meds: ['MEDICATIONS TAKEN', (d, k) => secMeds(d, k, false)],
  supplements: ['SUPPLEMENTS TAKEN', (d, k) => secMeds(d, k, true)],
  hydration: ['HYDRATION', (d, k) => secHydration(d, k)],
  bm: ['BOWEL MOVEMENTS', (d, k) => secBM(d, k)],
  symptoms: ['SYMPTOMS NOTED', (d, k) => secSymptoms(d, k)],
  orthostatic: ['ORTHOSTATIC / HR EVENTS', (d, k) => secOrthostatic(d, k)],
  scores: ['DAILY AUTONOMIC SCORES', (d, k, p) => secScores(d, k, p)],
  cleanDays: ['CLEAN DAY STATUS', (d, k) => secCleanDays(d, k)],
};

export function renderSections(days: Days, keys: DateKey[], profile: Profile, list: string[]): string {
  return list
    .map((key) => {
      const def = SECTION_DEFS[key];
      return def ? `${def[0]}:\n${def[1](days, keys, profile)}` : '';
    })
    .filter(Boolean)
    .join('\n\n');
}

// Universal prompt header (shared by every card), with the subject's age/sex
// pulled from the profile when set.
export function universalHeader(profile: Profile, rangeText: string): string {
  const age = ageFromBirthday(profile && profile.birthday) || 37;
  const sex = ((profile && profile.sex) || 'male').toString().toLowerCase() || 'male';
  return `You are analyzing health data for someone with long COVID dysautonomia, POTS, MCAS, Roemheld syndrome, and suspected vestibular migraine. They are a ${age}-year-old ${sex}, 3+ years into long COVID recovery.

Approach this analysis as an honest friend examining the data carefully - not blowing smoke or making them feel better artificially, but also not being brutally harsh. Be direct and accurate without unnecessary softening or unnecessary cruelty. They want truth delivered with care.

REQUIREMENTS FOR YOUR ANALYSIS:
- Be concise - no fluff or filler content
- Be accurate - don't miss data points provided
- Be honest - acknowledge both progress and setbacks truthfully
- Be specific - use actual numbers from the data, not generalities
- Be research-grounded - cite scientific evidence where relevant
- Be careful with recommendations - if suggesting interventions, note they should discuss with a doctor first, especially for medications, supplements at therapeutic doses, or major protocol changes
- Work hard - really think through the data, don't surface-level skim
- Be rich and genuinely helpful - provide insights that matter

STRUCTURE YOUR RESPONSE AS FOLLOWS:

Analysis
[Your detailed analysis of the data]

Trends Identified
[Patterns and trends you see in the period]

Recovery Position
[Where they are in recovery based on data]

Projections
[Where things appear to be heading based on current trajectory]

Recommendations
[Specific actionable suggestions, noting doctor consultation when appropriate]

Citations
[Research references that support your analysis where applicable]

PERIOD ANALYZED: ${rangeText}`;
}

// Count loggable entries across the days (used for empty/sparse detection).
export function entryCount(days: Days, keys: DateKey[]): number {
  let n = 0;
  keys.forEach((k) => {
    const d = days[k];
    if (!d) return;
    n += (d.readings || []).length + (d.activities || []).length + (d.meds || []).length + (d.symptoms || []).length;
    n += ((d.food && d.food.meals) || []).length;
    if (d.food && d.food.triggers) n += Object.values(d.food.triggers).filter((v) => v > 0).length;
    n += ((d.digestion && d.digestion.movements) || []).length;
    if (d.sleep && (d.sleep.bed || d.sleep.wake)) n += 1;
  });
  return n;
}
export const hasAnyData = (days: Days, keys: DateKey[]) => entryCount(days, keys) > 0;

export type ReportRange = 'day' | 'week' | 'month' | 'year';

// Resolve the selected range into the list of day-keys and a human label.
// `currentKey` is the journal's current day (used for the "day" range).
export function reportDateRange(range: ReportRange, currentKey: DateKey): { keys: DateKey[]; rangeText: string } {
  const todayKey = keyOf(new Date());
  const longFmt = (k: DateKey) => dateFromKey(k).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  if (range === 'day') {
    const k = currentKey;
    const text = (k === todayKey ? 'Today, ' : '') + longFmt(k);
    return { keys: [k], rangeText: text };
  }
  const span = range === 'week' ? 7 : range === 'month' ? 30 : 365;
  const start = new Date();
  start.setDate(start.getDate() - (span - 1));
  const keys: DateKey[] = [];
  for (let i = 0; i < span; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    keys.push(keyOf(d));
  }
  const rangeText =
    range === 'week'
      ? `Week of ${longFmt(keys[0])} to ${longFmt(todayKey)}`
      : range === 'month'
        ? `Past 30 days (${longFmt(keys[0])} to ${longFmt(todayKey)})`
        : `Past 12 months (${longFmt(keys[0])} to ${longFmt(todayKey)})`;
  return { keys, rangeText };
}
