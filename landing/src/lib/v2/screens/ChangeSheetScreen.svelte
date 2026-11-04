<!-- Drawn: the Biggest change card opened, "Change details" over the Insights
     tab. Sample data: RMSSD 22 ms before magnesium, 28 ms after, the same claim
     the tab's card makes. Authored in iPhone POINTS like the other drawn
     screens. From the app: features/insights/FindingSheet.tsx (Body, the
     CausationNote leading, FindingCard, EvidenceChart) and the sheet from
     components/Sheet.tsx. The chart is the outcome by day with the factor's days
     shaded behind it in GRADE_COLORS.warning (violet) and a dashed divider at the
     onset; days before magnesium was logged are never shaded. -->
<script lang="ts">
  import InsightsTabScreen from './InsightsTabScreen.svelte';
  import PhoneChrome from './PhoneChrome.svelte';
  export let time = '9:41';
  export let battery = 1;

  // 56 days, magnesium started on day 28. A seeded wobble around 22 before and
  // 28 after, so the medians match the card and the trace reads as real data.
  const N = 56, ONSET = 28;
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const values = Array.from({ length: N }, (_, i) => Math.round(((i < ONSET ? 22 : 28) + (rnd() - 0.5) * 7 + (i >= ONSET ? Math.min(1, (i - ONSET) / 6) - 1 : 0)) * 10) / 10);
  // The selected (last) day sits on the after median, so the readout above the
  // chart agrees with the card rather than inviting a second question.
  values[N - 1] = 29;
  // Logged on most days after the start, never before it.
  const shaded = values.map((_, i) => i >= ONSET && ![33, 41, 47].includes(i));
  const W = 330, H = 150, PAD = 6, LO = 14, HI = 36;
  const x = (i: number) => PAD + (i / (N - 1)) * (W - PAD * 2);
  const y = (v: number) => H - ((v - LO) / (HI - LO)) * H;
  const path = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const colW = (W - PAD * 2) / (N - 1);
  const last = values[N - 1];
</script>

<div class="cs" aria-hidden="true">
  <InsightsTabScreen {time} {battery} />
  <div class="cs-top">
    <div class="cs-dim"></div>
    <PhoneChrome tabs={false} {time} {battery} />
    <div class="cs-sheet">
      <div class="cs-pill"><span><svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12" /></svg></span></div>
      <b class="cs-title">Change details</b>

      <div class="cs-note">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
        <span>Correlation is not causation. Treat this as a lead to explore, not an answer.</span>
      </div>

      <div class="cs-card">
        <p class="cs-headline">RMSSD is up since you started magnesium</p>
        <div class="cs-tiles">
          <div><b>22<small>{' ms'}</small></b><span>Before</span></div>
          <div><b class="g">28<small>{' ms'}</small></b><span>After</span></div>
          <div><b class="g">+27<small>{' %'}</small></b><span>Change</span></div>
        </div>
        <div class="cs-conf">
          <div class="cs-conf-row"><span>Confidence</span><b>Strong</b></div>
          <span class="cs-bar"><i style="width:80%"></i></span>
        </div>
      </div>

      <div class="cs-card">
        <div class="cs-sh">
          <span class="cs-sh-t">RMSSD</span>
          <span class="cs-sh-v"><b>{Math.round(last)}</b><small>ms</small><em>on Oct 14</em></span>
        </div>
        <p class="cs-desc">Each point is one day.</p>
        <svg class="cs-chart" viewBox="0 0 {W} {H + 18}" width={W} height={H + 18}>
          {#each [20, 25, 30] as g}<line x1="0" x2={W} y1={y(g)} y2={y(g)} stroke="#2a2a2e" stroke-width="1" />{/each}
          {#each shaded as on, i}{#if on}<rect x={x(i) - colW / 2} y="0" width={colW} height={H} fill="#a78bfa" opacity=".22" />{/if}{/each}
          <line x1={x(ONSET) - colW / 2} x2={x(ONSET) - colW / 2} y1="0" y2={H} stroke="#9a9aa0" stroke-width="1.4" stroke-dasharray="4 4" />
          <path d={path} fill="none" stroke="#3ec46d" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" />
          <circle cx={x(N - 1)} cy={y(last)} r="4.5" fill="#3ec46d" stroke="#141416" stroke-width="2" />
          <text x="0" y={H + 15} fill="#9a9aa0" font-size="11">Aug 19</text>
          <text x={x(ONSET) - colW / 2} y={H + 15} fill="#9a9aa0" font-size="11" text-anchor="middle">Sep 16</text>
          <text x={W} y={H + 15} fill="#9a9aa0" font-size="11" text-anchor="end">Oct 14</text>
        </svg>
        <div class="cs-legend"><i></i><span>Shaded: days you logged magnesium</span></div>
      </div>
    </div>
  </div>
</div>

<style>
  .cs { position: absolute; inset: 0; overflow: hidden; }
  .cs-top { position: absolute; left: 0; top: 0; width: 390px; height: 842px; transform: scale(.62051); transform-origin: 0 0; color: #f2f2f5; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased; }
  .cs-top svg { display: block; }
  .cs-dim { position: absolute; inset: 0; background: rgba(0,0,0,.38); }
  /* Sheet.tsx, as PacingSheetScreen draws it. */
  .cs-sheet { position: absolute; left: 0; right: 0; bottom: 0; height: 775px; padding: 22px 18px 0; background: #1a1a1c; border: 1px solid #303034; border-bottom: 0; border-radius: 18px 18px 0 0; overflow: hidden; box-shadow: 0 -10px 40px rgba(0,0,0,.5); }
  .cs-pill { position: absolute; top: 10px; right: 14px; padding: 5px; border-radius: 999px; border: 1px solid #46464e; }
  .cs-pill span { width: 36px; height: 36px; border-radius: 18px; background: #242427; display: flex; align-items: center; justify-content: center; }
  .cs-pill svg { width: 18px; height: 18px; fill: none; stroke: #9a9aa0; stroke-width: 2; stroke-linecap: round; }
  /* Body's title: 19 / 800, 82% wide, 14 under. */
  .cs-title { display: block; max-width: 82%; margin-bottom: 14px; font-size: 19px; font-weight: 800; letter-spacing: -.3px; }

  /* CausationNote: surface2, hairline, info icon, 12.5 dim. */
  .cs-note { display: flex; align-items: center; gap: 8px; padding: 9px 11px; margin-bottom: 12px; border-radius: 14px; background: #141416; border: 1px solid #303034; }
  .cs-note svg { width: 15px; height: 15px; flex: none; fill: none; stroke: #9a9aa0; stroke-width: 2; stroke-linecap: round; }
  .cs-note span { flex: 1; font-size: 12.5px; line-height: 17px; color: #9a9aa0; }

  .cs-card { padding: 16px; margin-bottom: 12px; border-radius: 14px; background: #141416; border: 1px solid #303034; }
  .cs-headline { margin: 0; font-size: 17px; font-weight: 700; letter-spacing: -.2px; line-height: 22px; }
  .cs-tiles { display: flex; gap: 6px; margin: 12px 0 6px; }
  .cs-tiles div { flex: 1; min-width: 0; padding: 12px 14px; border-radius: 14px; background: #000; border: 1px solid #303034; }
  .cs-tiles b { display: block; font-family: Manrope, sans-serif; font-weight: 800; font-size: 25px; line-height: 30px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .cs-tiles small { font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, sans-serif; font-size: 12px; font-weight: 600; color: #9a9aa0; }
  .cs-tiles span { display: block; font-size: 12px; margin-top: 2px; color: #9a9aa0; }
  .g { color: #3ec46d; }
  .cs-conf { border-top: 1px solid #303034; padding-top: 13px; }
  .cs-conf-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 12.5px; color: #9a9aa0; }
  .cs-conf-row b { color: #f2f2f5; font-weight: 700; }
  .cs-bar { display: block; height: 6px; border-radius: 999px; background: #000; overflow: hidden; }
  .cs-bar i { display: block; height: 100%; border-radius: 999px; background: #3ec46d; }

  /* SectionHead: the metric, the selected day's value in Manrope, its day dim. */
  .cs-sh { display: flex; align-items: baseline; justify-content: space-between; }
  .cs-sh-t { font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #9a9aa0; }
  .cs-sh-v { display: flex; align-items: baseline; gap: 4px; }
  .cs-sh-v b { font-family: Manrope, sans-serif; font-weight: 800; font-size: 24px; font-variant-numeric: tabular-nums; color: #3ec46d; }
  .cs-sh-v small { font-size: 12px; font-weight: 600; color: #9a9aa0; }
  .cs-sh-v em { font-style: normal; font-size: 12px; color: #9a9aa0; margin-left: 4px; }
  .cs-desc { margin: 4px 0 10px; font-size: 13px; color: #9a9aa0; }
  .cs-chart { width: 100%; height: auto; overflow: visible; }
  .cs-legend { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
  .cs-legend i { width: 14px; height: 10px; border-radius: 3px; background: #a78bfa; opacity: .45; }
  .cs-legend span { font-size: 12px; color: #9a9aa0; }
</style>
