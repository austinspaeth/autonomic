<!-- Drawn: the AI Insights & Reports sheet, opened from the Insights tab's
     "Get AI Insights & Reports" pill (a fitContent sheet, so it rises from the
     bottom at its own height). Data for prompt is shown open on its four
     periods, counted over the sample journal. From the app:
     features/insights/AskAi.tsx (AiReportsSheet: the ai mark and 19/800 title,
     the 82% sub-line, the sunk accordion with its period rows, the two
     ReportRows, the footnote) and Icon.tsx for the row marks. -->
<script lang="ts">
  import InsightsTabScreen from './InsightsTabScreen.svelte';
  import PhoneChrome from './PhoneChrome.svelte';
  export let time = '9:41';
  export let battery = 1;
  const AI = ['M12 3l1.4 4.1L17.5 8l-3.6 1.4L12 13l-1.9-3.6L6.5 8l4.1-.9z', 'M18.5 14l.8 2.3 2.2.8-2.2.8-.8 2.3-.8-2.3-2.2-.8 2.2-.8z', 'M5 15l.6 1.6L7 17l-1.4.4L5 19l-.6-1.6L3 17l1.4-.4z'];
  const periods = [['Today', 'logged today'], ['Past week', '7 days'], ['Past month', '30 days'], ['Past year', '60 days']];
</script>

<div class="ar" aria-hidden="true">
  <InsightsTabScreen {time} {battery} />
  <div class="ar-top">
    <div class="ar-dim"></div>
    <PhoneChrome tabs={false} {time} {battery} />
    <div class="ar-sheet">
      <div class="ar-pill"><span><svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12" /></svg></span></div>
      <div class="ar-head">
        <svg viewBox="0 0 24 24" class="ar-ai">{#each AI as d}<path {d} />{/each}</svg>
        <b>AI Insights &amp; Reports</b>
      </div>
      <p class="ar-sub">The findings on this screen are already yours. These send your data out for a written read.</p>

      <div class="ar-acc">
        <div class="ar-row bare">
          <span class="ar-ic"><svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></svg></span>
          <span class="ar-t"><b>Data for prompt</b><small>Pick a period</small></span>
          <svg viewBox="0 0 24 24" class="ar-chev up"><path d="m6 9 6 6 6-6" /></svg>
        </div>
        <div class="ar-periods">
          {#each periods as p}
            <div class="ar-period"><b>{p[0]}</b><span>{p[1]}<svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6" /></svg></span></div>
          {/each}
        </div>
      </div>

      <div class="ar-row">
        <span class="ar-ic"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 16v-4" /><path d="M12 16V8" /><path d="M16 16v-6" /></svg></span>
        <span class="ar-t"><b>Full health report</b><small>Every tracked area, all time</small></span>
        <svg viewBox="0 0 24 24" class="ar-chev"><path d="m9 18 6-6-6-6" /></svg>
      </div>
      <div class="ar-row">
        <span class="ar-ic"><svg viewBox="0 0 24 24"><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1H9z" /><path d="M9 11h6" /><path d="M9 15h4" /></svg></span>
        <span class="ar-t"><b>Medical summary for doctor</b><small>Print-ready clinical document, all time</small></span>
        <svg viewBox="0 0 24 24" class="ar-chev"><path d="m9 18 6-6-6-6" /></svg>
      </div>

      <p class="ar-foot">Nothing is sent anywhere by the app. Each of these builds a prompt you copy and paste yourself.</p>
    </div>
  </div>
</div>

<style>
  .ar { position: absolute; inset: 0; overflow: hidden; }
  .ar-top { position: absolute; left: 0; top: 0; width: 390px; height: 842px; transform: scale(.62051); transform-origin: 0 0; color: #f2f2f5; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased; }
  .ar-top svg { display: block; }
  .ar-dim { position: absolute; inset: 0; background: rgba(0,0,0,.38); }
  /* fitContent: anchored to the bottom, as tall as what it holds. */
  .ar-sheet { position: absolute; left: 0; right: 0; bottom: 0; padding: 22px 16px 44px; background: #1a1a1c; border: 1px solid #303034; border-bottom: 0; border-radius: 18px 18px 0 0; box-shadow: 0 -10px 40px rgba(0,0,0,.5); }
  .ar-pill { position: absolute; top: 10px; right: 14px; padding: 5px; border-radius: 999px; border: 1px solid #46464e; }
  .ar-pill span { width: 36px; height: 36px; border-radius: 18px; background: #242427; display: flex; align-items: center; justify-content: center; }
  .ar-pill svg { width: 18px; height: 18px; fill: none; stroke: #9a9aa0; stroke-width: 2; stroke-linecap: round; }
  .ar-head { display: flex; align-items: center; gap: 9px; margin-bottom: 6px; }
  .ar-ai { width: 18px; height: 18px; fill: none; stroke: #e03127; stroke-width: 2; stroke-linejoin: round; }
  .ar-head b { font-size: 19px; font-weight: 800; letter-spacing: -.3px; }
  .ar-sub { max-width: 82%; margin: 0 0 16px; font-size: 13px; line-height: 19px; color: #9a9aa0; }
  .ar-acc { margin-bottom: 9px; border-radius: 16px; background: #141416; border: 1px solid #303034; overflow: hidden; }
  .ar-row { display: flex; align-items: center; gap: 12px; padding: 13px; margin-bottom: 9px; border-radius: 16px; background: #141416; border: 1px solid #303034; }
  .ar-row.bare { margin: 0; border: 0; border-radius: 0; background: none; }
  .ar-ic { width: 32px; height: 32px; flex: none; border-radius: 11px; background: rgba(224,49,39,.12); display: flex; align-items: center; justify-content: center; }
  .ar-ic svg { width: 15px; height: 15px; fill: none; stroke: #e03127; stroke-width: 2.1; stroke-linecap: round; stroke-linejoin: round; }
  .ar-t { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .ar-t b { font-size: 14.5px; font-weight: 700; }
  .ar-t small { margin-top: 2px; font-size: 12.5px; color: #9a9aa0; }
  .ar-chev { width: 16px; height: 16px; fill: none; stroke: #9a9aa0; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .ar-chev.up { transform: rotate(180deg); }
  .ar-periods { display: flex; flex-direction: column; gap: 7px; padding: 0 11px 11px; }
  .ar-period { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 14px; border-radius: 10px; background: #242427; border: 1px solid #303034; }
  .ar-period b { font-size: 14.5px; font-weight: 600; }
  .ar-period span { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: #9a9aa0; }
  .ar-period svg { width: 15px; height: 15px; fill: none; stroke: #9a9aa0; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .ar-foot { margin: 8px 0 0; font-size: 11.5px; line-height: 17px; color: #9a9aa0; }
</style>
