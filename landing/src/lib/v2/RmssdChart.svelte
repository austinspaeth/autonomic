<!-- The "Are you actually getting better?" chart, in the app's Progress grammar
     (components/charts.tsx LineChart): morning RMSSD graded through its own
     breakpoints (BANDS.rmssdU in lib/scoring: 17 / 22 / 27 / 34 ms, coloured
     with GRADE_COLORS), so the line and every dot wear the band they sit in;
     each breakpoint drawn as a dashed line with its ms value, the way "Show
     zones" draws them; and a dashed grey rolling average. Light, to sit on the
     site's white board. -->
<script lang="ts">
  export let values: number[];
  export let labels: string[];
  export let id: string;

  // rmssdU, low to high: crash (Bad) ≤17, bad (Compromised) ≤22, ok ≤27, good ≤34, great.
  const BANDS = [
    { to: 17, c: '#ef4444' }, { to: 22, c: '#f97316' }, { to: 27, c: '#eab308' }, { to: 34, c: '#16a34a' }, { to: Infinity, c: '#2ee06a' },
  ];
  const colAt = (v: number) => BANDS.find((b) => v <= b.to)!.c;

  const W = 600, H = 230, padL = 34, padR = 34, padT = 12, padB = 26;
  const WIN = 3;
  $: roll = values.map((_, i) => { const w = values.slice(Math.max(0, i - WIN + 1), i + 1); return w.reduce((a, b) => a + b, 0) / w.length; });
  $: lo = Math.min(...values, 15) - 1;
  $: hi = Math.max(...values, 30) + 2;
  $: n = values.length;
  $: xAt = (i: number) => padL + (n <= 1 ? 0 : (i / (n - 1)) * (W - padL - padR));
  $: yAt = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
  // smoothPath (charts.tsx), tension 0.16.
  const smooth = (pts: [number, number][]) => {
    let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      d += ` C${(p1[0] + (p2[0] - p0[0]) * 0.16).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) * 0.16).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) * 0.16).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) * 0.16).toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }
    return d;
  };
  $: pts = values.map((v, i) => [xAt(i), yAt(v)] as [number, number]);
  $: rollPts = roll.map((v, i) => [xAt(i), yAt(v)] as [number, number]);
  // The line's gradient: hard stops at each breakpoint inside the visible range.
  $: offAt = (v: number) => Math.max(0, Math.min(1, (yAt(v) - padT) / (H - padT - padB)));
  $: stops = (() => {
    const out: { o: number; c: string }[] = [{ o: 0, c: colAt(hi) }];
    BANDS.map((b) => b.to).filter((v) => isFinite(v) && v > lo && v < hi).sort((a, b) => b - a)
      .forEach((v) => { out.push({ o: offAt(v), c: colAt(v + 0.01) }, { o: offAt(v), c: colAt(v) }); });
    out.push({ o: 1, c: colAt(lo) });
    return out;
  })();
  $: zones = BANDS.filter((b) => isFinite(b.to) && b.to > lo && b.to < hi);
  $: step = Math.max(1, Math.ceil(n / 6));
</script>

<svg class="v2-rchart" viewBox="0 0 {W} {H}" role="img" aria-label="Sample chart of morning RMSSD, graded by its breakpoints, rising over time">
  <defs>
    <linearGradient id="rg{id}" x1="0" y1={padT} x2="0" y2={H - padB} gradientUnits="userSpaceOnUse">
      {#each stops as s}<stop offset={s.o} stop-color={s.c} />{/each}
    </linearGradient>
  </defs>
  {#each zones as z}
    <line x1={padL} x2={W - padR} y1={yAt(z.to)} y2={yAt(z.to)} stroke={colAt(z.to)} stroke-width="1.2" stroke-dasharray="4 4" opacity=".7" />
    <text x={W - padR + 6} y={yAt(z.to) + 4} font-size="11" font-weight="700" fill={colAt(z.to)}>{z.to}</text>
  {/each}
  <text x={padL - 8} y={yAt(hi) + 10} text-anchor="end" font-size="11" class="ax">{Math.round(hi)}</text>
  <text x={padL - 8} y={yAt(lo)} text-anchor="end" font-size="11" class="ax">{Math.round(lo)}</text>
  <path d={smooth(rollPts)} fill="none" stroke="#a69eaa" stroke-width="2.2" stroke-dasharray="6 5" stroke-linecap="round" />
  <path d={smooth(pts)} fill="none" stroke="url(#rg{id})" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round" />
  {#each pts as p, i}<circle cx={p[0]} cy={p[1]} r="4" fill={colAt(values[i])} stroke="#fff" stroke-width="1.5" />{/each}
  {#each labels as l, i}
    {#if i % step === 0 || i === n - 1}<text x={xAt(i)} y={H - 6} text-anchor="middle" font-size="11" class="ax">{l}</text>{/if}
  {/each}
</svg>
