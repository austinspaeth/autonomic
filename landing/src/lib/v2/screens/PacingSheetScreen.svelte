<!-- Drawn: the pacing sheet open over the Journal, mid-morning, running AHEAD of
     pace (gold: the fill has passed the white pace mark). Sample data: 1h 25m
     spent of a 5h budget, 3h 35m left. Authored in iPhone POINTS (390 wide)
     and scaled into the frame's 242px screen, like JournalScreen. Every size
     and colour is the app's own: the sheet from components/Sheet.tsx (92% tall,
     18pt top corners, surface fill, the ✕ pill), the cards from
     features/budget/BudgetSheet.tsx over features/insights/Card.tsx, and the bar
     from features/budget/Bar.tsx (14pt in the sheet, still, halo, pace mark
     with its caret). Use it inside a `.hs-layer.real`.
     Pass `over` for the evening the same day ran past its ceiling: the bar
     fills in the accent red with no pace mark (Bar.tsx never draws one past the
     ceiling), and the ember drifts along it while the glow breathes, the one
     continuous animation the app allows on a card (lib/ember.ts). -->
<script lang="ts">
  import JournalScreen from './JournalScreen.svelte';
  import PhoneChrome from './PhoneChrome.svelte';
  export let time = '9:41';
  export let battery = 1;
  export let over = false;
  const BUDGET = 300, PACE = 0.12; // pace mark: where an even day would be by 8:48am
  $: SPENT = over ? 325 : 85;
  $: fill = over ? 1 : SPENT / BUDGET;
  $: stamp = over ? 'Tuesday, 5:40pm' : 'Tuesday, 8:48am';
  $: rows = over
    ? [
        { label: 'Upright time', detail: '3h 10m walking or standing, estimated', min: 125 },
        { label: 'Minutes HR above 96 bpm', detail: '58m above, in 6 stretches', min: 110 },
        { label: 'Logged activities', detail: 'Grocery run, Hot shower / bath', min: 90 },
      ]
    : [
        { label: 'Upright time', detail: '1h 08m walking or standing, estimated', min: 41 },
        { label: 'Minutes HR above 96 bpm', detail: '19m above, in 4 stretches', min: 26 },
        { label: 'Logged activities', detail: 'Hot shower / bath', min: 18 },
      ];
  const hm = (m: number) => (m % 60 ? `${Math.floor(m / 60) ? Math.floor(m / 60) + 'h ' : ''}${String(m % 60).padStart(Math.floor(m / 60) ? 2 : 1, '0')}m` : `${m / 60}h`);
</script>

<div class="ps" aria-hidden="true">
  <JournalScreen {time} {battery} />
  <div class="ps-top">
    <div class="ps-dim"></div>
    <!-- The OS draws the status bar and home indicator above the app, so the
         sheet's backdrop never dims them. -->
    <PhoneChrome tabs={false} {time} {battery} />
    <div class="ps-sheet">
      <div class="ps-pill"><span><svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12" /></svg></span></div>

      <div class="ps-head">
        <b>Pacing</b>
        <span>{stamp}</span>
      </div>

      <div class="ps-card">
        <div class="ps-title">Budget<i>?</i></div>
        <p class="ps-desc">Today's estimate, and how much of it the day has used so far.</p>
        {#if over}
          <div class="ps-figure"><b class="hot">Over by {hm(SPENT - BUDGET)}</b></div>
        {:else}
          <div class="ps-figure"><b>{hm(BUDGET - SPENT)}</b><span>left</span></div>
        {/if}
        <div class="ps-bar" class:over>
          <span class="ps-fill" style="width:{fill * 100}%"><i></i>{#if over}<em class="ps-ember"></em>{/if}</span>
          {#if !over}
            <span class="ps-mark" style="left:{PACE * 100}%"></span>
            <span class="ps-caret" style="left:{PACE * 100}%"></span>
          {/if}
        </div>
        <div class="ps-under"><span>{hm(SPENT)} spent of {hm(BUDGET)}</span><span>High confidence</span></div>
        {#if over}
          <div class="ps-legend over">
            <span class="ps-alert">!</span>
            <p>Resting now brings this back down.</p>
          </div>
        {:else}
          <div class="ps-legend">
            <span class="ps-legend-m"><i></i><em></em></span>
            <p>The white mark is where you are in the day. Short of it, energy in reserve. Past it, running out.</p>
          </div>
        {/if}
        <div class="ps-tiles">
          <div><b>{hm(BUDGET)}</b><span>Budget</span></div>
          <div><b>{hm(SPENT)}</b><span>Spent</span></div>
          {#if over}<div><b class="hot">{hm(SPENT - BUDGET)}</b><span>Over</span></div>{:else}<div><b class="good">{hm(BUDGET - SPENT)}</b><span>Left</span></div>{/if}
        </div>
        <p class="ps-cov">{over ? 'Built from 2 logged activities, 6,480 steps and your heart rate.' : 'Built from 1 logged activity, 2,140 steps and your heart rate.'}</p>
      </div>

      <div class="ps-card">
        <div class="ps-title">Where Budget Went<i>?</i></div>
        <p class="ps-desc">The {hm(SPENT)} spent so far, largest source first.</p>
        {#each rows as r}
          <div class="ps-row">
            <div class="ps-row-l">
              <b>{r.label}</b>
              <small>{r.detail}</small>
              <span class="ps-share"><i style="width:{Math.round((r.min / SPENT) * 100)}%"></i></span>
            </div>
            <div class="ps-row-r"><b>{hm(r.min)}</b><svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" /></svg></div>
          </div>
        {/each}
      </div>
    </div>
  </div>
</div>

<style>
  .ps { position: absolute; inset: 0; overflow: hidden; }
  /* Same 390pt canvas and scale as JournalScreen, laid over it. */
  .ps-top { position: absolute; left: 0; top: 0; width: 390px; height: 842px; transform: scale(.62051); transform-origin: 0 0; color: #f2f2f5; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased; }
  .ps-top svg { display: block; }
  .ps-dim { position: absolute; inset: 0; background: rgba(0,0,0,.38); }
  /* Sheet.tsx: min(92% of the screen, screen - top inset - 8), surface fill,
     18pt top corners, a hairline border, no grabber. */
  .ps-sheet { position: absolute; left: 0; right: 0; bottom: 0; height: 775px; padding: 18px 16px 0; background: #1a1a1c; border: 1px solid #303034; border-bottom: 0; border-radius: 18px 18px 0 0; overflow: hidden; box-shadow: 0 -10px 40px rgba(0,0,0,.5); }
  .ps-pill { position: absolute; top: 10px; right: 14px; padding: 5px; border-radius: 999px; border: 1px solid #46464e; }
  .ps-pill span { width: 36px; height: 36px; border-radius: 18px; background: #242427; display: flex; align-items: center; justify-content: center; }
  .ps-pill svg { width: 18px; height: 18px; fill: none; stroke: #9a9aa0; stroke-width: 2; stroke-linecap: round; }

  .ps-head { padding: 0 2px; margin-bottom: 14px; }
  .ps-head b { display: block; font-size: 21px; font-weight: 700; letter-spacing: -.3px; }
  .ps-head span { display: block; font-size: 13px; color: #9a9aa0; margin-top: 2px; }

  /* InsightCard on the sheet: sunk fill, hairline, 16 padding. */
  .ps-card { margin: 0 2px 12px; padding: 16px; border-radius: 14px; background: #141416; border: 1px solid #303034; }
  .ps-title { display: flex; align-items: center; font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #9a9aa0; }
  .ps-title i { width: 19px; height: 19px; margin-left: 8px; border-radius: 10px; border: 1.2px solid #9a9aa0; opacity: .75; display: flex; align-items: center; justify-content: center; font-style: normal; font-size: 11px; line-height: 13px; letter-spacing: 0; }
  .ps-desc { margin: 8px 0 0; font-size: 13px; line-height: 19px; color: #9a9aa0; }

  .ps-figure { display: flex; align-items: baseline; gap: 8px; margin: 6px 0 11px; padding-top: 6px; }
  .ps-figure b { font-family: Manrope, sans-serif; font-weight: 800; font-size: 28px; line-height: 30px; letter-spacing: -.4px; font-variant-numeric: tabular-nums; }
  .ps-figure span { font-size: 14px; color: #9a9aa0; }

  /* Bar.tsx at height 14: a 6% track, the fill in CAUTION_GOLD (state
     'ahead') wearing its resting halo, and the pace mark: a 2pt line 4pt
     proud of the track both ways, with a caret under it. */
  .ps-bar { position: relative; height: 14px; border-radius: 999px; background: rgba(242,242,245,.06); }
  .ps-fill { position: absolute; left: 0; top: 0; bottom: 0; z-index: 2; border-radius: 999px; background: #eab308; }
  .ps-fill i { position: absolute; inset: -3px; border-radius: 999px; background: rgba(234,179,8,.16); box-shadow: 0 0 5px rgba(234,179,8,.5); z-index: -1; }
  /* Over: the accent red, the ember drifting along the fill (a doubled
     periodic gradient moved by exactly one period, EMBER_MS 3.4s, so the loop
     has no seam) and the glow breathing under it (EMBER_GLOW_MS 1.1s, .35 to
     .75). The stops are emberStops('#e03127'): base, hot, base, warm. */
  .ps-bar.over .ps-fill { background: #e03127; overflow: visible; }
  .ps-bar.over .ps-fill i { background: rgba(224,49,39,.18); box-shadow: 0 0 6px rgba(224,49,39,.75); animation: ps-breathe 1.1s ease-in-out infinite alternate; }
  .ps-ember { position: absolute; inset: 0; border-radius: 999px; background: linear-gradient(90deg, #e03127 0%, #f0855f 11%, #e03127 25%, #ea6a50 36%, #e03127 50%, #f0855f 61%, #e03127 75%, #ea6a50 86%, #e03127 100%); background-size: 200% 100%; animation: ps-drift 3.4s linear infinite; }
  @keyframes ps-drift { from { background-position: 0 0; } to { background-position: 100% 0; } }
  @keyframes ps-breathe { from { opacity: .35; } to { opacity: .75; } }
  @media (prefers-reduced-motion: reduce) { .ps-ember, .ps-bar.over .ps-fill i { animation: none; } }
  .hot { color: #e03127; }
  .ps-legend.over p { color: rgba(242,242,245,.8); }
  .ps-alert { width: 22px; height: 22px; flex: none; border-radius: 999px; background: rgba(224,49,39,.16); color: #e03127; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 800; line-height: 17px; }
  .ps-mark { position: absolute; top: -4px; bottom: -4px; width: 2px; margin-left: -1px; z-index: 4; border-radius: 999px; background: rgba(242,242,245,.84); }
  .ps-caret { position: absolute; top: 16px; margin-left: -5px; z-index: 4; width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent; border-bottom: 6px solid rgba(242,242,245,.84); }
  .ps-under { display: flex; justify-content: space-between; gap: 10px; margin: 14px 0; font-size: 11.5px; color: #9a9aa0; }

  .ps-legend { display: flex; align-items: center; gap: 10px; padding: 12px; margin-bottom: 15px; border-radius: 14px; background: #000; }
  .ps-legend-m { display: flex; flex-direction: column; align-items: center; }
  .ps-legend-m i { width: 2px; height: 18px; border-radius: 999px; background: rgba(242,242,245,.84); }
  .ps-legend-m em { margin-top: -2px; width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent; border-bottom: 6px solid rgba(242,242,245,.84); }
  .ps-legend p { flex: 1; margin: 0; font-size: 12.5px; line-height: 18px; color: #9a9aa0; }

  .ps-tiles { display: flex; gap: 9px; }
  .ps-tiles div { flex: 1; padding: 12px 14px; border-radius: 14px; background: #000; border: 1px solid #303034; }
  .ps-tiles b { display: block; font-family: Manrope, sans-serif; font-weight: 800; font-size: 17px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .ps-tiles span { display: block; font-size: 11px; color: #9a9aa0; margin-top: 3px; }
  .good { color: #16a34a; }
  .ps-cov { margin: 13px 0 0; font-size: 12px; line-height: 18px; color: #9a9aa0; }

  /* CardRow tall on the sunk card: steps DOWN to the screen black. */
  .ps-row { display: flex; align-items: flex-start; gap: 12px; margin-top: 8px; padding: 13px; border-radius: 14px; background: #000; border: 1px solid #303034; }
  .ps-row-l { flex: 1; min-width: 0; }
  .ps-row-l b { display: block; font-size: 14px; font-weight: 700; }
  .ps-row-l small { display: block; font-size: 11.5px; color: #9a9aa0; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ps-share { display: block; height: 4px; margin-top: 8px; border-radius: 999px; background: rgba(242,242,245,.06); overflow: hidden; }
  .ps-share i { display: block; height: 100%; border-radius: 999px; background: rgba(242,242,245,.34); }
  .ps-row-r { align-self: center; display: flex; align-items: center; gap: 8px; }
  .ps-row-r b { font-family: Manrope, sans-serif; font-weight: 800; font-size: 15px; font-variant-numeric: tabular-nums; }
  .ps-row-r svg { width: 16px; height: 16px; fill: none; stroke: rgba(154,154,160,.7); stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
</style>
