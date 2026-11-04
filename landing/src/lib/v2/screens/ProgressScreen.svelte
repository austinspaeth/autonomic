<!-- Drawn: the Progress tab on the Week range, led by the Autonomic Outlook card
     and the Clean Days card. Sample data: nine weekly buckets that climb from a
     crash-grade August to a Good week of 10/13 with real setbacks on the way. Authored in iPhone POINTS (390
     wide) and scaled into the frame's 242px screen, like JournalScreen.
     Everything is the app's own: the range control from Segmented
     (components/ui.tsx, with its trailing ⋯ for a custom range), the cards from
     CardView (app/(tabs)/analysis.tsx) with the Outlook card's copy, tiles and
     metrics row from lib/analysis/categories.ts, the chart from LineChart
     (components/charts.tsx: viewBox 320 x 140, the score line graded through
     acScoreZones, a dashed grey rolling average, smoothPath), and the HRV
     section head with its All / Morning / Evening links. Use it inside a
     `.hs-layer.real`. -->
<script lang="ts">
  import PhoneChrome from './PhoneChrome.svelte';
  export let time = '9:41';
  export let battery = 1;

  const labels = ['8/18', '8/25', '9/1', '9/8', '9/15', '9/22', '9/29', '10/6', '10/13'];
  const vals = [38, 49, 35, 41, 58, 64, 56, 71, 82];
  const WIN = 3;
  const roll = vals.map((_, i) => { const w = vals.slice(Math.max(0, i - WIN + 1), i + 1); return w.reduce((a, b) => a + b, 0) / w.length; });
  // SCORE_CATS as acScoreZones lays them out, low to high.
  const ZONES = [
    { from: 0, to: 25, c: '#b91c1c' }, { from: 25, to: 40, c: '#ef4444' }, { from: 40, to: 55, c: '#f97316' },
    { from: 55, to: 70, c: '#eab308' }, { from: 70, to: 85, c: '#16a34a' }, { from: 85, to: 100, c: '#2ee06a' },
  ];
  const zoneAt = (v: number) => (ZONES.find((z) => v >= z.from && v < z.to) || ZONES[ZONES.length - 1]).c;

  const W = 320, H = 140, padL = 34, padR = 10, padT = 10, padB = 22, n = vals.length;
  const all = [...vals, ...roll];
  let min = Math.min(...all), max = Math.max(...all);
  const padv = (max - min) * 0.05; min -= padv; max += padv;
  const innerW = W - padL - padR;
  const xAt = (i: number) => padL + (i / (n - 1)) * innerW;
  const yAt = (v: number) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);
  const offAt = (v: number) => Math.max(0, Math.min(1, 1 - (v - min) / (max - min)));
  const stops: { o: number; c: string }[] = [{ o: 0, c: zoneAt(max - 1e-9) }];
  ZONES.map((z) => z.to).filter((m) => m > min && m < max).sort((a, b) => b - a)
    .forEach((bv) => { stops.push({ o: offAt(bv), c: zoneAt(bv + 1e-9) }, { o: offAt(bv), c: zoneAt(bv - 1e-9) }); });
  stops.push({ o: 1, c: zoneAt(min + 1e-9) });
  // smoothPath, verbatim (tension 0.16).
  const smoothPath = (pts: [number, number][]) => {
    let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    const t = 0.16;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      d += ` C${(p1[0] + (p2[0] - p0[0]) * t).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) * t).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) * t).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) * t).toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }
    return d;
  };
  const scorePts = vals.map((v, i) => [xAt(i), yAt(v)] as [number, number]);
  const rollPts = roll.map((v, i) => [xAt(i), yAt(v)] as [number, number]);
  const step = Math.ceil(n / 6);
  const ticks = [min, (min + max) / 2, max];
</script>

<div class="pg" aria-hidden="true">
  <PhoneChrome tab="progress" {time} {battery} />

  <div class="pg-head">
    <div class="pg-seg">
      <span>Day</span><span class="on">Week</span><span>Month</span><span>Year</span>
      <i class="pg-more"><em></em><em></em><em></em></i>
    </div>
  </div>

  <div class="pg-body">
    <div class="pg-card">
      <div class="pg-title"><b>Autonomic Outlook</b><i>?</i><span class="pg-sp"></span><strong>Show zones</strong></div>
      <p class="pg-desc">Your daily autonomic score over the range, with a rolling average to smooth the noise.</p>
      <div class="pg-tiles">
        <div><b style="color:#eab308">55</b><span>Average</span></div>
        <div><b style="color:#2ee06a">88</b><span>Best · 10/11</span></div>
        <div><b style="color:#ef4444">27</b><span>Worst · 8/21</span></div>
      </div>
      <div class="pg-metrics">
        <div><span class="pg-m-l"><i style="background:#16a34a"></i>Score</span><b style="color:#16a34a">{vals[n - 1]}</b></div>
        <div><span class="pg-m-l"><i style="background:#9a9aa0"></i>{WIN} week avg</span><b style="color:#9a9aa0">{Math.round(roll[n - 1])}<small>{' for the week of ' + labels[n - 1]}</small></b></div>
      </div>
      <svg class="pg-chart" viewBox="0 0 {W} {H}" width="100%" height={H} preserveAspectRatio="none">
        <defs>
          <linearGradient id="pgGrad" x1="0" y1={padT} x2="0" y2={H - padB} gradientUnits="userSpaceOnUse">
            {#each stops as s}<stop offset={s.o} stop-color={s.c} />{/each}
          </linearGradient>
        </defs>
        {#each ticks as t}
          <line x1={padL} x2={W - padR} y1={yAt(t)} y2={yAt(t)} stroke="#303034" stroke-width="1" stroke-dasharray="3 4" opacity=".55" />
          <text x={padL - 4} y={yAt(t) + 3} text-anchor="end" font-size="9" class="mono" fill="#9a9aa0">{Math.round(t)}</text>
        {/each}
        {#each labels as l, i}
          {#if i % step === 0 || i === n - 1}<text x={xAt(i)} y={H - 6} text-anchor="middle" font-size="9" class="mono" fill="#9a9aa0">{l}</text>{/if}
        {/each}
        <path d={smoothPath(scorePts)} fill="none" stroke="url(#pgGrad)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" />
        {#each scorePts as pt, i}<circle cx={pt[0]} cy={pt[1]} r="2.6" fill={zoneAt(vals[i])} />{/each}
        <path d={smoothPath(rollPts)} fill="none" stroke="#9a9aa0" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="5 4" />
        {#each rollPts as pt}<circle cx={pt[0]} cy={pt[1]} r="2.6" fill="#9a9aa0" />{/each}
      </svg>
    </div>

    <div class="pg-card">
      <div class="pg-title"><b>Clean Days</b><i>?</i></div>
      <p class="pg-desc">Days in a row without breaking your protocol.</p>
      <div class="pg-tiles">
        <div><b style="color:#2ee06a">4<small>{' days'}</small></b><span>Current streak</span></div>
        <div><b>9<small>{' days'}</small></b><span>Longest</span></div>
        <div><b>63<small>{' %'}</small></b><span>30-day clean</span></div>
      </div>
    </div>

    <div class="pg-sec">
      <b>HRV</b>
      <span class="pg-links"><span class="on">All<i></i></span><span>Morning<i></i></span><span>Evening<i></i></span></span>
    </div>
  </div>
</div>

<style>
  .pg { position: absolute; left: 0; top: 0; width: 390px; height: 842px; transform: scale(.62051); transform-origin: 0 0; background: #000; color: #f2f2f5; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased; overflow: hidden; }
  .pg svg { display: block; }
  .mono { font-family: Menlo, 'SF Mono', ui-monospace, monospace; }

  /* Segmented: sunk capsule, 5pt pad, the accent pill under the chosen range,
     15/600 labels, and the trailing 42pt ⋯ for a custom window. */
  .pg-head { height: 58px; display: flex; align-items: center; padding: 0 16px; background: #040406; border-bottom: 1px solid rgba(255,255,255,.07); }
  .pg-seg { flex: 1; display: flex; padding: 5px; border-radius: 999px; background: #141416; border: 1px solid rgba(255,255,255,.07); }
  .pg-seg span { flex: 1; padding: 8px 0; border-radius: 999px; text-align: center; font-size: 15px; font-weight: 600; line-height: 20px; color: #9a9aa0; }
  .pg-seg span.on { background: #e03127; color: #fff; }
  .pg-more { width: 42px; flex: none; display: flex; align-items: center; justify-content: center; gap: 3px; }
  .pg-more em { width: 4px; height: 4px; border-radius: 2px; background: #9a9aa0; }

  .pg-body { padding: 14px 16px 0; }
  /* CardView: surface, hairline, 16 padding, 12 gutter; title 15/700 tracked. */
  .pg-card { padding: 16px; margin-bottom: 12px; border-radius: 14px; background: #1a1a1c; border: 1px solid #303034; }
  .pg-title { display: flex; align-items: center; }
  .pg-title b { font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #9a9aa0; }
  .pg-title i { width: 19px; height: 19px; margin-left: 8px; border-radius: 10px; border: 1.2px solid #9a9aa0; opacity: .75; display: flex; align-items: center; justify-content: center; font-style: normal; font-size: 11px; font-weight: 700; color: #9a9aa0; }
  .pg-sp { flex: 1; }
  .pg-title strong { font-size: 12px; font-weight: 700; color: #e03127; }
  .pg-desc { margin: 8px 0 0; font-size: 13px; line-height: 19px; color: #9a9aa0; }

  .pg-tiles { display: flex; gap: 6px; margin: 12px 0 6px; }
  .pg-tiles div { flex: 1; min-width: 0; padding: 12px 14px; border-radius: 14px; background: #000; border: 1px solid #303034; }
  .pg-tiles b { display: block; font-family: Manrope, sans-serif; font-weight: 800; font-size: 25px; line-height: 30px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .pg-tiles small, .pg-metrics small { font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, sans-serif; font-size: 16px; font-weight: 600; color: #9a9aa0; white-space: pre; }
  .pg-tiles span { display: block; margin-top: 2px; font-size: 12px; color: #9a9aa0; white-space: nowrap; }

  .pg-metrics { display: flex; gap: 28px; margin-top: 12px; }
  .pg-m-l { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: #9a9aa0; }
  .pg-m-l i { width: 9px; height: 9px; border-radius: 5px; }
  .pg-metrics b { display: block; margin-top: 3px; font-family: Manrope, sans-serif; font-weight: 800; font-size: 25px; line-height: 30px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .pg-chart { margin-top: 14px; }

  .pg-sec { display: flex; align-items: center; justify-content: space-between; min-height: 34px; margin: 22px 0 8px; }
  .pg-sec > b { font-size: 20px; font-weight: 700; }
  .pg-links { display: flex; gap: 16px; }
  .pg-links span { display: flex; flex-direction: column; align-items: center; font-size: 13px; font-weight: 600; color: #9a9aa0; }
  .pg-links span i { align-self: stretch; height: 2px; margin-top: 3px; border-radius: 1px; background: transparent; }
  .pg-links span.on { color: #fff; }
  .pg-links span.on i { background: #fff; }
</style>
