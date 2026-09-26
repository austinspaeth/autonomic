/**
 * Days holding something the user entered themselves.
 *
 * Imported entries don't count: connecting Health back-fills a year in one tap,
 * and that says nothing about whether the app has been useful to them. Sleep is
 * ignored outright — a night carries no provenance flag, so there's no way to
 * tell a hand-typed bedtime from an imported one, and undercounting is the safe
 * direction here.
 *
 * Its own module because two different questions share it: the review gate
 * (./review/eligibility, "has this person used the app") and ./digestion ("was
 * this person keeping the journal on a day they logged no bowel movement"), and
 * the second is imported by ./scoring/strain, which the first imports.
 *
 * Pure: no store, no native, no React.
 */
import type { DayRecord, Entry } from './types';

const own = (list: Entry[] | undefined): boolean => (list || []).some((e) => !e.imported);

export function isEngagedDay(d: DayRecord | undefined): boolean {
  if (!d) return false;
  if (own(d.readings) || own(d.activities) || own(d.meds) || own(d.symptoms)) return true;
  if ((d.digestion?.movements || []).length) return true;
  if ((d.food?.meals || []).length) return true;
  if (d.food && +d.food.water > 0) return true;
  if (d.food?.triggers && Object.values(d.food.triggers).some((n) => n > 0)) return true;
  if (d.notes && d.notes.trim()) return true;
  return false;
}

export function engagedDayCount(days: Record<string, DayRecord>): number {
  return Object.keys(days).filter((k) => isEngagedDay(days[k])).length;
}
