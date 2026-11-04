<!-- Drawn: a finished strap stand test, "Test complete", over the Journal.
     Sample data: supine baseline 68, standing peak 115 (peak rise +47), and a
     sustained rise of +45 over the final minute, which grades Bad on the
     standDelta bands. Authored in iPhone POINTS (390 wide) and scaled into the
     frame's 242px screen, like JournalScreen. Everything is the app's own: the
     sheet head from PotsResultsSheet (features/pots/common.tsx), the body from
     StandTestSummary (components/summary.tsx: the graded hero Section with its
     tag, the Heart rate over time chart, the three-column Heart rate section),
     the chart from StandHrChart (components/charts.tsx: purple supine trace, a
     graded gradient after the stand, the dashed baseline and stand marker,
     two smoothing passes), and the trash / edit / close pill from Sheet.tsx.
     Use it inside a `.hs-layer.real`. Pass `scrolled` to show the same sheet
     scrolled past its head to the numbers: the curve, the Heart rate columns
     and the Details rows (the pill stays put, as it does in the app). -->
<script lang="ts">
  import JournalScreen from './JournalScreen.svelte';
  import PhoneChrome from './PhoneChrome.svelte';
  export let time = '9:41';
  export let battery = 1;
  export let scrolled = false;

  const BASE = 68, PEAK = 115, STAND = 315, END = 915;
  // standDelta bands and SCORE_COLORS, verbatim.
  const BANDS = [{ max: 10, c: '#2ee06a' }, { max: 20, c: '#16a34a' }, { max: 30, c: '#eab308' }, { max: 40, c: '#f97316' }, { max: Infinity, c: '#ef4444' }];
  const PURPLE = '#a78bfa';

  // A deterministic trace, one sample a second, shaped like a real strap
  // recording rather than a curve: AR(1) noise (heart rate wanders, it does not
  // jitter independently each second), a ~0.1 Hz Mayer-wave swing whose phase
  // drifts and whose size grows the longer somebody stands (the oscillation a
  // POTS stand is known for), the orthostatic overshoot ~15 s after standing and
  // its partial recovery, then an uneven climb with two surges. The result is
  // then pinned to the card's own numbers: the last two supine minutes average
  // 68, the final standing minute averages 113 (68 + 45) and the peak is 115.
  let seed = 11;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  const bump = (s: number, at: number, w: number) => Math.exp(-((s - at) ** 2) / (2 * w * w));
  const series: number[] = [];
  let ar = 0, phase = 0, drift = 0;
  for (let t = 0; t <= END; t++) {
    const standing = t >= STAND, s = t - STAND;
    const grow = standing ? Math.min(1, s / 400) : 0;
    ar = 0.86 * ar + gauss() * (standing ? 1.2 + 0.8 * grow : 0.9);
    phase += (2 * Math.PI) / 11 + gauss() * 0.12;
    drift = 0.995 * drift + gauss() * (standing ? 0.18 : 0.08);
    const mayer = Math.sin(phase) * (standing ? 1.6 + 2.6 * grow : 0.7);
    let trend: number;
    if (!standing) trend = BASE + 3.5 * Math.exp(-t / 60);
    else trend = BASE
      + 31 * bump(s, 13, 7) * ease(s / 6)          // the overshoot on standing
      + 16 * ease(s / 30)                           // where it settles back to
      + 29 * ease((s - 50) / 470)                   // the slow climb
      + 5 * bump(s, 235, 22) + 4 * bump(s, 420, 18); // two surges
    series.push(trend + drift + ar + mayer);
  }
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const supShift = BASE - mean(series.slice(STAND - 120, STAND));
  for (let t = 0; t < STAND; t++) series[t] += supShift;
  const lastShift = BASE + 45 - mean(series.slice(END - 59));
  for (let t = STAND; t <= END; t++) series[t] += lastShift * ease((t - STAND) / 300);
  // Keep the top honest: squeeze anything above 112 so the highest second is
  // exactly the 115 the card reports.
  const hi = Math.max(...series.slice(STAND));
  if (hi > PEAK) for (let t = STAND; t <= END; t++) if (series[t] > 112) series[t] = 112 + (series[t] - 112) * ((PEAK - 112) / (hi - 112));
  const raw = series.map((v, t) => ({ t, bpm: Math.round(v) }));
  const stats = { baseline: mean(raw.slice(STAND - 120, STAND).map((q) => q.bpm)).toFixed(1), last: mean(raw.slice(END - 59).map((q) => q.bpm)).toFixed(1), peak: Math.max(...raw.map((q) => q.bpm)) };

  // StandHrChart, at its own sizes: viewBox 320 x 150, stride to <= 300 points,
  // two [.25 .5 .25] passes, 8% padding on the value range.
  const W = 320, H = 150, padL = 34, padR = 8, padT = 12, padB = 20;
  const stride = Math.ceil(raw.length / 300);
  const kept = raw.filter((_, i) => i % stride === 0 || i === raw.length - 1).map((q) => ({ ...q }));
  for (let pass = 0; pass < 2; pass++) {
    const src = kept.map((q) => q.bpm);
    for (let i = 1; i < kept.length - 1; i++) kept[i].bpm = 0.25 * src[i - 1] + 0.5 * src[i] + 0.25 * src[i + 1];
  }
  const vals = kept.map((q) => q.bpm);
  const dMin = Math.min(...vals, BASE), dMax = Math.max(...vals, BASE), span = dMax - dMin || 1;
  const min = dMin - span * 0.08, max = dMax + span * 0.08, range = max - min;
  const xAt = (t: number) => padL + (t / END) * (W - padL - padR);
  const yAt = (v: number) => padT + (1 - (v - min) / range) * (H - padT - padB);
  const smooth = (pts: [number, number][]) => {
    let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], mx = (x0 + x1) / 2;
      d += ` C${mx.toFixed(1)} ${y0.toFixed(1)} ${mx.toFixed(1)} ${y1.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
    }
    return d;
  };
  const pre = kept.filter((q) => q.t <= STAND), post = kept.filter((q) => q.t >= STAND);
  const prePath = smooth(pre.map((q) => [xAt(q.t), yAt(q.bpm)]));
  const postPath = smooth(post.map((q) => [xAt(q.t), yAt(q.bpm)]));
  const standX = xAt(STAND);
  const ticks = [min, (min + max) / 2, max];
  // The post-stand gradient: hard stops at each band edge above the baseline.
  const colAt = (v: number) => BANDS.find((b) => v - BASE <= b.max)!.c;
  const offAt = (v: number) => Math.max(0, Math.min(1, 1 - (v - min) / range));
  const stops: { o: number; c: string }[] = [{ o: 0, c: colAt(max - 1e-9) }];
  BANDS.map((b) => BASE + b.max).filter((v) => isFinite(v) && v > min && v < max).sort((a, b) => b - a)
    .forEach((v) => { stops.push({ o: offAt(v), c: colAt(v + 1e-9) }, { o: offAt(v), c: colAt(v - 1e-9) }); });
  stops.push({ o: 1, c: colAt(min + 1e-9) });
  const fmtT = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
</script>

<div class="sr" aria-hidden="true" data-stats={JSON.stringify(stats)}>
  <JournalScreen {time} {battery} />
  <div class="sr-top">
    <div class="sr-dim"></div>
    <!-- The OS draws the status bar and home indicator above the app, so the
         sheet's backdrop never dims them. -->
    <PhoneChrome tabs={false} {time} {battery} />
    <div class="sr-sheet">
      <div class="sr-pill">
        <span><svg viewBox="0 0 24 24" class="s16"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg></span>
        <span><svg viewBox="0 0 24 24" class="s16"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg></span>
        <span><svg viewBox="0 0 24 24" class="s18"><path d="M18 6 6 18M6 6l12 12" /></svg></span>
      </div>

      <div class="sr-scroll" class:scrolled>
      <b class="sr-title">Test complete</b>
      <p class="sr-sub">{fmtT(END)} captured · {raw.length} samples · Polar H10 DDE3C823</p>
      <p class="sr-saved">Saved to your journal</p>

      <!-- MetricSection hero: the Section takes the grade's tint and tag. -->
      <div class="sr-sec hero">
        <span class="sr-tag">Bad</span>
        <div class="sr-head">Sustained HR rise<i>?</i></div>
        <div class="sr-val"><b>+45</b><span>{' bpm'}</span></div>
        <p class="sr-desc">Marked sustained rise of 40 bpm or more. Hydrate, sit or lie down, and log context.</p>
      </div>

      <div class="sr-sec">
        <div class="sr-head">Heart rate over time<i>?</i></div>
        <div class="sr-chart">
          <div class="sr-chart-top"><span>Heart rate (bpm) · {fmtT(END)} test</span><b>Show zones</b></div>
          <svg viewBox="0 0 {W} {H}" width="100%" height={H} preserveAspectRatio="none">
            <defs>
              <linearGradient id="srGrad" x1="0" y1={padT} x2="0" y2={H - padB} gradientUnits="userSpaceOnUse">
                {#each stops as s}<stop offset={s.o} stop-color={s.c} />{/each}
              </linearGradient>
            </defs>
            <rect x={standX} y={padT} width={W - padR - standX} height={H - padT - padB} fill={PURPLE} opacity=".06" />
            {#each ticks as t}
              <line x1={padL} x2={W - padR} y1={yAt(t)} y2={yAt(t)} stroke="#303034" stroke-width="1" opacity=".4" />
              <text x={padL - 4} y={yAt(t) + 3} text-anchor="end" font-size="9" fill="#9a9aa0">{Math.round(t)}</text>
            {/each}
            <line x1={padL} x2={W - padR} y1={yAt(BASE)} y2={yAt(BASE)} stroke="#9a9aa0" stroke-width="1" stroke-dasharray="4 3" opacity=".7" />
            <line x1={standX} x2={standX} y1={padT} y2={H - padB} stroke={PURPLE} stroke-width="1.4" stroke-dasharray="2 3" opacity=".9" />
            <path d={prePath} fill="none" stroke={PURPLE} stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" />
            <path d={postPath} fill="none" stroke="url(#srGrad)" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" />
          </svg>
          <div class="sr-chart-x"><span>0:00</span><span>stood {fmtT(STAND)}</span><span>{fmtT(END)}</span></div>
        </div>
      </div>

      <div class="sr-sec">
        <div class="sr-head">Heart rate<i>?</i></div>
        <p class="sr-desc">Supine baseline, standing peak, and the largest rise.</p>
        <div class="sr-cols">
          <div><span>Baseline</span><b>{BASE}</b><small>bpm · supine</small></div>
          <div><span>Peak</span><b>{PEAK}</b><small>bpm · standing</small></div>
          <div><span>Peak Δ</span><b>{PEAK - BASE}</b><small>bpm · rise</small></div>
        </div>
      </div>

      <div class="sr-sec">
        <div class="sr-head">Details</div>
        <div class="sr-rows">
          <div><span>Sustained rise ≥30 bpm</span><b>Yes</b></div>
          <div><span>Max HR reached</span><b>{PEAK}</b></div>
          <div><span>Source</span><b>Polar H10 DDE3C823</b></div>
        </div>
      </div>
      </div>
    </div>
  </div>
</div>

<style>
  .sr { position: absolute; inset: 0; overflow: hidden; }
  .sr-top { position: absolute; left: 0; top: 0; width: 390px; height: 842px; transform: scale(.62051); transform-origin: 0 0; color: #f2f2f5; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased; }
  .sr-top svg { display: block; }
  .sr-dim { position: absolute; inset: 0; background: rgba(0,0,0,.38); }
  /* Scrolled: the head and the graded hero have gone up under the pill. */
  .sr-scroll.scrolled { transform: translateY(-276px); }
  .sr-sheet { position: absolute; left: 0; right: 0; bottom: 0; height: 775px; padding: 18px 16px 0; background: #1a1a1c; border: 1px solid #303034; border-bottom: 0; border-radius: 18px 18px 0 0; overflow: hidden; box-shadow: 0 -10px 40px rgba(0,0,0,.5); }

  /* SheetPill: trash furthest from the close, edit, close; every glyph dim. */
  .sr-pill { position: absolute; z-index: 3; top: 10px; right: 14px; display: flex; gap: 6px; padding: 5px 6px; border-radius: 999px; border: 1px solid #46464e; }
  .sr-pill span { width: 36px; height: 36px; border-radius: 18px; background: #242427; display: flex; align-items: center; justify-content: center; }
  .sr-pill svg { fill: none; stroke: #9a9aa0; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .s16 { width: 16px; height: 16px; } .s18 { width: 18px; height: 18px; }

  /* PotsResultsSheet head. */
  .sr-title { display: block; font-size: 25px; font-weight: 800; line-height: 30px; margin-bottom: 4px; }
  .sr-sub { margin: 0 0 4px; font-size: 14px; line-height: 19px; color: #9a9aa0; max-width: 220px; }
  .sr-saved { margin: 0 0 16px; font-size: 13px; color: #9a9aa0; }

  /* Section: surface2 on the sheet; the hero wears the grade at .15 / .45. */
  .sr-sec { position: relative; padding: 16px; margin-bottom: 12px; border-radius: 14px; background: #242427; border: 1px solid #303034; }
  .sr-sec.hero { background: rgba(239,68,68,.15); border-color: rgba(239,68,68,.45); }
  .sr-tag { position: absolute; top: 14px; right: 14px; padding: 4px 11px; border-radius: 999px; background: #ef4444; color: #fff; font-size: 12px; font-weight: 800; text-transform: uppercase; }
  .sr-head { display: flex; align-items: center; font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #9a9aa0; }
  .sr-head i { width: 19px; height: 19px; margin-left: 8px; border-radius: 10px; border: 1.2px solid #9a9aa0; opacity: .75; display: flex; align-items: center; justify-content: center; font-style: normal; font-size: 11px; line-height: 13px; letter-spacing: 0; }
  .sr-val { display: flex; align-items: baseline; margin-top: 6px; }
  .sr-val b { font-family: Manrope, sans-serif; font-weight: 800; font-size: 27px; line-height: 34px; font-variant-numeric: tabular-nums; }
  .sr-val span { white-space: pre; font-size: 16px; font-weight: 600; color: #9a9aa0; }
  .sr-desc { margin: 8px 0 0; font-size: 13px; line-height: 19px; color: #9a9aa0; }

  .sr-chart { margin-top: 12px; padding: 8px; border-radius: 10px; background: #000; }
  .sr-chart-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; font-size: 11px; color: #9a9aa0; }
  .sr-chart-top b { font-size: 12px; font-weight: 700; color: #e03127; }
  .sr-chart-x { display: flex; justify-content: space-between; font-size: 10px; color: #9a9aa0; }

  .sr-cols { display: flex; margin-top: 12px; padding-top: 12px; border-top: 1px solid #303034; }
  .sr-cols div { flex: 1; display: flex; flex-direction: column; align-items: center; }
  .sr-cols span { font-size: 12px; font-weight: 600; color: #9a9aa0; }
  .sr-cols b { margin-top: 3px; font-family: Manrope, sans-serif; font-weight: 800; font-size: 20px; line-height: 26px; font-variant-numeric: tabular-nums; }
  .sr-cols small { font-size: 11px; color: #9a9aa0; }

  .sr-rows { margin-top: 12px; }
  .sr-rows div { display: flex; justify-content: space-between; gap: 12px; padding: 11px 0; border-top: 1px solid #303034; }
  .sr-rows div:first-child { border-top: 0; }
  .sr-rows span { font-size: 16px; font-weight: 700; }
  .sr-rows b { font-size: 16px; font-weight: 600; color: #9a9aa0; }
</style>
