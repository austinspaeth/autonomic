/* Is today on track? A day still filling cannot be held up to a finished one,
 * so every other day is cut off at the same clock time first. Pure.
 *
 * A day that carries hourly counts is cut exactly. One that does not (it
 * predates the counter) is placed by the usual SHAPE of a day, pooled from
 * the days that do; with none of those either, a day is assumed to fill
 * evenly, which is the weakest reading and is reported as such (`shape`).
 *
 * Curves are running totals at the 25 hour boundaries, midnight to midnight
 * US Eastern, the same day the counters are bucketed by.
 */
export type PaceDay = { total: number; hours: number[] | null };

export type PaceStatus = 'ahead' | 'on' | 'behind' | 'early';

export type PaceRef = {
  /** Where that day (or the average of those days) stood at this clock time. */
  byNow: number;
  /** Where it finished. */
  total: number;
  /** Every day behind it was cut by its own hourly counts, not by the shape. */
  exact: boolean;
  days: number;
  curve: number[];
};

export type PaceModel = {
  /** Hours into the Eastern day the count was read at. */
  clock: number;
  now: number;
  status: PaceStatus;
  /** Where today lands if the rest of it follows the usual shape. Null while too little of the day has gone by. */
  projected: number | null;
  /** How un-hourly days were placed: by a measured shape, or assumed even. */
  shape: 'measured' | 'even';
  yesterday: PaceRef | null;
  average: PaceRef | null;
  /** Today's own running total at each whole hour so far, when it carries hours. */
  today: number[] | null;
  /** The dashed tail: from now to midnight, `[hour, value]`. */
  tail: [number, number][];
};

/* Under this much of a usual day gone, a projection is one early riser away
   from doubling, so none is made. */
const MIN_SHARE = 0.15;
/* Inside this band (or inside one whole count) the day is simply on track. */
const BAND = 0.05;

const cumulative = (hours: number[]) => {
  const out = [0];
  for (let i = 0; i < 24; i++) out.push(out[i] + (hours[i] || 0));
  return out;
};

/** A curve read at a fractional hour. */
export function valueAt(curve: number[], clock: number): number {
  const c = Math.max(0, Math.min(24, clock));
  const i = Math.min(23, Math.floor(c));
  return curve[i] + (curve[i + 1] - curve[i]) * (c - i);
}

/** The usual share of a day in by each hour, pooled over the days with hours. */
export function shapeOf(days: PaceDay[]): { curve: number[]; measured: boolean } {
  const pooled = new Array<number>(24).fill(0);
  let any = false;
  days.forEach((d) => {
    if (!d.hours) return;
    any = true;
    d.hours.forEach((n, i) => (pooled[i] += n));
  });
  const sum = pooled.reduce((a, b) => a + b, 0);
  if (!any || !sum) return { curve: Array.from({ length: 25 }, (_, i) => i / 24), measured: false };
  return { curve: cumulative(pooled).map((v) => v / sum), measured: true };
}

function curveOf(d: PaceDay, shape: number[]): number[] {
  if (!d.hours) return shape.map((s) => s * d.total);
  const c = cumulative(d.hours);
  const end = c[24] || 1;
  // Scaled to the day's own total, so a stray uncounted open cannot bend it.
  return c.map((v) => (v / end) * d.total);
}

function refOf(days: PaceDay[], shape: number[], clock: number): PaceRef | null {
  if (!days.length) return null;
  const curve = new Array<number>(25).fill(0);
  days.forEach((d) => curveOf(d, shape).forEach((v, i) => (curve[i] += v / days.length)));
  return { byNow: valueAt(curve, clock), total: curve[24], exact: days.every((d) => !!d.hours), days: days.length, curve };
}

export function buildPace({
  now,
  clock,
  today,
  yesterday,
  range,
  history,
}: {
  now: number;
  clock: number;
  /** Today's own hours, if it has them. */
  today: number[] | null;
  yesterday: PaceDay | null;
  /** The finished days of the range (today left out). */
  range: PaceDay[];
  /** Recent finished days to learn the shape of a day from. */
  history: PaceDay[];
}): PaceModel | null {
  const { curve: shape, measured } = shapeOf(history);
  const y = yesterday ? refOf([yesterday], shape, clock) : null;
  const avg = refOf(range, shape, clock);
  const against = avg ?? y;
  if (!against) return null;

  const share = valueAt(shape, clock);
  const projected = share >= MIN_SHARE ? Math.max(now, now / share) : null;
  const gap = now - against.byNow;
  const status: PaceStatus =
    projected === null ? 'early' : Math.abs(gap) < Math.max(1, against.byNow * BAND) ? 'on' : gap > 0 ? 'ahead' : 'behind';

  const tail: [number, number][] = [];
  if (projected !== null && clock < 24) {
    const left = 1 - share;
    tail.push([clock, now]);
    for (let h = Math.floor(clock) + 1; h <= 24; h++) tail.push([h, left > 0 ? now + (projected - now) * ((shape[h] - share) / left) : now]);
  }

  let mine: number[] | null = null;
  if (today) {
    const c = cumulative(today);
    mine = c.slice(0, Math.min(24, Math.floor(clock)) + 1).map((v) => Math.min(v, now));
  }

  return { clock, now, status, projected, shape: measured ? 'measured' : 'even', yesterday: y, average: avg, today: mine, tail };
}
