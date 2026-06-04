// Pure chart math ported verbatim from legacy docs/index.html (~lines 3294-3320):
// niceNum, niceScale, and smoothPath (Catmull-Rom -> cubic bezier SVG path).
// No numeric thresholds or branches changed. smoothPath retyped to take
// { x, y } points instead of legacy [x, y] tuples.

export interface NiceScale {
  min: number;
  max: number;
  step: number;
}

export interface Point {
  x: number;
  y: number;
}

// "Nice" axis numbers so the y-range extends out to round bounds with ticks.
export const niceNum = (x: number, round: boolean): number => {
  if (x <= 0) return 1;
  const exp = Math.floor(Math.log10(x));
  const f = x / Math.pow(10, exp);
  const nf = round
    ? f < 1.5
      ? 1
      : f < 3
        ? 2
        : f < 7
          ? 5
          : 10
    : f <= 1
      ? 1
      : f <= 2
        ? 2
        : f <= 5
          ? 5
          : 10;
  return nf * Math.pow(10, exp);
};

export function niceScale(dataMin: number, dataMax: number, ticks: number): NiceScale {
  let min = dataMin,
    max = dataMax;
  if (min === max) {
    const d = Math.abs(min) || 1;
    min -= d;
    max += d;
  }
  const pad = (max - min) * 0.5;
  min -= pad;
  max += pad; // extend the range out
  const step = niceNum(niceNum(max - min, false) / (ticks - 1), true);
  return { min: Math.floor(min / step) * step, max: Math.ceil(max / step) * step, step };
}

// Smooth (curved) path through points via Catmull-Rom -> cubic beziers.
export function smoothPath(pts: Point[]): string {
  if (pts.length < 2) return '';
  let d = `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  const t = 0.16;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i],
      p1 = pts[i],
      p2 = pts[i + 1],
      p3 = pts[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) * t,
      c1y = p1.y + (p2.y - p0.y) * t;
    const c2x = p2.x - (p3.x - p1.x) * t,
      c2y = p2.y - (p3.y - p1.y) * t;
    d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}
