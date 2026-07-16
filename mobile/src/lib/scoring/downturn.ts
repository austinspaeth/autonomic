/**
 * Downturn detection for the Autonomic Outlook card. Scores the trailing week
 * of days and flags a clear worsening trend: a sustained fall from the recent
 * baseline, several consecutive declining days, or one sharp drop. When the
 * journal explains the slide (triggers logged, heavy activity, short sleep, a
 * slipped protocol) the flag names that cause; when the logs are clean it
 * warns the drop may be stress or oncoming sickness — the autonomic system
 * often shifts before symptoms do. Pure: days map in, verdict out.
 */
import { addDays, dateFromKey } from '../dates';
import { TRIGGER_TYPES } from '../registry';
import type { CustomTypes, Protocol } from '../types';
import type { ScoreContext } from './index';
import {
  DEFAULT_PROTOCOL, activityGrade, dayCleanliness, scoreSet, sleepHours,
  type DaysMap,
} from './day';

export type DownturnCause = 'triggers' | 'exertion' | 'sleep' | 'protocol' | 'unexplained';

/** One journal finding that could be driving the slide, for the detail sheet. */
export interface DownturnFactor { label: string; value: string; detail: string }

export interface Downturn {
  severity: 'watch' | 'alert';
  /** Points fallen from the recent baseline to today's score. */
  drop: number;
  /** Calendar days the slide covers (for "over the last N days" copy). */
  spanDays: number;
  cause: DownturnCause;
  title: string;
  body: string;
  /** Everything found in the slide window, most likely driver first. */
  factors: DownturnFactor[];
}

const WINDOW = 8; // days examined, ending at dk
const MIN_SCORED = 4; // scored days required before a trend is trusted
const CEILING = 75; // no warning while today still scores comfortably Good

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

export function detectDownturn(
  days: DaysMap,
  dk: string,
  ctx: ScoreContext = {},
  protocol: Protocol = DEFAULT_PROTOCOL,
  custom?: CustomTypes,
): Downturn | null {
  const scored: { k: string; s: number }[] = [];
  for (let i = WINDOW - 1; i >= 0; i--) {
    const k = addDays(dk, -i);
    const d = days[k];
    if (!d) continue;
    const rs = (d.readings || []).slice().sort((a, b) => ((a.time as string) || '').localeCompare((b.time as string) || ''));
    const { score } = scoreSet(rs, d, k, days, ctx);
    if (score != null) scored.push({ k, s: score });
  }
  const n = scored.length;
  if (n < MIN_SCORED || scored[n - 1].k !== dk) return null;

  const today = scored[n - 1].s;
  if (today >= CEILING) return null;

  const baseline = mean(scored.slice(0, -2).map((x) => x.s));
  const recent = mean(scored.slice(-2).map((x) => x.s));

  // Consecutive declining steps ending today (a 1-pt wobble doesn't count).
  let slide = 0;
  while (slide < n - 1 && scored[n - 2 - slide].s > scored[n - 1 - slide].s + 1) slide++;
  const slideFall = slide ? scored[n - 1 - slide].s - today : 0;

  const sustained = baseline - recent >= 12 && today <= baseline - 8;
  const stepped = slide >= 2 && slideFall >= 15;
  const sharp = today <= baseline - 20;
  if (!sustained && !stepped && !sharp) return null;

  const drop = Math.round(baseline - today);
  const startIdx = Math.max(0, n - 4);
  const spanDays = Math.max(2, Math.round((dateFromKey(dk).getTime() - dateFromKey(scored[startIdx].k).getTime()) / 86400000));

  // What does the journal say about the slide window? Triggers and heavy
  // activity are attributed directly; a protocol slip only counts when the
  // user actually engaged with that criterion (water logged but short, sleep
  // logged but short, a required med/activity missed) so a day simply not
  // tracked doesn't read as a broken protocol.
  let trigN = 0, slipDays = 0, shortNights = 0, heavy = 0, heavyDays = 0, windowLen = 0;
  const trigCounts: Record<string, number> = {};
  const misses: Record<string, { label: string; key: string; days: number }> = {};
  for (let k = scored[startIdx].k; k <= dk; k = addDays(k, 1)) {
    const d = days[k];
    if (!d) continue;
    windowLen++;
    const t = (d.food && d.food.triggers) || {};
    Object.keys(t).forEach((key) => {
      if (t[key] > 0) { trigN += t[key]; trigCounts[key] = (trigCounts[key] || 0) + t[key]; }
    });
    const g = activityGrade(d.activities);
    if (g === 'bad' || g === 'ok') heavyDays++;
    if (g === 'bad') heavy += 2;
    else if (g === 'ok') heavy++;
    const hrs = sleepHours(days, k);
    if ((hrs != null && hrs < 6) || (d.sleep && d.sleep.quality === 'interrupted')) shortNights++;
    const c = dayCleanliness(days, k, protocol, custom);
    const slipped = c ? c.criteria.filter((x) => {
      if (x.pass || x.pending) return false;
      if (x.key === 'triggers') return false; // attributed via trigN above
      if (x.key === 'water') return ((d.food && d.food.water) || 0) > 0;
      if (x.key === 'sleep') return !!x.broken;
      return true; // required meds/activities the user explicitly chose
    }) : [];
    if (slipped.length) slipDays++;
    slipped.forEach((x) => {
      const m = misses[x.key] || (misses[x.key] = { label: x.label, key: x.key, days: 0 });
      m.days++;
    });
  }

  const cause: DownturnCause =
    trigN > 0 ? 'triggers'
    : heavy >= 2 ? 'exertion'
    : shortNights >= Math.min(2, windowLen) ? 'sleep'
    : slipDays >= 2 ? 'protocol'
    : 'unexplained';

  const severity: Downturn['severity'] = today < 45 || drop >= 25 ? 'alert' : 'watch';

  const BODY: Record<DownturnCause, string> = {
    triggers: `${trigN} trigger${trigN === 1 ? '' : 's'} logged in this stretch may be driving it. Cut them out and give your system room to recover.`,
    exertion: 'Activity has run heavy through the slide. This pattern often comes before a post-exertional crash, so scale back and rest.',
    sleep: 'Sleep ran short or interrupted on these nights. An earlier, longer night is the fastest way to turn this around.',
    protocol: `Your protocol slipped on ${slipDays} of these days. Getting back to basics usually turns the trend around.`,
    unexplained: 'No triggers logged and your protocol is on track, so this may be stress or sickness building. Your autonomic system can signal illness before symptoms start. Take it easy and rest.',
  };
  const title = cause === 'unexplained'
    ? (severity === 'alert' ? 'You may be crashing or getting sick' : 'Something looks off')
    : (severity === 'alert' ? 'Heading toward a crash' : 'Trending down');

  // Everything found in the window, ordered by how likely it is the driver
  // (mirrors the cause priority above). Empty when the journal is clean.
  const factors: DownturnFactor[] = [];
  Object.keys(trigCounts).sort((a, b) => trigCounts[b] - trigCounts[a]).forEach((t) => {
    const label = custom?.triggers?.[t]?.label || TRIGGER_TYPES[t]?.label || t;
    factors.push({
      label, value: `${trigCounts[t]}×`,
      detail: `Logged ${trigCounts[t] === 1 ? 'once' : `${trigCounts[t]} times`} in this stretch. Known triggers are the most common driver of a slide like this.`,
    });
  });
  if (heavyDays) factors.push({
    label: 'Heavy activity', value: `${heavyDays} day${heavyDays === 1 ? '' : 's'}`,
    detail: 'Activity ran heavy in this stretch. Pushing through a slide often ends in a post-exertional setback, so scale back.',
  });
  if (shortNights && !misses.sleep) factors.push({
    label: 'Sleep', value: `${shortNights} night${shortNights === 1 ? '' : 's'}`,
    detail: 'Short or interrupted sleep in this stretch. An earlier, longer night is the fastest lever to turn the trend around.',
  });
  Object.keys(misses).forEach((k) => {
    const m = misses[k];
    const what = k === 'water' ? 'Came up short' : k === 'sleep' ? 'Below your protocol target' : k.startsWith('meds:') ? 'Not taken' : 'Not done';
    factors.push({
      label: m.label, value: `${m.days} day${m.days === 1 ? '' : 's'}`,
      detail: `${what} on ${m.days} of the last ${spanDays} days. Part of your protocol, and slipping it costs recovery capacity.`,
    });
  });

  return { severity, drop, spanDays, cause, title, body: BODY[cause], factors };
}
