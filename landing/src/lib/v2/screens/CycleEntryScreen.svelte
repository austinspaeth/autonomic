<!-- Drawn: the cycle entry card, opened from the Journal's Cycle card (a
     fitContent sheet, so it rises from the bottom at its own height). Sample:
     day 24, no flow, cramps and bloating ticked. From the app:
     features/cycle/CycleEntry.tsx (the 21/700 title, the Flow grid of four
     cards at 47% with FlowGlyph's four drops, the Symptoms chips in
     CYCLE_SYMPTOMS order, accent + accentSoft when chosen, DaySaveButton). -->
<script lang="ts">
  import JournalScreen from './JournalScreen.svelte';
  import PhoneChrome from './PhoneChrome.svelte';
  export let time = '9:41';
  export let battery = 1;
  const DROP = 'M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z';
  const flows = [['Spotting', 1], ['Light', 2], ['Medium', 3], ['Heavy', 4]] as const;
  const symptoms = [['Cramps', true], ['Bloating', true], ['Breast tenderness', false], ['Headache', false], ['Mood changes', false], ['Back pain', false]] as const;
</script>

<div class="ce" aria-hidden="true">
  <JournalScreen {time} {battery} score={74} grade="Good" gradeRgb="22,163,74" delta={-3} confidence={90} notice={null} cycle={{ day: 24, length: 29, label: 'Day 24 · Premenstrual', symptoms: 'Cramps, Bloating' }} />
  <div class="ce-top">
    <div class="ce-dim"></div>
    <PhoneChrome tabs={false} {time} {battery} />
    <div class="ce-sheet">
      <div class="ce-pill"><span><svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12" /></svg></span></div>
      <b class="ce-title">Cycle</b>
      <div class="ce-label">Flow</div>
      <div class="ce-flows">
        {#each flows as f}
          <div class="ce-flow">
            <span class="ce-drops">{#each [0, 1, 2, 3] as i}<svg viewBox="0 0 24 24"><path d={DROP} fill={i < f[1] ? '#9a9aa0' : 'none'} stroke="#9a9aa0" stroke-opacity={i < f[1] ? 1 : 0.45} stroke-width="2" stroke-linejoin="round" /></svg>{/each}</span>
            <b>{f[0]}</b>
          </div>
        {/each}
      </div>
      <div class="ce-label">Symptoms</div>
      <div class="ce-chips">
        {#each symptoms as c}<span class:on={c[1]}>{c[0]}</span>{/each}
      </div>
      <div class="ce-save">Save</div>
    </div>
  </div>
</div>

<style>
  .ce { position: absolute; inset: 0; overflow: hidden; }
  .ce-top { position: absolute; left: 0; top: 0; width: 390px; height: 842px; transform: scale(.62051); transform-origin: 0 0; color: #f2f2f5; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased; }
  .ce-top svg { display: block; }
  .ce-dim { position: absolute; inset: 0; background: rgba(0,0,0,.38); }
  /* fitContent: anchored to the bottom, as tall as what it holds. */
  .ce-sheet { position: absolute; left: 0; right: 0; bottom: 0; padding: 22px 16px 34px; background: #1a1a1c; border: 1px solid #303034; border-bottom: 0; border-radius: 18px 18px 0 0; box-shadow: 0 -10px 40px rgba(0,0,0,.5); }
  .ce-pill { position: absolute; top: 10px; right: 14px; padding: 5px; border-radius: 999px; border: 1px solid #46464e; }
  .ce-pill span { width: 36px; height: 36px; border-radius: 18px; background: #242427; display: flex; align-items: center; justify-content: center; }
  .ce-pill svg { width: 18px; height: 18px; fill: none; stroke: #9a9aa0; stroke-width: 2; stroke-linecap: round; }
  .ce-title { display: block; margin-bottom: 16px; font-size: 21px; font-weight: 700; }
  .ce-label { margin-bottom: 8px; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: .6px; color: #9a9aa0; }
  .ce-flows { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
  .ce-flow { flex: 1 1 47%; display: flex; align-items: center; gap: 10px; padding: 13px; border-radius: 12px; background: #242427; border: 1px solid #303034; }
  .ce-drops { width: 58px; display: flex; justify-content: center; gap: 2px; }
  .ce-drops svg { width: 12px; height: 12px; }
  .ce-flow b { font-size: 16px; font-weight: 600; }
  .ce-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; }
  .ce-chips span { padding: 8px 14px; border-radius: 999px; background: #242427; border: 1px solid #303034; font-size: 14px; font-weight: 500; color: #9a9aa0; }
  .ce-chips span.on { background: rgba(224,49,39,.12); border-color: #e03127; color: #f2f2f5; font-weight: 700; }
  .ce-save { padding: 15px 0; border-radius: 12px; background: #e03127; text-align: center; font-size: 16px; font-weight: 700; color: #fff; }
</style>
