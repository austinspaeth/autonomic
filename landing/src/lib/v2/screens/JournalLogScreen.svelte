<!-- Drawn: the Journal scrolled past the Outlook to a logged day. Sample data.
     Authored in iPhone POINTS like JournalScreen and built from the app's own
     pieces (mobile/src/components/ui.tsx: Card, SectionHeader, Row, Pill,
     AddDashButton, RowValue's grade dot) and the sections in
     features/JournalSections.tsx. Icons are mobile/src/components/Icon.tsx. -->
<script lang="ts">
  import PhoneChrome from './PhoneChrome.svelte';
  export let time = '4:12';
  export let battery = 0.6;
  const I: Record<string, string> = {
    heartPulse: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" /><path d="M3.22 12H9.5l.6-1.3 1.9 4.6 2-7 1.5 3.7h5.27" />',
    gauge: '<path d="m12 14 4-4" /><path d="M3.34 19a10 10 0 1 1 17.32 0" />',
    pill: '<path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" /><path d="m8.5 8.5 7 7" />',
    brain: '<path d="M9.5 4a2.5 2.5 0 0 0-2.5 2.5 2.5 2.5 0 0 0-1 4.8A2.5 2.5 0 0 0 7 16a2.5 2.5 0 0 0 5 .5V5.5A1.5 1.5 0 0 0 10.5 4z" /><path d="M14.5 4a2.5 2.5 0 0 1 2.5 2.5 2.5 2.5 0 0 1 1 4.8A2.5 2.5 0 0 1 17 16a2.5 2.5 0 0 1-5 .5" />',
    cup: '<path d="M6 3h12l-1.1 15.3a2 2 0 0 1-2 1.7H9.1a2 2 0 0 1-2-1.7L6 3Z" /><path d="M6.5 9.5h11" />'
  };
  // Grade dots are SCORE_COLORS: great green, ok yellow.
  type LogRow = { icon: string; title: string; sub?: string; value?: string; dot?: string; time?: string };
  const sections: { title: string; add: string; rows: LogRow[] }[] = [
    { title: 'Readings', add: '+ Add reading', rows: [
      { icon: 'heartPulse', title: 'Baseline HRV', value: '28 ms', dot: '#16a34a', time: '6:52 AM' },
      { icon: 'gauge', title: 'Blood pressure', value: '104/68', dot: '#eab308', time: '7:05 AM' }
    ] },
    { title: 'Symptoms', add: '+ Add symptom', rows: [
      { icon: 'brain', title: 'Brain fog', value: 'Mild', time: '11:40 AM' },
      { icon: 'heartPulse', title: 'Dizziness on standing', value: 'Moderate', time: '2:05 PM' }
    ] },
    { title: 'Medications & Supplements', add: '+ Add medication', rows: [
      { icon: 'pill', title: 'Electrolytes', sub: '1 packet', time: '7:30 AM' },
      { icon: 'pill', title: 'Magnesium glycinate', sub: '400 mg', time: '9:15 PM' }
    ] },
  ];
</script>

<div class="jl" aria-hidden="true">
  <PhoneChrome tab="journal" {time} {battery} />

  <div class="jl-head">
    <svg class="jl-chev" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg>
    <div class="jl-date">Tue, Oct 14</div>
    <svg class="jl-chev" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" /></svg>
  </div>

  <div class="jl-body">
    {#each sections as s}
      <div class="jl-card">
        <div class="jl-sec">{s.title}</div>
        <div class="jl-rows">
          {#each s.rows as r}
            <div class="jl-row">
              <span class="jl-ico">{@html `<svg viewBox="0 0 24 24">${I[r.icon]}</svg>`}</span>
              <span class="jl-main"><span>{r.title}</span>{#if r.sub}<small>{r.sub}</small>{/if}</span>
              {#if r.value}<span class="jl-val">{#if r.dot}<i style="background:{r.dot}"></i>{/if}{r.value}</span>{/if}
              {#if r.time}<span class="jl-pill">{r.time}</span>{/if}
            </div>
          {/each}
          <div class="jl-add">{s.add}</div>
        </div>
      </div>
    {/each}
    <div class="jl-card">
      <div class="jl-sec">Hydration</div>
      <div class="jl-water">
        <span class="jl-ico">{@html `<svg viewBox="0 0 24 24">${I.cup}</svg>`}</span>
        <span class="jl-main">Water</span>
        <span class="jl-wnum"><b>48</b> oz</span>
      </div>
      <div class="jl-bar"><i></i></div>
      <div class="jl-wfoot"><span>48 oz logged</span><span>Goal 80 oz</span></div>
    </div>

  </div>
</div>

<style>
  /* 390pt iPhone, scaled to the frame's 242px screen (242 / 390). */
  .jl { position: absolute; left: 0; top: 0; width: 390px; height: 842px; transform: scale(.62051); transform-origin: 0 0; background: #000; color: #f2f2f5; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased; overflow: hidden; }
  .jl :global(svg) { display: block; }

  .jl-head { height: 58px; display: flex; align-items: center; gap: 12px; padding: 0 14px; background: #040406; border-bottom: 1px solid rgba(255,255,255,.07); }
  .jl-chev { width: 24px; height: 24px; fill: none; stroke: #f2f2f5; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; flex: none; }
  .jl-date { flex: 1; height: 40px; border-radius: 14px; background: #1a1a1c; border: 1px solid #303034; display: flex; align-items: center; justify-content: center; font-size: 17px; font-weight: 600; }

  .jl-body { padding: 14px 16px 0; }
  .jl-card { border: 1px solid #303034; border-radius: 14px; background: #1a1a1c; margin-bottom: 12px; overflow: hidden; }
  .jl-sec { padding: 12px 16px; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: .6px; color: #9a9aa0; }
  .jl-rows { padding: 0 16px 14px; }
  .jl-row { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-top: .5px solid #303034; }
  .jl-ico { width: 26px; display: flex; justify-content: center; flex: none; }
  .jl-ico :global(svg) { width: 21px; height: 21px; fill: none; stroke: #9a9aa0; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  .jl-main { flex: 1; min-width: 0; display: flex; flex-direction: column; font-size: 16px; }
  .jl-main small { font-size: 13px; color: #9a9aa0; margin-top: 1px; }
  .jl-val { display: flex; align-items: center; font-size: 16px; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .jl-val i { width: 9px; height: 9px; border-radius: 50%; margin-right: 7px; }
  .jl-pill { margin-left: 6px; padding: 3px 10px; border-radius: 999px; background: #141416; border: 1px solid #303034; font-size: 13px; color: #9a9aa0; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .jl-add { margin-top: 6px; padding: 12px 0; border-radius: 12px; border: 1px solid #303034; background: #141416; text-align: center; font-size: 15px; font-weight: 600; }

  /* HydrationSection: WATER_BLUE figure in Manrope, regular unit, the bar on surface2. */
  .jl-water { display: flex; align-items: center; gap: 10px; padding: 0 14px; }
  .jl-water .jl-ico { width: auto; }
  .jl-wnum { font-size: 14px; color: #f2f2f5; font-variant-numeric: tabular-nums; }
  .jl-wnum b { font-family: Manrope, sans-serif; font-weight: 800; font-size: 20px; color: #4a9de0; }
  .jl-bar { height: 6px; margin: 12px 14px 0; border-radius: 9px; background: #141416; overflow: hidden; }
  .jl-bar i { display: block; width: 60%; height: 100%; border-radius: 9px; background: #4a9de0; }
  .jl-wfoot { display: flex; justify-content: space-between; padding: 8px 14px 14px; font-size: 13px; color: #9a9aa0; }
</style>
