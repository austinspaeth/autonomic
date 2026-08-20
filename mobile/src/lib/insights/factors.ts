/**
 * The "driver" side of a correlation: one column per thing the user does, has, or
 * is exposed to on a given day.
 *
 * Outcomes are a hand-curated registry (../trends/metrics) because every one of
 * them becomes a sentence. Factors are the opposite — they are generated from
 * whatever this particular user actually logs, including their own custom
 * activities, supplements, symptoms and triggers, because the interesting driver
 * is very often one the app has never heard of.
 *
 * Two rules make the generated columns trustworthy:
 *
 * 1. AN ABSENT DAY IS `null`, NOT `0`. A day with no journal record says nothing
 *    about whether magnesium was taken, and feeding it in as a zero would invent
 *    thousands of fake "didn't take it" observations.
 * 2. A FACTOR HAS AN ACTIVE WINDOW. This is the subtler and more important one. If
 *    someone starts logging supplements in month four of a nine-month journal,
 *    months one to three are not "days without magnesium" — they are days we know
 *    nothing about. Scored naively, every supplement would appear to have
 *    transformed their health, because the pre-logging era also happens to be
 *    when they were sickest and least organised. Each factor therefore declares a
 *    `presence` probe, and ./matrix nulls it outside the span where its whole
 *    category was being recorded.
 *
 * Pure: no store, no MMKV, no expo, no React. Type labels are resolved from
 * ../registry plus `state.customTypes` directly rather than through
 * ../typeCatalog, which imports the store.
 */
import { ACTIVITY_TYPES, MED_TYPES, SYMPTOM_TYPES, TRIGGER_TYPES } from '../registry';
import { DEFAULT_PROTOCOL, activityGrade, dayCleanliness, sleepHours, waterGoalL, type DaysMap } from '../scoring/day';
import type { ScoreContext } from '../scoring';
import type { AppState, DayRecord, TypeDef } from '../types';

export type FactorKind = 'binary' | 'continuous';

export type FactorGroup =
  | 'supplement' | 'medication' | 'trigger' | 'activity' | 'symptom'
  | 'sleep' | 'hydration' | 'digestion' | 'protocol' | 'note';

/**
 * How to tell whether a day carries any information about this factor.
 *
 * `span` — the factor is knowable from the first day its category appears in the
 * journal onward. Correct for meds, activities, symptoms and triggers, where not
 * logging one on a day you logged others means you didn't have it.
 *
 * `day` — knowable only on days the probe passes, with no span. Correct for note
 * keywords: a day with no note is silent about the word "stress", it is not
 * evidence of a calm day.
 */
export interface FactorPresence {
  key: string;
  mode: 'span' | 'day';
  has: (d: DayRecord) => boolean;
}

export interface FactorDef {
  id: string;
  /** Full name, for the all-correlations list. */
  label: string;
  /** Short name for the `driver → metric` row. */
  driver: string;
  /**
   * The factor as the SUBJECT of a sentence: "Alcohol days", "Interrupted
   * nights", "Days you hit the water goal".
   *
   * Defaults to `${label} days`, which is right for every type-derived factor
   * because those labels are nouns. The derived factors need it spelled out —
   * their labels are verb phrases, and the default produced "Slept 7 hours or
   * more days show higher SDNN".
   */
  subject?: string;
  /**
   * The factor as something a person STARTED taking: "magnesium glycinate".
   * Present only where a first occurrence is genuinely an onset.
   *
   * This gates ./change's before/after analysis, and the distinction is substantive
   * rather than cosmetic. Starting a supplement is a decision with a date. The first
   * night somebody happened to sleep seven hours is not — it is a threshold crossing
   * inside a trend, and treating it as an intervention reported "SDNN is up since
   * you started sleeping 7 hours or more", which mistakes a symptom of recovery for
   * its cause.
   *
   * MEDS AND SUPPLEMENTS ONLY, which is narrower than it first looks like it should
   * be. Starting an exercise programme is a real intervention too, but the type
   * labels are bare verbs ("Walk", "Run", "Swim") and the onset sentence came out as
   * "since you started walk". That the grammar breaks is a fair signal: a walk
   * appearing in the log once is much weaker evidence of a decision than a
   * supplement appearing every day is. Activities still show up in ./correlate,
   * where "Walk days show higher SDNN" reads correctly.
   */
  onsetNoun?: string;
  group: FactorGroup;
  kind: FactorKind;
  /**
   * Day offsets at which this factor could plausibly move an outcome. 0 is
   * same-day, 1 is next-day — the lag that catches "alcohol costs you tomorrow
   * morning", which is the single most useful shape in this whole data set and
   * invisible to a same-day-only sweep.
   */
  lags: number[];
  /**
   * Outcome families this factor may never be tested against, because the answer
   * is arithmetic rather than a finding. Without it the top of the list reads
   * "water intake is linked to water intake".
   */
  blocks: string[];
  /**
   * Shared key for factors that are alternative encodings of ONE underlying
   * thing, so ./correlate can report the best of them rather than all of them.
   *
   * "Any activity", "activity minutes" and "heavy exertion day" are three readings
   * of the same day's exertion, and a screen showing all three against the same
   * outcome has said one thing three times. Distinct types (`activity:walk`,
   * `activity:yoga`) deliberately do NOT share a key — those really are different
   * things, and collapsing supplements or triggers this way would hide findings.
   */
  variantOf?: string;
  /** Raw per-day value. ./matrix applies `presence` on top of this. */
  value: (d: DayRecord | undefined, dk: string, days: DaysMap, ctx: ScoreContext) => number | null;
  presence?: FactorPresence;
}

/** A factor needs this many days on each side of itself to be worth testing at
 *  all. Enforced loosely here (occurrences) and strictly in ./correlate (both
 *  groups, after the active window is applied). */
export const MIN_FACTOR_DAYS = 8;

/* ---------- presence probes ---------- */

const anyMeds = (d: DayRecord) => (d.meds || []).length > 0;
const anyActivities = (d: DayRecord) => (d.activities || []).length > 0;
const anySymptoms = (d: DayRecord) => (d.symptoms || []).length > 0;
const anyTriggers = (d: DayRecord) => !!d.food && Object.values(d.food.triggers || {}).some((v) => Number(v) > 0);
const hasNote = (d: DayRecord) => !!(d.notes && d.notes.trim());

const SPAN_MEDS: FactorPresence = { key: 'meds', mode: 'span', has: anyMeds };
const SPAN_ACTIVITIES: FactorPresence = { key: 'activities', mode: 'span', has: anyActivities };
const SPAN_SYMPTOMS: FactorPresence = { key: 'symptoms', mode: 'span', has: anySymptoms };
const SPAN_TRIGGERS: FactorPresence = { key: 'triggers', mode: 'span', has: anyTriggers };
const DAY_NOTES: FactorPresence = { key: 'notes', mode: 'day', has: hasNote };

/* ---------- helpers ---------- */

const num = (v: unknown): number | null => { const n = parseFloat(String(v)); return Number.isFinite(n) ? n : null; };

/** Medications proper; everything else in MED_TYPES is a supplement. Same split
 *  ../analysis/reports uses, so the two never disagree about what to call a row. */
const MED_KEYS = new Set(['allegra', 'pepsidAc', 'gaviscon', 'melatonin']);

const BUILTIN: Record<string, Record<string, TypeDef>> = {
  meds: MED_TYPES, activities: ACTIVITY_TYPES, symptoms: SYMPTOM_TYPES, triggers: TRIGGER_TYPES,
};

/** Label for a type key, honouring the user's own definitions and overrides. */
function labelFor(state: AppState, kind: string, key: string): string {
  const custom = state.customTypes && (state.customTypes as Record<string, Record<string, TypeDef>>)[kind];
  const def = (custom && custom[key]) || BUILTIN[kind][key];
  return (def && def.label) || key;
}

const hasType = (list: { type?: string }[] | undefined, type: string) =>
  (list || []).some((e) => e.type === type);

/* ---------- note keywords ---------- */

/**
 * Words too common, too vague, or too grammatical to be a finding. Kept short on
 * purpose: the filter that actually does the work is the coverage requirement
 * below, which throws out anything that isn't on at least MIN_FACTOR_DAYS days
 * AND absent from at least that many.
 */
const STOPWORDS = new Set([
  'about', 'after', 'again', 'against', 'almost', 'along', 'already', 'also', 'always', 'another',
  'around', 'because', 'been', 'before', 'being', 'better', 'between', 'both', 'came', 'come',
  'could', 'did', 'didnt', 'does', 'doing', 'done', 'dont', 'down', 'during', 'each', 'even',
  'ever', 'every', 'feel', 'feeling', 'felt', 'few', 'from', 'gave', 'get', 'getting', 'going',
  'gone', 'good', 'got', 'had', 'has', 'have', 'having', 'here', 'his', 'her', 'hers', 'how',
  'into', 'its', 'just', 'kind', 'know', 'last', 'later', 'least', 'less', 'like', 'little',
  'lot', 'made', 'make', 'many', 'maybe', 'might', 'more', 'morning', 'most', 'much', 'must',
  'near', 'need', 'never', 'next', 'night', 'not', 'nothing', 'now', 'off', 'once', 'only',
  'other', 'our', 'out', 'over', 'own', 'per', 'pretty', 'put', 'quite', 'rather', 'really',
  'said', 'same', 'saw', 'say', 'seem', 'seemed', 'seems', 'she', 'should', 'since', 'slightly',
  'some', 'something', 'soon', 'started', 'still', 'such', 'sure', 'take', 'taken', 'than',
  'that', 'thats', 'the', 'their', 'them', 'then', 'there', 'these', 'they', 'thing', 'things',
  'think', 'this', 'those', 'though', 'through', 'time', 'today', 'together', 'too', 'took',
  'try', 'trying', 'under', 'until', 'upon', 'used', 'using', 'very', 'want', 'was', 'wasnt',
  'well', 'went', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whole', 'why',
  'will', 'with', 'without', 'wont', 'would', 'yesterday', 'yet', 'you', 'your',
]);

/** Distinct alphabetic tokens of 4+ characters in a note. */
function tokens(note: string): Set<string> {
  const out = new Set<string>();
  note.toLowerCase().split(/[^a-z]+/).forEach((w) => {
    if (w.length >= 4 && !STOPWORDS.has(w)) out.add(w);
  });
  return out;
}

/** Cap on how many note keywords become factors, so a diarist can't flood the
 *  test family and blunt the FDR correction for everyone else. */
const MAX_NOTE_KEYWORDS = 20;

/* ---------- almost-testable progress ---------- */

/** A factor that is short of testable, and how short: `have` of `need` days. */
export interface FactorProgress {
  driver: string;
  have: number;
  need: number;
}

/**
 * The types closest to becoming testable, for the empty screen's "keep going"
 * rows: a sparse journal's alternative to a blank wall.
 *
 * Meds and activities only — the deliberate interventions, the things a person
 * is logging BECAUSE they want to know whether they work. Only the days-WITH
 * shortfall is reported: a supplement taken every single day is short of
 * days-without, and "log less of it" is not advice this card should give.
 */
export function factorProgress(state: AppState, keys: string[]): FactorProgress[] {
  const days = state.days;
  const counts = { meds: new Map<string, number>(), activities: new Map<string, number>() };
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) || 0) + 1);
  keys.forEach((dk) => {
    const d = days[dk];
    if (!d) return;
    new Set((d.meds || []).map((e) => e.type)).forEach((t) => t && bump(counts.meds, t));
    new Set((d.activities || []).map((e) => e.type)).forEach((t) => t && bump(counts.activities, t));
  });

  const out: FactorProgress[] = [];
  (['meds', 'activities'] as const).forEach((kind) => {
    counts[kind].forEach((n, type) => {
      // Two or more occurrences: a single day is not "almost" anything, and
      // promising a finding off the back of one dose would be a nag.
      if (n < 2 || n >= MIN_FACTOR_DAYS) return;
      out.push({ driver: labelFor(state, kind, type), have: n, need: MIN_FACTOR_DAYS });
    });
  });

  // Closest to the line first; alphabetical to make the order total.
  return out
    .sort((a, b) => ((a.need - a.have) - (b.need - b.have)) || (a.driver < b.driver ? -1 : 1))
    .slice(0, 3);
}

/* ---------- the builder ---------- */

/**
 * Every factor worth testing for this user over this key range.
 *
 * One pass over `keys` counts what is actually logged, then only types that
 * appear on at least MIN_FACTOR_DAYS days AND are missing from at least that many
 * become columns. Both halves matter: a supplement taken every single day has no
 * contrast and can tell us nothing, and one taken twice has no weight.
 */
export function buildFactors(state: AppState, keys: string[], opts: {
  /**
   * Override for MIN_FACTOR_DAYS. The early-signals sweep (./correlate) passes
   * a lower floor, because at day eight of a journal NO type can have eight
   * days on each side of itself — the standard floor would leave the early
   * tier with nothing to test. Everything else uses the default.
   */
  minDays?: number;
} = {}): FactorDef[] {
  const days = state.days;
  const counts = {
    meds: new Map<string, number>(),
    activities: new Map<string, number>(),
    symptoms: new Map<string, number>(),
    triggers: new Map<string, number>(),
  };
  const noteDayCount = new Map<string, number>();
  let recorded = 0;
  let noteDays = 0;

  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) || 0) + 1);

  keys.forEach((dk) => {
    const d = days[dk];
    if (!d) return;
    recorded++;
    new Set((d.meds || []).map((e) => e.type)).forEach((t) => t && bump(counts.meds, t));
    new Set((d.activities || []).map((e) => e.type)).forEach((t) => t && bump(counts.activities, t));
    new Set((d.symptoms || []).map((e) => e.type)).forEach((t) => t && bump(counts.symptoms, t));
    Object.entries((d.food && d.food.triggers) || {}).forEach(([t, v]) => { if (Number(v) > 0) bump(counts.triggers, t); });
    if (hasNote(d)) { noteDays++; tokens(d.notes as string).forEach((w) => bump(noteDayCount, w)); }
  });

  /** Enough days with it, and enough without it, to be a comparison. */
  const floor = opts.minDays ?? MIN_FACTOR_DAYS;
  const usable = (n: number, universe: number) => n >= floor && universe - n >= floor;

  const out: FactorDef[] = [];

  // Supplements and medications. A supplement is the single most actionable
  // driver this app can surface, which is why they come first.
  counts.meds.forEach((n, type) => {
    if (!usable(n, recorded)) return;
    const label = labelFor(state, 'meds', type);
    out.push({
      id: `med:${type}`,
      label,
      driver: label,
      onsetNoun: label.toLowerCase(),
      group: MED_KEYS.has(type) ? 'medication' : 'supplement',
      kind: 'binary',
      lags: [0, 1],
      blocks: ['protocol'],
      presence: SPAN_MEDS,
      value: (d) => (d ? (hasType(d.meds, type) ? 1 : 0) : null),
    });
  });

  counts.activities.forEach((n, type) => {
    if (!usable(n, recorded)) return;
    const label = labelFor(state, 'activities', type);
    out.push({
      id: `activity:${type}`,
      label,
      driver: label,
      group: 'activity',
      kind: 'binary',
      lags: [0, 1],
      blocks: ['protocol'],
      presence: SPAN_ACTIVITIES,
      value: (d) => (d ? (hasType(d.activities, type) ? 1 : 0) : null),
    });
  });

  counts.symptoms.forEach((n, type) => {
    if (!usable(n, recorded)) return;
    const label = labelFor(state, 'symptoms', type);
    out.push({
      id: `symptom:${type}`,
      label,
      driver: label,
      group: 'symptom',
      kind: 'binary',
      lags: [0, 1],
      // A symptom is one of the entries symptomLoad counts, so pairing the two
      // measures nothing.
      blocks: ['symptoms'],
      presence: SPAN_SYMPTOMS,
      value: (d) => (d ? (hasType(d.symptoms, type) ? 1 : 0) : null),
    });
  });

  counts.triggers.forEach((n, type) => {
    if (!usable(n, recorded)) return;
    const label = labelFor(state, 'triggers', type);
    out.push({
      id: `trigger:${type}`,
      label,
      driver: label,
      group: 'trigger',
      kind: 'binary',
      lags: [0, 1],
      // Avoiding triggers is a hard clean-day criterion, so a trigger cannot help
      // but predict cleanDays.
      blocks: ['protocol'],
      presence: SPAN_TRIGGERS,
      value: (d) => (d ? (Number((d.food && d.food.triggers && d.food.triggers[type]) || 0) > 0 ? 1 : 0) : null),
    });
  });

  // Note keywords: recurring words in the user's own writing. Often the only
  // place a real driver lives — "period", "flare", "deadline", a food nobody
  // thought to make a trigger type for.
  Array.from(noteDayCount.entries())
    .filter(([, n]) => usable(n, noteDays))
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_NOTE_KEYWORDS)
    .forEach(([word]) => {
      out.push({
        id: `note:${word}`,
        label: `Notes mentioning "${word}"`,
        driver: `"${word}" in notes`,
        subject: `Days you mentioned "${word}"`,
        group: 'note',
        kind: 'binary',
        lags: [0, 1],
        blocks: [],
        presence: DAY_NOTES,
        value: (d) => (d && d.notes ? (tokens(d.notes).has(word) ? 1 : 0) : null),
      });
    });

  out.push(...derivedFactors());
  return out;
}

/**
 * Factors that exist for every user because they come from structured fields
 * rather than from types. `presence` is omitted throughout: each `value` already
 * returns null when its own field is missing, which is the correct and stricter
 * test.
 */
function derivedFactors(): FactorDef[] {
  return [
    {
      id: 'sleep:hours',
      variantOf: 'sleep-load',
      label: 'Hours slept',
      driver: 'Sleep duration',
      group: 'sleep',
      kind: 'continuous',
      // Lag 0 only: `sleep.bed` is LAST night, so a day's sleep column already
      // sits before that day's readings. A lag-1 test would be asking whether
      // last night's sleep affects tomorrow, through tonight's sleep.
      lags: [0],
      blocks: ['sleep', 'protocol'],
      value: (d, dk, days) => sleepHours(days, dk),
    },
    {
      id: 'sleep:long',
      subject: 'Nights of 7 hours or more',
      variantOf: 'sleep-load',
      label: 'Slept 7 hours or more',
      driver: 'Sleep 7h+',
      group: 'sleep',
      kind: 'binary',
      lags: [0],
      blocks: ['sleep', 'protocol'],
      value: (d, dk, days) => { const h = sleepHours(days, dk); return h == null ? null : h >= 7 ? 1 : 0; },
    },
    {
      id: 'sleep:short',
      subject: 'Nights under 6 hours',
      variantOf: 'sleep-load',
      label: 'Slept under 6 hours',
      driver: 'Sleep under 6h',
      group: 'sleep',
      kind: 'binary',
      lags: [0, 1],
      blocks: ['sleep', 'protocol'],
      value: (d, dk, days) => { const h = sleepHours(days, dk); return h == null ? null : h < 6 ? 1 : 0; },
    },
    {
      id: 'sleep:interrupted',
      subject: 'Interrupted nights',
      label: 'Interrupted night',
      driver: 'Interrupted sleep',
      group: 'sleep',
      kind: 'binary',
      lags: [0, 1],
      blocks: ['sleep'],
      value: (d) => {
        if (!d || !d.sleep || !(d.sleep.bed || d.sleep.wake)) return null;
        return d.sleep.quality === 'interrupted' ? 1 : 0;
      },
    },
    {
      id: 'water:litres',
      variantOf: 'water-load',
      label: 'Water drunk',
      driver: 'Water intake',
      group: 'hydration',
      kind: 'continuous',
      lags: [0, 1],
      blocks: ['hydration', 'protocol'],
      // Only days water was actually recorded, for the reason waterIntake gives.
      value: (d) => { const w = d && d.food ? num(d.food.water) : null; return w != null && w > 0 ? w : null; },
    },
    {
      id: 'water:goal',
      subject: 'Days you hit the water goal',
      variantOf: 'water-load',
      label: 'Hit the water goal',
      driver: 'Water goal met',
      group: 'hydration',
      kind: 'binary',
      lags: [0, 1],
      blocks: ['hydration', 'protocol'],
      value: (d, dk, days, ctx) => {
        const w = d && d.food ? num(d.food.water) : null;
        if (w == null || w <= 0) return null;
        return w >= waterGoalL(ctx.protocol) ? 1 : 0;
      },
    },
    {
      id: 'activity:any',
      subject: 'Days with any activity',
      variantOf: 'activity-load',
      label: 'Any activity logged',
      driver: 'Any activity',
      group: 'activity',
      kind: 'binary',
      lags: [0, 1],
      blocks: ['protocol'],
      presence: SPAN_ACTIVITIES,
      value: (d) => (d ? (anyActivities(d) ? 1 : 0) : null),
    },
    {
      id: 'activity:hard',
      subject: 'Heavy exertion days',
      variantOf: 'activity-load',
      label: 'Heavy exertion day',
      driver: 'Heavy exertion',
      group: 'activity',
      kind: 'binary',
      lags: [0, 1],
      blocks: ['protocol'],
      presence: SPAN_ACTIVITIES,
      // activityGrade is the same load reading detectDownturn uses to name
      // exertion as a cause, so a finding here lines up with the crash warning.
      value: (d) => { if (!d) return null; const g = activityGrade(d.activities); return g == null ? null : g === 'bad' ? 1 : 0; },
    },
    {
      id: 'activity:minutes',
      variantOf: 'activity-load',
      label: 'Minutes of activity',
      driver: 'Activity minutes',
      group: 'activity',
      kind: 'continuous',
      lags: [0, 1],
      blocks: ['protocol'],
      presence: SPAN_ACTIVITIES,
      value: (d) => {
        if (!d) return null;
        const mins = (d.activities || []).reduce((s, a) => s + (num(a.duration) || 0), 0);
        return mins;
      },
    },
    {
      id: 'trigger:any',
      subject: 'Days with any trigger',
      variantOf: 'trigger-load',
      label: 'Any trigger logged',
      driver: 'Any trigger',
      group: 'trigger',
      kind: 'binary',
      lags: [0, 1],
      blocks: ['protocol'],
      presence: SPAN_TRIGGERS,
      value: (d) => (d ? (anyTriggers(d) ? 1 : 0) : null),
    },
    {
      id: 'trigger:count',
      variantOf: 'trigger-load',
      label: 'Number of triggers',
      driver: 'Trigger count',
      group: 'trigger',
      kind: 'continuous',
      lags: [0, 1],
      blocks: ['protocol'],
      presence: SPAN_TRIGGERS,
      value: (d) => (d ? Object.values((d.food && d.food.triggers) || {}).reduce((s, v) => s + (Number(v) > 0 ? 1 : 0), 0) : null),
    },
    {
      id: 'bm:none',
      subject: 'Days with no bowel movement',
      label: 'No bowel movement',
      driver: 'No bowel movement',
      group: 'digestion',
      kind: 'binary',
      lags: [0, 1],
      blocks: ['digestion'],
      presence: { key: 'digestion', mode: 'span', has: (d) => ((d.digestion && d.digestion.movements) || []).length > 0 },
      value: (d) => (d ? (((d.digestion && d.digestion.movements) || []).length === 0 ? 1 : 0) : null),
    },
    {
      id: 'protocol:clean',
      subject: 'Clean days',
      label: 'Clean day',
      driver: 'Clean day',
      group: 'protocol',
      kind: 'binary',
      lags: [0, 1],
      // Blocks the criteria it is BUILT from, not just itself. A clean day
      // requires hitting the water goal and the sleep target, so pairing it with
      // hydration or sleep restates the protocol as though it were a discovery —
      // and did exactly that, deterministically, in every seed of the noise test.
      blocks: ['protocol', 'hydration', 'sleep'],
      value: (d, dk, days, ctx) => {
        const c = dayCleanliness(days, dk, ctx.protocol || DEFAULT_PROTOCOL, ctx.customTypes);
        return c ? (c.clean ? 1 : 0) : null;
      },
    },
  ];
}
