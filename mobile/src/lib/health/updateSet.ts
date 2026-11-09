/**
 * Pure core of the periodic health-store update check: given a day's raw
 * platform reads and the journal day they'd land in, decide what is actually
 * importable — never our own write-backs, never anything that would duplicate
 * an existing entry, and never two offers for the same sample. Kept free of
 * react-native/store imports so the dedup rules run in jest; the fetching/
 * writing shell lives in ./updates.
 *
 * Health stores hand back genuine duplicates: a resting HR that both the phone
 * and the watch wrote, a workout a third-party app mirrored. Every candidate is
 * therefore checked against the ones already accepted here as well as against
 * the journal — same rule either way. (Two rows for one sample also shared an
 * item key, which is what made ticking one tick the other.)
 *
 * What qualifies:
 *  - Sleep: last night's session while the day has no bed/wake yet, or in
 *    place of an imported night nobody edited when the new read is longer
 *    (`sleepToFile`).
 *  - Readings: HRV with real beat-to-beat RR covering ≥ 4 minutes, resting HR,
 *    and blood pressure — each deduped against the day's readings.
 *  - Exercises: the day's workouts, one row per session, excluding sessions
 *    this app authored (watch stand tests etc.).
 *  - Medications (iOS 26+): doses logged as TAKEN in the Health app's own
 *    medication list. A dose whose medication matches one of the user's med
 *    types is filed under it; one that matches nothing is still OFFERED, and
 *    importing it CREATES the type (`create` below) — the alternative was a
 *    feature that silently imported nothing, since almost nobody's med list is
 *    spelled the way the built-in types are (./medications).
 *  - Symptoms: the symptoms the user logs in the Health app, mapped to the
 *    journal's own symptom types (./symptomMap). Never a sample saying a
 *    symptom was absent, and never one of our own cycle-symptom write-backs.
 */
import type { DayRecord, Entry, SleepRecord, TypeDef } from '../types';
import { fmtTime12 } from '../dates';
import { isPoorImport, type ImportedHrvQuality } from '../hrvQuality';
import type { ImportedMed, ImportedReading, ImportedSymptom, ImportedWorkout, SleepImport } from './index';
import { workoutCandidateOf, type WorkoutCandidate } from './workoutCandidate';
import { matchMedType, medTypeLabel } from './medications';
import { slugify } from '../typeResolve';

/** Minimum RR coverage for an importable HRV reading (sum of intervals). */
const HRV_MIN_MS = 4 * 60 * 1000;
/** Two timestamps this close (minutes) are "the same moment" for dedup. */
const NEAR_MIN = 10;
/** A med dose within this window of a logged dose of the same type is a dupe. */
const MED_NEAR_MIN = 60;
/** A symptom within this window of a logged one of the same type is a dupe.
 *  Wider than a reading's: a symptom has no instant, it has a stretch of the
 *  day, so somebody who logs "dizzy" in the app and then again in Health half
 *  an hour later means one episode, not two. */
const SYMPTOM_NEAR_MIN = 45;

export interface UpdateReading {
  key: string;
  type: 'hrv' | 'restingHr' | 'bp';
  time: string;                        // HH:MM local
  title: string;                       // "HRV 48 ms" / "118/76" / "Resting HR 58 bpm"
  sub: string;                         // "6:52 AM · 5 min"
  fields: Record<string, string>;      // prefilled entry fields
  rr?: number[];                       // beat-to-beat RR, destined for the sidecar
  /** HRV only: the series' seams and the time each lost, kept beside `rr`. */
  segmentStarts?: number[];
  seamGapsMs?: number[];
  /** HRV only: when the sample began, which is how a session the phone started
   *  recognises the reading it was for (garmin/intent). */
  startMs?: number;
  /** HRV only: how good the beat series behind it was, so the offer can say so
   *  before it is accepted (src/lib/hrvQuality). Absent = nothing to grade. */
  quality?: ImportedHrvQuality;
}

export interface UpdateMed {
  key: string;
  /** The med type key this would be filed under. For a `create` row it is the
   *  key the catalog is EXPECTED to mint, and is used only for the fingerprint:
   *  the real key comes back from `addCustomType` at import. */
  type: string;
  time: string;
  title: string;
  sub: string;
  amount: string | null;
  /** Set when the user has no med type for this medication: importing the row
   *  creates one with this label first. Absent means the type already exists. */
  create?: { label: string };
}

export interface UpdateSymptom {
  key: string;
  type: string;                        // symptom type key (registry)
  time: string;
  title: string;
  sub: string;
  /** '' | 'Mild' | 'Moderate' | 'Severe' — rides the entry's note, since the
   *  journal's built-in symptoms carry no severity field (./updates). */
  severity: string;
}

export interface HealthUpdateSet {
  dk: string;
  sleep: SleepImport | null;
  readings: UpdateReading[];
  workouts: WorkoutCandidate[];
  meds: UpdateMed[];
  symptoms: UpdateSymptom[];
}

export function updateCount(set: HealthUpdateSet): number {
  return (set.sleep ? 1 : 0) + set.readings.length + set.workouts.length
    + set.meds.length + set.symptoms.length;
}

const clockMin = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
/** Bed → wake in minutes, across midnight. */
const nightSpanMin = (bed: string, wake: string): number => {
  const mins = clockMin(wake) - clockMin(bed);
  return mins < 0 ? mins + 1440 : mins;
};

/**
 * The night a check should file, or null.
 *
 * A night used to be offered only while the day had none, so the first read
 * was final. That is wrong whenever the first read is early: the check runs
 * on every foreground, a wearer who looks at their phone at 6am gets the night
 * as it stood at 6am, and the rest of it (Google Health writes a split night
 * in pieces) was never filed. So an IMPORTED night is replaced by a later read
 * that covers more of it. Only longer, so two sources cannot take turns, and
 * never a night the user typed or corrected: theirs is the answer.
 */
export function sleepToFile(existing: SleepRecord | undefined, fresh: SleepImport | null): SleepImport | null {
  if (!fresh) return null;
  if (!(existing?.bed && existing?.wake)) return fresh;
  if (!existing.imported || existing.edited) return null;
  if (existing.bed === fresh.bed && existing.wake === fresh.wake) return null;
  return nightSpanMin(fresh.bed, fresh.wake) > nightSpanMin(existing.bed, existing.wake) ? fresh : null;
}

/** Stable identity of the sleep row (its selection key is just 'sleep'). */
export const sleepItemKey = (s: SleepImport): string => `sleep-${s.bed}-${s.wake}`;

/** Every item's stable key — what the pill's "already shown this" memory holds. */
export function allItemKeys(set: HealthUpdateSet): string[] {
  return [
    ...(set.sleep ? [sleepItemKey(set.sleep)] : []),
    ...set.readings.map((r) => r.key),
    ...set.workouts.map((w) => w.key),
    ...set.meds.map((m) => m.key),
    ...set.symptoms.map((y) => y.key),
  ];
}

/** Drop items the user has already been shown (viewed the card, or dismissed
 *  the pill) so the pill never re-offers them; the Settings check skips this. */
export function filterSeen(set: HealthUpdateSet, seen: ReadonlySet<string>): HealthUpdateSet {
  return {
    dk: set.dk,
    sleep: set.sleep && !seen.has(sleepItemKey(set.sleep)) ? set.sleep : null,
    readings: set.readings.filter((r) => !seen.has(r.key)),
    workouts: set.workouts.filter((w) => !seen.has(w.key)),
    meds: set.meds.filter((m) => !seen.has(m.key)),
    symptoms: set.symptoms.filter((y) => !seen.has(y.key)),
  };
}

/**
 * Identity of an imported item that survives on the journal entry itself.
 *
 * The item key (`hrv-<startMs>`) is stamped onto entries as `healthKey` at
 * import, but entries written by older builds don't carry one — and a deleted
 * entry is all we have to work from. This day/kind/type/time fingerprint is the
 * fallback match: the import writes the sample's local HH:MM verbatim, so a
 * re-read of the same sample lands on the same fingerprint.
 */
export type ItemKind = 'reading' | 'workout' | 'med' | 'symptom';
export function importFingerprint(dk: string, kind: ItemKind, type: string, time: string): string {
  return `fp:${dk}:${kind}:${type}:${time}`;
}

/**
 * Is this imported item ALREADY in the day?
 *
 * `buildUpdateSet` asks this per type as it filters the daily check. The
 * one-shot historical sweep needs the same question but has no item keys to
 * compare (a HistoryBundle carries none), and it can now be run at any time
 * rather than only on a virgin journal — so a year-long backfill accepted after
 * a week of daily imports would otherwise write a second copy of that week.
 * Time proximity is the only identity both paths share: both write the sample's
 * local HH:MM verbatim, so the same sample lands within the tolerance of
 * itself. Deliberately NOT limited to `imported` entries — a health sample and
 * a hand-logged reading ten minutes apart are one event logged twice, which is
 * exactly what `buildUpdateSet` already assumes.
 */
export function dayAlreadyHas(
  day: DayRecord | undefined, kind: ItemKind, type: string, time: string,
): boolean {
  return listFor(day, kind).some((e) => sameItemType(kind, type, e.type) && near(e.time, time, tolFor(kind)));
}

/** The day's entries of an item's kind. */
const listFor = (day: DayRecord | undefined, kind: ItemKind): Entry[] =>
  (kind === 'reading' ? day?.readings : kind === 'workout' ? day?.activities
    : kind === 'symptom' ? day?.symptoms : day?.meds) || [];

const hrvish = (t: unknown) => t === 'hrv' || t === 'breathHrv';
/** Two types that mean the same measurement. A watch Breathe session files as
 *  `breathHrv` and a baseline as `hrv`, and one heartbeat series is one
 *  reading whichever of the two the wearer called it (../hrvKind). */
const sameItemType = (kind: ItemKind, a: string, b: unknown) =>
  (kind === 'reading' && hrvish(a) ? hrvish(b) : a === b);

/**
 * The entry that ALREADY holds this health sample, if the day holds one.
 *
 * `dayAlreadyHas` asks the same question for the import build, which has no
 * entry to hand back. This one is for the WRITE paths: the watch-sync card and
 * the on-demand HRV import file a reading for a sample the quiet check may have
 * filed on its own initiative minutes earlier (it runs on every foreground, and
 * putting the phone down to use the watch IS a foreground), and the answer has
 * to be the entry itself so the second write can land ON it rather than beside
 * it. One Apple Health sample is one journal reading, whoever gets there first.
 *
 * The sample's own key leads — `healthKey` is exact, and it is the only thing
 * that still matches when the two paths disagree about the minute. The
 * type/time rule behind it is the fallback for an entry written before the
 * stamp existed, and is the same rule, to the same tolerance, that keeps the
 * import from offering a sample the journal already holds.
 */
export function filedFromSample(
  day: DayRecord | undefined, kind: ItemKind, key: string, type: string, time: string,
): Entry | undefined {
  const list = listFor(day, kind);
  return list.find((e) => typeof e.healthKey === 'string' && e.healthKey === key)
    ?? list.find((e) => sameItemType(kind, type, e.type) && near(e.time, time, tolFor(kind)));
}

/** How close counts as "the same thing", per kind. One table, so the journal
 *  check, the tombstone check and the build all hold a candidate to the same
 *  bar rather than repeating a ternary. */
const tolFor = (kind: ItemKind): number =>
  (kind === 'med' ? MED_NEAR_MIN : kind === 'symptom' ? SYMPTOM_NEAR_MIN : NEAR_MIN);

/**
 * The deleted imports recorded for `dk`, read back out of their fingerprints.
 *
 * A fingerprint is `fp:<dk>:<kind>:<type>:<HH:MM>`; the type may itself hold a
 * colon, the time never holds anything but its own, so the time is the tail.
 */
function declinedOn(dk: string, declined: ReadonlySet<string>): { kind: string; type: string; time: string }[] {
  const out: { kind: string; type: string; time: string }[] = [];
  const head = `fp:${dk}:`;
  for (const k of declined) {
    if (!k.startsWith(head)) continue;
    const rest = k.slice(head.length);
    const cut = rest.indexOf(':');
    if (cut < 0 || rest.length - cut < 7) continue;
    out.push({ kind: rest.slice(0, cut), type: rest.slice(cut + 1, -6), time: rest.slice(-5) });
  }
  return out;
}

/**
 * Drop items the user imported and then DELETED (./declined). The pill never
 * re-offers these; the Settings check skips this filter.
 *
 * A deleted import is a TOMBSTONE, and it dedups exactly the way the live entry
 * did: same type, within the same tolerance `buildUpdateSet` holds a candidate
 * to against the journal. Matching only the item key or the exact minute was
 * narrower than that, and the gap is the ordinary case rather than a corner:
 * one workout reaches a health store more than once (the watch's own record,
 * then Garmin Connect's or Strava's copy syncing in an hour later, starting a
 * minute or two either side), and a store that re-writes a session hands it
 * back under a new start instant. While the entry stood, the journal absorbed
 * every one of those; the moment it was deleted, the copy became "new" and was
 * imported straight back, which reads as the app arguing with the delete.
 */
export function filterDeclined(set: HealthUpdateSet, declined: ReadonlySet<string>): HealthUpdateSet {
  const stones = declinedOn(set.dk, declined);
  const gone = (key: string, kind: ItemKind, type: string, time: string) =>
    declined.has(key)
    || stones.some((d) => d.kind === kind && sameItemType(kind, d.type, type)
      && near(d.time, time, tolFor(kind)));
  return {
    dk: set.dk,
    sleep: set.sleep,
    readings: set.readings.filter((r) => !gone(r.key, 'reading', r.type, r.time)),
    workouts: set.workouts.filter((w) => !gone(w.key, 'workout', w.type, w.time)),
    meds: set.meds.filter((m) => !gone(m.key, 'med', m.type, m.time)),
    symptoms: set.symptoms.filter((y) => !gone(y.key, 'symptom', y.type, y.time)),
  };
}

/** An empty set for `dk` — the shape every filter returns when nothing survives. */
export const emptyUpdateSet = (dk: string): HealthUpdateSet =>
  ({ dk, sleep: null, readings: [], workouts: [], meds: [], symptoms: [] });

/**
 * Split a set into what the app will file on the user's behalf and what it
 * won't.
 *
 * The import pill writes as it finds — a health sample is a measurement that
 * already happened, and asking permission to record it made every one of them a
 * second decision. The exception is the same one capture makes: a reading the
 * app has DECLINED to file is offered instead, because the alternative is
 * recording a claim about somebody's body that nobody agreed to. `isPoorImport`
 * is that line (the `confidence` ladder's own 'fair' edge).
 *
 * TWO kinds of thing wait, for the same reason in two registers:
 *
 *  - a poor-quality HRV reading, because filing it records a claim about
 *    somebody's body that nobody agreed to; and
 *  - a dose whose medication the user has no TYPE for, because importing it
 *    creates one, and a silent foreground check must not reach into the type
 *    catalog on its own. An entry can be deleted from the receipt; a type the
 *    app minted while nobody was looking is a thing the user then has to find
 *    and tidy up.
 *
 * Sleep, workouts, symptoms and a dose that lands on an EXISTING type are filed
 * as found, like every other measurement that already happened.
 */
export type ReviewItem =
  | { kind: 'reading'; key: string; reading: UpdateReading }
  | { kind: 'med'; key: string; med: UpdateMed };

export function splitForReview(set: HealthUpdateSet): { auto: HealthUpdateSet; review: ReviewItem[] } {
  const poor = set.readings.filter((r) => isPoorImport(r.quality));
  const fresh = set.meds.filter((m) => m.create);
  if (!poor.length && !fresh.length) return { auto: set, review: [] };
  return {
    auto: {
      ...set,
      readings: set.readings.filter((r) => !isPoorImport(r.quality)),
      meds: set.meds.filter((m) => !m.create),
    },
    review: [
      ...poor.map((r): ReviewItem => ({ kind: 'reading', key: r.key, reading: r })),
      ...fresh.map((m): ReviewItem => ({ kind: 'med', key: m.key, med: m })),
    ],
  };
}

/** Stable id of a result set — lets the pill remember "already dismissed this
 *  exact batch" without suppressing genuinely new items on the next check. */
export function updateSignature(set: HealthUpdateSet): string {
  return [
    set.dk,
    set.sleep ? `sleep-${set.sleep.bed}-${set.sleep.wake}` : '',
    ...set.readings.map((r) => r.key),
    ...set.workouts.map((w) => w.key),
    ...set.meds.map((m) => m.key),
    ...set.symptoms.map((y) => y.key),
  ].join('|');
}

const toMin = (t: unknown): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t ?? ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const near = (a: unknown, b: unknown, tol: number): boolean => {
  const ma = toMin(a); const mb = toMin(b);
  return ma != null && mb != null && Math.abs(ma - mb) <= tol;
};

const rrTotalMs = (rr: number[] | undefined): number =>
  (rr || []).reduce((s, v) => s + v, 0);

/** What the raw platform reads hand `buildUpdateSet`. */
export interface RawHealthDay {
  imports: ImportedReading[];
  workouts: ImportedWorkout[];
  sleep: SleepImport | null;
  meds: ImportedMed[];
  symptoms?: ImportedSymptom[];
}

/** The type catalogs the build needs to name things: the user's own med and
 *  symptom types, resolved by the caller (`typesFor`), so a custom type is
 *  matched and labelled exactly like a built-in. */
export interface ImportTypes {
  meds: Record<string, TypeDef>;
  symptoms: Record<string, TypeDef>;
}

/** Filter a day's raw health-store reads down to what's actually importable. */
export function buildUpdateSet(
  dk: string,
  day: DayRecord | undefined,
  raw: RawHealthDay,
  types: ImportTypes,
): HealthUpdateSet {
  const readings = day?.readings || [];
  const activities = day?.activities || [];
  const meds = day?.meds || [];
  const symptoms = day?.symptoms || [];
  const medTypes = types.meds;

  const out: HealthUpdateSet = { dk, sleep: null, readings: [], workouts: [], meds: [], symptoms: [] };

  // Sleep — while the day has none, or to finish an imported night read early.
  out.sleep = sleepToFile(day?.sleep, raw.sleep);

  for (const im of raw.imports) {
    if (im.ownApp) continue;
    // The day already holds this exact sample. Every path that files one stamps
    // its key (`importUpdates` below, and the watch-sync / on-demand import
    // cards through features/hrv/Results), so the identity is exact — which is
    // what the time rules below cannot be: a reading the watch-sync card filed
    // and a reading the user then corrected the clock of are the same sample
    // whatever minute they now claim.
    if (readings.some((e) => e.healthKey === `${im.type}-${im.startMs}`)) continue;
    if (im.type === 'hrv') {
      // Only trustworthy HRV: real beat-to-beat RR spanning at least 4 minutes
      // (SDNN-only samples carry no series and are excluded outright).
      if (!im.rr || rrTotalMs(im.rr) < HRV_MIN_MS) continue;
      if (readings.some((e) => (e.type === 'hrv' || e.type === 'breathHrv') && near(e.time, im.time, NEAR_MIN))) continue;
      if (out.readings.some((r) => r.type === 'hrv' && near(r.time, im.time, NEAR_MIN))) continue;
      const ms = im.fields.sdnn ?? im.fields.rmssd;
      out.readings.push({
        key: `hrv-${im.startMs}`, type: 'hrv', time: im.time,
        title: ms != null ? `HRV ${ms} ms` : 'HRV reading',
        sub: `${fmtTime12(im.time)} · ${Math.round(rrTotalMs(im.rr) / 60000)} min`,
        fields: im.fields, rr: im.rr, segmentStarts: im.segmentStarts, seamGapsMs: im.seamGapsMs,
        startMs: im.startMs, quality: im.quality,
      });
    } else if (im.type === 'restingHr') {
      // Apple's resting HR is ~one derived sample a day; a same-value or
      // same-moment entry already in the journal makes it a dupe.
      if (readings.some((e) => e.type === 'restingHr' && (String(e.hr) === im.fields.hr || near(e.time, im.time, NEAR_MIN)))) continue;
      if (out.readings.some((r) => r.type === 'restingHr' && (r.fields.hr === im.fields.hr || near(r.time, im.time, NEAR_MIN)))) continue;
      out.readings.push({
        key: `restingHr-${im.startMs}`, type: 'restingHr', time: im.time,
        title: `Resting HR ${im.fields.hr} bpm`, sub: fmtTime12(im.time),
        fields: { hr: im.fields.hr, position: im.fields.position || 'Laying' },
      });
    } else if (im.type === 'bp') {
      if (readings.some((e) => e.type === 'bp'
        && ((String(e.sys) === im.fields.sys && String(e.dia) === im.fields.dia) || near(e.time, im.time, NEAR_MIN)))) continue;
      if (out.readings.some((r) => r.type === 'bp'
        && ((r.fields.sys === im.fields.sys && r.fields.dia === im.fields.dia) || near(r.time, im.time, NEAR_MIN)))) continue;
      out.readings.push({
        key: `bp-${im.startMs}`, type: 'bp', time: im.time,
        title: `${im.fields.sys}/${im.fields.dia}`, sub: fmtTime12(im.time),
        fields: { sys: im.fields.sys, dia: im.fields.dia },
      });
    }
  }
  out.readings.sort((a, b) => a.time.localeCompare(b.time));

  for (const w of raw.workouts) {
    // Never re-offer this app's own sessions (watch stand tests, published
    // captures) or a workout already logged at the same time.
    if (w.ownApp) continue;
    if (activities.some((e) => e.type === w.type && near(e.time, w.time, NEAR_MIN))) continue;
    if (out.workouts.some((c) => c.type === w.type && near(c.time, w.time, NEAR_MIN))) continue;
    out.workouts.push(workoutCandidateOf(w));
  }

  // Medications. A dose is matched to one of the user's own med types through
  // the canonical-name rules in ./medications (brand↔generic, strength and dose
  // form ignored) rather than by an exact label, which matched almost nothing.
  // A dose that still matches nothing is offered WITH a type to create: the
  // user's Health list is the authority on what they take, and the only other
  // options were to drop it silently or to guess at a near-enough type.
  const medLabels = Object.fromEntries(Object.keys(medTypes).map((k) => [k, medTypes[k].label]));
  for (const m of raw.meds) {
    if (m.ownApp) continue;
    const existing = matchMedType(m.name, medLabels);
    const label = existing ? medTypes[existing].label : medTypeLabel(m);
    if (!label.trim()) continue;      // a nameless dose can never be filed
    const key = existing ?? `custom-${slugify(label)}`;
    if (meds.some((e) => e.type === key && near(e.time, m.time, MED_NEAR_MIN))) continue;
    if (out.meds.some((c) => c.type === key && near(c.time, m.time, MED_NEAR_MIN))) continue;
    out.meds.push({
      // The item key is the SAMPLE's identity, not the type's: a dose offered
      // under a type to create and then imported must dedup against the same
      // key on the next check, whatever the catalog minted.
      key: `med-${m.startMs}-${slugify(label)}`,
      type: key,
      time: m.time,
      title: label,
      // Just the facts of the dose. That it would create a type is the CHIP's
      // job in both surfaces that render this (features/HealthUpdates), so the
      // sub-line does not say it a second time.
      sub: [m.amount, fmtTime12(m.time)].filter(Boolean).join(' · '),
      amount: m.amount,
      ...(existing ? {} : { create: { label } }),
    });
  }
  out.meds.sort((a, b) => a.time.localeCompare(b.time));

  // Symptoms. Already mapped to journal type keys by the reader, so a type the
  // catalog does not hold (a built-in the user DELETED) is dropped here rather
  // than resurrected behind their back.
  for (const y of raw.symptoms || []) {
    if (y.ownApp) continue;           // our own cycle-symptom write-backs
    const def = types.symptoms[y.type];
    if (!def) continue;
    if (symptoms.some((e) => e.type === y.type && near(e.time, y.time, SYMPTOM_NEAR_MIN))) continue;
    if (out.symptoms.some((c) => c.type === y.type && near(c.time, y.time, SYMPTOM_NEAR_MIN))) continue;
    out.symptoms.push({
      key: `sym-${y.type}-${y.startMs}`, type: y.type, time: y.time,
      title: def.label,
      sub: [y.severity || null, fmtTime12(y.time)].filter(Boolean).join(' · '),
      severity: y.severity,
    });
  }
  out.symptoms.sort((a, b) => a.time.localeCompare(b.time));

  return out;
}
