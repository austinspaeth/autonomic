<!-- Drawn: the Insights tab on day nine, before there is anything to report.
     Sample data. From the app: InsightsEmpty in
     features/insights/InsightsSkeleton.tsx, copy verbatim: the progress ring
     (132, stroke 9, accent on surface2) over "N of 14 days", the Almost testable
     rows ("5 of 8 days"), then Worth logging daily. It never shows a finding it
     does not have. Authored in iPhone POINTS like the other drawn screens. -->
<script lang="ts">
  import PhoneChrome from './PhoneChrome.svelte';
  export let time = '9:41';
  export let battery = 1;
  const DAYS = 9, MIN = 14, RING = 132, SW = 9;
  const R = (RING - SW) / 2, C = 2 * Math.PI * R;
  const almost = [['Magnesium', 5, 8], ['Electrolytes', 6, 8]] as const;
  const I: Record<string, string> = {
    heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" /><path d="M3.22 12H9.5l.6-1.3 1.9 4.6 2-7 1.5 3.7h5.27" />',
    pill: '<path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" /><path d="m8.5 8.5 7 7" />',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />'
  };
  const worth = [['An HRV reading', 'heart'], ['Supplements & meds you took', 'pill'], ['Last night’s sleep', 'moon']];
</script>

<div class="ie" aria-hidden="true">
  <PhoneChrome tab="insight" {time} {battery} />

  <div class="ie-body">
    <div class="ie-card ie-count">
      <svg viewBox="0 0 {RING} {RING}" width={RING} height={RING}>
        <circle cx={RING / 2} cy={RING / 2} r={R} fill="none" stroke="#141416" stroke-width={SW} />
        <circle cx={RING / 2} cy={RING / 2} r={R} fill="none" stroke="#e03127" stroke-width={SW} stroke-linecap="round" stroke-dasharray={C} stroke-dashoffset={C * (1 - DAYS / MIN)} transform="rotate(-90 {RING / 2} {RING / 2})" />
      </svg>
      <div class="ie-ring-in" style="width:{RING}px;height:{RING}px"><b>{DAYS}</b><span>of {MIN} days</span></div>
      <p class="ie-left">{MIN - DAYS} more days of logging</p>
      <p class="ie-why">A pattern needs a couple of weeks of days to compare against each other. Nothing is being held back, there simply is not enough yet.</p>
    </div>

    <div class="ie-card">
      <div class="ie-title">Almost testable</div>
      <p class="ie-desc">Log these a few more days and the analysis can start comparing days with them against days without.</p>
      {#each almost as a}
        <div class="ie-row"><span>{a[0]}</span><em>{a[1]} of {a[2]} days</em></div>
      {/each}
    </div>

    <div class="ie-card">
      <div class="ie-title">Worth logging daily</div>
      {#each worth as w}
        <div class="ie-row"><i>{@html `<svg viewBox="0 0 24 24">${I[w[1]]}</svg>`}</i><span>{w[0]}</span></div>
      {/each}
    </div>
  </div>
</div>

<style>
  .ie { position: absolute; left: 0; top: 0; width: 390px; height: 842px; transform: scale(.62051); transform-origin: 0 0; background: #000; color: #f2f2f5; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased; overflow: hidden; }
  .ie :global(svg) { display: block; }
  .ie-body { padding: 14px 16px 0; }
  .ie-card { padding: 16px; margin-bottom: 12px; border-radius: 14px; background: #1a1a1c; border: 1px solid #303034; }
  .ie-count { position: relative; display: flex; flex-direction: column; align-items: center; padding-top: 22px; }
  .ie-count > svg { margin-bottom: 16px; }
  .ie-ring-in { position: absolute; top: 22px; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .ie-ring-in b { font-family: Manrope, sans-serif; font-weight: 800; font-size: 34px; line-height: 38px; font-variant-numeric: tabular-nums; }
  .ie-ring-in span { font-size: 12px; font-weight: 600; color: #9a9aa0; }
  .ie-left { margin: 0; font-size: 19px; font-weight: 700; letter-spacing: -.3px; text-align: center; }
  .ie-why { margin: 6px 0 2px; font-size: 13.5px; line-height: 21px; color: #9a9aa0; text-align: center; }
  .ie-title { font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #9a9aa0; }
  .ie-desc { margin: 8px 0 4px; font-size: 13px; line-height: 19px; color: #9a9aa0; }
  .ie-row { min-height: 50px; display: flex; align-items: center; gap: 12px; margin-top: 8px; padding: 12px 13px; border-radius: 14px; background: #232326; border: 1px solid #303034; }
  .ie-title + .ie-row { margin-top: 12px; }
  .ie-row span { flex: 1; min-width: 0; font-size: 15.5px; font-weight: 600; }
  .ie-row em { font-style: normal; font-size: 13px; font-weight: 700; color: #9a9aa0; font-variant-numeric: tabular-nums; }
  .ie-row i { width: 30px; height: 30px; flex: none; border-radius: 9px; background: #000; display: flex; align-items: center; justify-content: center; }
  .ie-row i :global(svg) { width: 14px; height: 14px; fill: none; stroke: #e03127; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
</style>
