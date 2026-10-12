/* Is today on track? A day still filling cannot be held up to a finished one,
 * so every other day is cut off at the same clock time first. Pure.
 *
 * A day that carries hourly counts is cut exactly. One that does not (it
 * predates the counter) is placed by the usual SHAPE of a day. A day is never
 * assumed to fill evenly: nothing here arrives at a steady rate, and a
 * straight line calls every morning ahead and every evening behind. The shape
 * starts as a typical one (`TYPICAL_DAY`) and each day that carries hours
 * pulls it toward what was measured, so within a week it is the app's own;
 * how many days are behind it is reported (`shapeDays`).
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
  /** How many measured days are behind the shape of a day. None: it is the typical one. */
  shapeDays: number;
  yesterday: PaceRef | null;
  average: PaceRef | null;
  /** Today's own running total at each whole hour so far, when it carries hours. */
  today: number[] | null;
  /** The hour today's own counts begin at. Before it, today's line is placed by the usual shape. 0: all of it is measured. */
  todayFrom: number;
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

/* How a day usually fills, hour by hour US Eastern, before there is anything
   measured to say so. Relative weights, not counts.

   `all` is each install's FIRST open of the Eastern day: a burst just after
   midnight (the west coast's evening lands on the new day), a dead stretch
   before dawn, most of the day in by late morning, a slow afternoon and a
   small evening rise. `fresh` is installs, which follow browsing rather than
   a morning routine: later to start, a second peak in the evening, and a
   real fall after ten. */
export const TYPICAL_DAY: { all: number[]; fresh: number[] } = {
  all: [5, 3, 2, 1.2, 1.2, 2.5, 5, 7.5, 8.5, 8, 7, 6, 5.5, 4.5, 4, 3.8, 4, 4.5, 4.5, 4, 3.2, 2.5, 1.6, 1],
  fresh: [2.5, 1.5, 1, 0.8, 0.8, 1.2, 2.5, 4, 5.5, 6.5, 6.5, 6, 5.5, 4.8, 4.3, 4.2, 4.6, 5.5, 6, 6.2, 6, 5.2, 4, 3],
};

/* The typical shape counts as this many measured days, so one odd day cannot
   become the shape on its own and a week of real ones all but replaces it. */
const PRIOR_DAYS = 2;

const unit = (hours: number[]) => {
  const sum = hours.reduce((a, b) => a + b, 0);
  return hours.map((n) => (sum ? n / sum : 1 / 24));
};

/** The usual share of a day in by each hour: the typical shape, pulled toward
 *  the days that carry hours. Each day counts once, however busy it was. */
export function shapeOf(days: PaceDay[], prior: number[] = TYPICAL_DAY.all): { curve: number[]; days: number } {
  const mix = unit(prior).map((v) => v * PRIOR_DAYS);
  let n = 0;
  days.forEach((d) => {
    // A part-counted day is all evening and would teach the wrong shape.
    if (!d.hours || !d.total || measuredFrom(d.hours, d.total) !== 0) return;
    n++;
    unit(d.hours).forEach((v, i) => (mix[i] += v));
  });
  return { curve: cumulative(mix).map((v) => v / (PRIOR_DAYS + n)), days: n };
}

const sumOf = (hours: number[]) => hours.reduce((a, b) => a + b, 0);

/** The hour a day's own counts begin at: 0 when they account for all of it,
 *  later on the day the counter was switched on part way through. */
export function measuredFrom(hours: number[], total: number): number {
  if (sumOf(hours) >= total * 0.98) return 0;
  const first = hours.findIndex((v) => v > 0);
  return first < 0 ? 24 : first;
}

/* A day's running total. Where its hours stop short of its total, the
   counter came on part way through the day: what it missed all arrived
   before the first counted hour, and is laid over those hours by the usual
   shape. From that hour on the curve is the day's own. */
function curveOf(d: PaceDay, shape: number[], upTo = 24): number[] {
  if (!d.hours) return shape.map((s) => s * d.total);
  const from = Math.min(measuredFrom(d.hours, d.total), Math.ceil(upTo));
  const seen = sumOf(d.hours);
  if (!from) {
    // Scaled to the day's own total, so a stray uncounted open cannot bend it.
    return cumulative(d.hours).map((v) => (v / (seen || 1)) * d.total);
  }
  const missed = Math.max(0, d.total - seen);
  const span = shape[from] || 1;
  const hours = d.hours.map((v, i) => (i < from ? v + (missed * (shape[i + 1] - shape[i])) / span : v));
  return cumulative(hours);
}

function refOf(days: PaceDay[], shape: number[], clock: number): PaceRef | null {
  if (!days.length) return null;
  const curve = new Array<number>(25).fill(0);
  days.forEach((d) => curveOf(d, shape).forEach((v, i) => (curve[i] += v / days.length)));
  return { byNow: valueAt(curve, clock), total: curve[24], exact: days.every((d) => !!d.hours && measuredFrom(d.hours, d.total) === 0), days: days.length, curve };
}

export function buildPace({
  now,
  clock,
  today,
  yesterday,
  range,
  history,
  prior,
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
  /** The shape of a day before any is measured (`TYPICAL_DAY`). */
  prior?: number[];
}): PaceModel | null {
  const { curve: shape, days: shapeDays } = shapeOf(history, prior);
  const y = yesterday ? refOf([yesterday], shape, clock) : null;
  const avg = refOf(range, shape, clock);
  const against = avg ?? y;
  if (!against) return null;

  /* Two readings of where the day ends. Scaling up what is in so far by the
     share of a day usually in by now is exact late on and wild early (three
     installs by 9am is not "on pace for 30"). Adding what a usual day still
     has to come is steady early and deaf to a day that is running hot. So
     each is trusted by how much of the day is behind it. */
  const share = valueAt(shape, clock);
  const usual = history.length ? history.reduce((a, d) => a + d.total, 0) / history.length : against.total;
  const scaled = share > 0 ? now / share : now;
  const added = now + usual * (1 - share);
  const projected = share >= MIN_SHARE ? Math.max(now, share * scaled + (1 - share) * added) : null;
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
  let todayFrom = 0;
  if (today) {
    todayFrom = Math.min(measuredFrom(today, now), Math.floor(clock));
    mine = curveOf({ total: now, hours: today }, shape, clock)
      .slice(0, Math.min(24, Math.floor(clock)) + 1)
      .map((v) => Math.min(v, now));
  }

  return { clock, now, status, projected, shapeDays, yesterday: y, average: avg, today: mine, todayFrom, tail };
}

/** An SVG path through the points as a smooth curve that never overshoots
 *  them (monotone cubic), so a running total drawn with it cannot dip. Points
 *  are pixels, left to right. */
export function smoothPath(points: [number, number][]): string {
  const pts: [number, number][] = [];
  points.forEach((p) => {
    // Two points on one x: the later one is the reading that stands.
    if (pts.length && p[0] - pts[pts.length - 1][0] < 0.01) pts[pts.length - 1] = p;
    else pts.push(p);
  });
  const n = pts.length;
  const f = (v: number) => v.toFixed(1);
  if (!n) return '';
  if (n < 3) return pts.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x)},${f(y)}`).join('');
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1][0] - pts[i][0]);
    slope.push((pts[i + 1][1] - pts[i][1]) / dx[i]);
  }
  const m = [slope[0]];
  for (let i = 1; i < n - 1; i++) {
    if (slope[i - 1] * slope[i] <= 0) m.push(0);
    else {
      const a = 2 * dx[i] + dx[i - 1];
      const b = dx[i] + 2 * dx[i - 1];
      m.push((a + b) / (a / slope[i - 1] + b / slope[i]));
    }
  }
  m.push(slope[n - 2]);
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const t = dx[i] / 3;
    d += `C${f(x0 + t)},${f(y0 + m[i] * t)} ${f(x1 - t)},${f(y1 - m[i + 1] * t)} ${f(x1)},${f(y1)}`;
  }
  return d;
}
