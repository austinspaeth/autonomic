<!-- Drawn: Progress on the Week range, scrolled to the POTS section's POTS Test
     card. Sample data: eight weekly stand tests whose sustained rise falls from
     +58 to +45, the latest being the test the page's result screen shows. From
     the app: the card's title, description, tiles, metrics row (Sustained in
     blue, Peak in purple) and insight from lib/analysis/categories.ts, the
     tile colour from the stand-rise grade, the chrome and Segmented from
     ProgressScreen. Authored in iPhone POINTS like the other drawn screens. -->
<script lang="ts">
  import PhoneChrome from './PhoneChrome.svelte';
  export let time = '9:41';
  export let battery = 1;

  const labels = ['8/19', '8/26', '9/2', '9/9', '9/16', '9/23', '9/30', '10/14'];
  const sus = [58, 56, 55, 52, 50, 48, 47, 45];
  const peak = [66, 63, 62, 58, 56, 53, 50, 47];
  const n = sus.length;
  const W = 320, H = 150, padL = 30, padR = 18, padT = 10, padB = 22;
  const min = 25, max = 70;
  const xAt = (i: number) => padL + (i / (n - 1)) * (W - padL - padR);
  const yAt = (v: number) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);
  const smooth = (vals: number[]) => {
    const pts = vals.map((v, i) => [xAt(i), yAt(v)]);
    let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      d += ` C${(p1[0] + (p2[0] - p0[0]) * 0.16).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) * 0.16).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) * 0.16).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) * 0.16).toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }
    return d;
  };
  const BLUE = '#60a5fa', PURPLE = '#a855f7';
</script>

<div class="pp" aria-hidden="true">
  <PhoneChrome tab="progress" {time} {battery} />

  <div class="pp-head">
    <div class="pp-seg">
      <span>Day</span><span class="on">Week</span><span>Month</span><span>Year</span>
      <i class="pp-more"><em></em><em></em><em></em></i>
    </div>
  </div>

  <div class="pp-body">
    <div class="pp-sec"><b>POTS</b></div>
    <div class="pp-card">
      <div class="pp-title"><b>POTS Test</b><i>?</i><span class="pp-sp"></span><strong>Show zones</strong></div>
      <p class="pp-desc">Your guided lay-to-stand tests. Same protocol every time, so these are directly comparable.</p>
      <div class="pp-tiles">
        <div><b style="color:#ef4444">{sus[n - 1]}<small>{' bpm'}</small></b><span>Latest sustained rise</span></div>
        <div><b>68<small>{' bpm'}</small></b><span>Avg baseline</span></div>
        <div><b>8 of 8</b><span>Met POTS threshold</span></div>
      </div>
      <div class="pp-metrics">
        <div><span class="pp-m-l"><i style="background:{BLUE}"></i>Sustained</span><b style="color:{BLUE}">{sus[n - 1]}<small>{' bpm'}</small></b></div>
        <div><span class="pp-m-l"><i style="background:{PURPLE}"></i>Peak</span><b style="color:{PURPLE}">{peak[n - 1]}<small>{' bpm'}</small></b></div>
      </div>
      <svg class="pp-chart" viewBox="0 0 {W} {H}" width="100%" height={H} preserveAspectRatio="none">
        {#each [30, 45, 60] as t}
          <line x1={padL} x2={W - padR} y1={yAt(t)} y2={yAt(t)} stroke="#303034" stroke-width="1" stroke-dasharray="3 4" opacity=".55" />
          <text x={padL - 4} y={yAt(t) + 3} text-anchor="end" font-size="9" class="mono" fill="#9a9aa0">{t}</text>
        {/each}
        {#each labels as l, i}{#if i % 2 === 0 || i === n - 1}<text x={xAt(i)} y={H - 6} text-anchor="middle" font-size="9" class="mono" fill="#9a9aa0">{l}</text>{/if}{/each}
        <path d={smooth(peak)} fill="none" stroke={PURPLE} stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" />
        {#each peak as v, i}<circle cx={xAt(i)} cy={yAt(v)} r="2.6" fill={PURPLE} />{/each}
        <path d={smooth(sus)} fill="none" stroke={BLUE} stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" />
        {#each sus as v, i}<circle cx={xAt(i)} cy={yAt(v)} r="2.6" fill={BLUE} />{/each}
      </svg>
      <div class="pp-insight"><i></i><span>Sustained rise improved {sus[0] - sus[n - 1]} bpm across {n} tests in this range.</span></div>
    </div>
  </div>
</div>

<style>
  .pp { position: absolute; left: 0; top: 0; width: 390px; height: 842px; transform: scale(.62051); transform-origin: 0 0; background: #000; color: #f2f2f5; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased; overflow: hidden; }
  .pp svg { display: block; }
  .mono { font-family: Menlo, 'SF Mono', ui-monospace, monospace; }
  .pp-head { height: 58px; display: flex; align-items: center; padding: 0 16px; background: #040406; border-bottom: 1px solid rgba(255,255,255,.07); }
  .pp-seg { flex: 1; display: flex; padding: 5px; border-radius: 999px; background: #141416; border: 1px solid rgba(255,255,255,.07); }
  .pp-seg span { flex: 1; padding: 8px 0; border-radius: 999px; text-align: center; font-size: 15px; font-weight: 600; line-height: 20px; color: #9a9aa0; }
  .pp-seg span.on { background: #e03127; color: #fff; }
  .pp-more { width: 42px; flex: none; display: flex; align-items: center; justify-content: center; gap: 3px; }
  .pp-more em { width: 4px; height: 4px; border-radius: 2px; background: #9a9aa0; }
  .pp-body { padding: 0 16px; }
  .pp-sec { display: flex; align-items: center; min-height: 34px; margin: 16px 0 8px; }
  .pp-sec > b { font-size: 20px; font-weight: 700; }
  .pp-card { padding: 16px; margin-bottom: 12px; border-radius: 14px; background: #1a1a1c; border: 1px solid #303034; }
  .pp-title { display: flex; align-items: center; }
  .pp-title b { font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #9a9aa0; }
  .pp-title i { width: 19px; height: 19px; margin-left: 8px; border-radius: 10px; border: 1.2px solid #9a9aa0; opacity: .75; display: flex; align-items: center; justify-content: center; font-style: normal; font-size: 11px; font-weight: 700; color: #9a9aa0; }
  .pp-sp { flex: 1; }
  .pp-title strong { font-size: 12px; font-weight: 700; color: #e03127; }
  .pp-desc { margin: 8px 0 0; font-size: 13px; line-height: 19px; color: #9a9aa0; }
  .pp-tiles { display: flex; gap: 6px; margin: 12px 0 6px; }
  .pp-tiles div { flex: 1; min-width: 0; padding: 12px 11px; border-radius: 14px; background: #000; border: 1px solid #303034; }
  .pp-tiles b { display: block; font-family: Manrope, sans-serif; font-weight: 800; font-size: 22px; line-height: 28px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .pp-tiles small, .pp-metrics small { font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, sans-serif; font-size: 13px; font-weight: 600; color: #9a9aa0; white-space: pre; }
  .pp-tiles span { display: block; margin-top: 2px; font-size: 11px; line-height: 14px; color: #9a9aa0; }
  .pp-metrics { display: flex; gap: 28px; margin-top: 12px; }
  .pp-m-l { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: #9a9aa0; }
  .pp-m-l i { width: 9px; height: 9px; border-radius: 5px; }
  .pp-metrics b { display: block; margin-top: 3px; font-family: Manrope, sans-serif; font-weight: 800; font-size: 25px; line-height: 30px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .pp-chart { margin-top: 14px; }
  .pp-insight { display: flex; align-items: flex-start; gap: 10px; margin-top: 12px; padding: 12px; border-radius: 12px; background: #000; border: 1px solid #303034; }
  .pp-insight i { width: 8px; height: 8px; margin-top: 5px; flex: none; border-radius: 4px; background: #3ec46d; }
  .pp-insight span { font-size: 13.5px; line-height: 19px; }
</style>
