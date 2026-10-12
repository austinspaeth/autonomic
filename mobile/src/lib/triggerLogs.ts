/**
 * A logged trigger's own time and note.
 *
 * `food.triggers` stays what it always was, a map of trigger type to count, and
 * stays the only thing scoring, Insights, Progress and the reports read: a
 * trigger is present on a day or it is not. A `TriggerLog` is an annotation
 * over that map, one per trigger logged, holding when and a note (`types` is a
 * list because a log can name several). Nothing here may let the two disagree: a type listed in a
 * log is always present in the map, and removing the last log that holds a
 * type removes it from the map too.
 *
 * Triggers logged before logs existed sit in the map and in no log. They are
 * `ungroupedTriggers`, and the Journal lists them the way it always did.
 */
import { uid } from './dates';
import type { FoodRecord, TriggerLog } from './types';

/** One log per trigger, so each is its own row in the Journal; the time (and
 *  later the note) they were logged with is shared. */
export function logTriggers(food: FoodRecord, types: string[], time: string): TriggerLog[] {
  const logs = types.map((t): TriggerLog => ({ id: uid(), time, note: '', types: [t] }));
  types.forEach((t) => { food.triggers[t] = Math.max(1, food.triggers[t] || 0); });
  food.triggerLogs = [...(food.triggerLogs || []), ...logs];
  return logs;
}

/** Drops the group, and every trigger no other group on the day still holds. */
export function removeTriggerLog(food: FoodRecord, id: string): void {
  const logs = food.triggerLogs || [];
  const gone = logs.find((l) => l.id === id);
  if (!gone) return;
  const rest = logs.filter((l) => l.id !== id);
  const held = new Set(rest.flatMap((l) => l.types));
  gone.types.forEach((t) => { if (!held.has(t)) delete food.triggers[t]; });
  if (rest.length) food.triggerLogs = rest;
  else delete food.triggerLogs;
}

/** Present on the day but in no group: logged before groups existed. */
export function ungroupedTriggers(food: FoodRecord | undefined): string[] {
  if (!food) return [];
  const held = new Set((food.triggerLogs || []).flatMap((l) => l.types));
  return Object.keys(food.triggers || {}).filter((k) => food.triggers[k] > 0 && !held.has(k));
}

/** Groups in the order they happened; an untimed group sorts first, as an
 *  untimed entry does everywhere else in the Journal. */
export function sortedTriggerLogs(food: FoodRecord | undefined): TriggerLog[] {
  return [...(food?.triggerLogs || [])].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
}
