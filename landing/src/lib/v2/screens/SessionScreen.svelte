<!-- Drawn and ANIMATED: a live Training HRV reading (4 / 6 paced breathing on
     a chest strap), as the app's session card renders it. Authored in iPhone
     POINTS (390 wide) and scaled into the frame's 242px screen, like
     JournalScreen. Every size is the app's own: the card from
     features/hrv/Session.tsx (header pills, the R96 progress ring, the phase
     word, the 46pt timer, the Finish now footer), the rings from
     BreathingViz.tsx (six rings lighting with the breath), and the live cards
     from LiveStats.tsx (EMA-smoothed heart rate and SDNN sparklines, the RAW
     beat-to-beat trace with its fading gradient and signal dot).

     The site ships no framework runtime, so this renders one still frame and
     the home page's inline script (homeScript.ts, "live session") drives it:
     a simulated strap beats with breath-driven heart rate swings, and every
     number and trace on the card is computed from those beats. -->
<script lang="ts">
  import JournalScreen from './JournalScreen.svelte';
  import PhoneChrome from './PhoneChrome.svelte';
  export let time = '7:02';
  export let battery = 1;

  // Session.tsx ring: R 96, stroke 8. BreathingViz: viewBox 190, six rings 14..84.
  const R = 96, SW = 8, RING = 2 * (R + SW), C = 2 * Math.PI * R;
  const RINGS = Array.from({ length: 6 }, (_, i) => 14 + (84 - 14) * (i / 5));
  const START_ELAPSED = 100, DURATION = 300; // the still frame: 3:20 left
  const frac = START_ELAPSED / DURATION;
</script>

<div class="lv" aria-hidden="true">
  <JournalScreen {time} {battery} />
  <div class="lv-top" data-live-session data-start={START_ELAPSED} data-duration={DURATION}>
    <div class="lv-dim"></div>
    <PhoneChrome tabs={false} {time} {battery} />
    <div class="lv-sheet">
      <div class="lv-head">
        <span class="lv-pill"><span><svg viewBox="0 0 24 24"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" /></svg></span></span>
        <b>Training</b>
        <span class="lv-pill"><span><svg viewBox="0 0 24 24"><path d="M9.9 4.2A9.7 9.7 0 0 1 12 4c5.5 0 9 5.5 10 8a17 17 0 0 1-2.2 3.4M6.6 6.6C4.2 8.1 2.7 10.4 2 12c1 2.5 4.5 8 10 8 1.8 0 3.4-.6 4.8-1.4M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18" /></svg></span></span>
      </div>

      <div class="lv-ring">
        <svg class="lv-ring-svg" viewBox="0 0 {RING} {RING}" width={RING} height={RING}>
          <circle cx={R + SW} cy={R + SW} r={R} stroke="#242427" stroke-width={SW} fill="none" />
          <circle class="lv-prog" cx={R + SW} cy={R + SW} r={R} stroke="#e03127" stroke-width={SW} fill="none" stroke-linecap="round" stroke-dasharray={C} stroke-dashoffset={C * (1 - frac)} transform="rotate(-90 {R + SW} {R + SW})" data-c={C} />
        </svg>
        <svg class="lv-viz" viewBox="0 0 190 190" width="168" height="168">
          {#each RINGS as r, i}
            <circle cx="95" cy="95" r={r} stroke="#303034" stroke-width="2" fill="none" opacity=".35" />
            <circle class="lv-r" cx="95" cy="95" r={r} stroke="#e03127" fill="none" stroke-width={i < 3 ? 5 : 2} opacity={i < 3 ? 1 : 0.12} />
          {/each}
        </svg>
      </div>

      <p class="lv-phase">Breathe in</p>
      <p class="lv-time">3:20</p>

      <div class="lv-stats">
        <div class="lv-tiles">
          <div class="lv-tile">
            <span class="lv-lab">Heart rate</span>
            <span class="lv-val"><b class="lv-hr red">64</b><small>bpm</small></span>
            <svg viewBox="0 0 150 24" preserveAspectRatio="none"><path class="lv-hr-spark" stroke="#e03127" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity=".85" d="M0 12 L150 12" /><circle class="lv-hr-head" cx="150" cy="12" r="2.2" fill="#e03127" /></svg>
          </div>
          <div class="lv-tile">
            <span class="lv-lab">SDNN</span>
            <span class="lv-val"><b class="lv-sdnn">58</b><small>ms</small></span>
            <svg viewBox="0 0 150 24" preserveAspectRatio="none"><path class="lv-sdnn-spark" stroke="#9a9aa0" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity=".85" d="M0 12 L150 12" /><circle class="lv-sdnn-head" cx="150" cy="12" r="2.2" fill="#9a9aa0" /></svg>
          </div>
        </div>
        <div class="lv-rr">
          <div class="lv-rr-top"><span class="lv-lab">Beat to beat</span><span class="lv-sig"><i></i><span class="lv-beats">Clean · 104 beats</span></span></div>
          <svg viewBox="0 0 320 88" preserveAspectRatio="none">
            <defs>
              <linearGradient id="lvFade" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stop-color="#e03127" stop-opacity=".15" />
                <stop offset="45%" stop-color="#e03127" stop-opacity=".65" />
                <stop offset="100%" stop-color="#e03127" stop-opacity="1" />
              </linearGradient>
            </defs>
            <path class="lv-rr-path" stroke="url(#lvFade)" stroke-width="1.9" fill="none" stroke-linecap="round" stroke-linejoin="round" d="M0 44 L320 44" />
            <circle class="lv-rr-head" cx="320" cy="44" r="3.2" fill="#e03127" stroke="#141416" stroke-width="2" />
          </svg>
        </div>
      </div>

      <div class="lv-foot"><span>Finish now</span></div>
    </div>
  </div>
</div>

<style>
  .lv { position: absolute; inset: 0; overflow: hidden; }
  .lv-top { position: absolute; left: 0; top: 0; width: 390px; height: 842px; transform: scale(.62051); transform-origin: 0 0; color: #f2f2f5; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased; }
  .lv-top svg { display: block; }
  .lv-dim { position: absolute; inset: 0; background: rgba(0,0,0,.38); }
  .lv-sheet { position: absolute; left: 0; right: 0; bottom: 0; height: 775px; padding: 26px 18px 0; display: flex; flex-direction: column; align-items: center; background: #1a1a1c; border: 1px solid #303034; border-bottom: 0; border-radius: 18px 18px 0 0; overflow: hidden; box-shadow: 0 -10px 40px rgba(0,0,0,.5); }

  /* Header (HEADER_H 52): minimize pill, the one-word title, the eye pill. */
  .lv-head { width: 100%; height: 52px; display: flex; align-items: center; justify-content: space-between; }
  .lv-head b { font-size: 16px; font-weight: 800; letter-spacing: 1.4px; text-transform: uppercase; color: #9a9aa0; }
  .lv-pill { padding: 5px; border-radius: 999px; border: 1px solid #46464e; }
  .lv-pill span { width: 36px; height: 36px; border-radius: 18px; background: #242427; display: flex; align-items: center; justify-content: center; }
  .lv-pill svg { width: 16px; height: 16px; fill: none; stroke: #9a9aa0; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }

  .lv-ring { position: relative; width: 208px; height: 208px; margin-top: 12px; display: flex; align-items: center; justify-content: center; }
  .lv-ring-svg { position: absolute; inset: 0; }
  .lv-phase { margin: 12px 0 0; font-size: 18px; font-weight: 700; letter-spacing: .3px; color: #e03127; }
  .lv-time { margin: 4px 0 0; font-family: Manrope, sans-serif; font-weight: 800; font-size: 46px; line-height: 56px; font-variant-numeric: tabular-nums; }

  /* LiveStats: two sunk tiles over the beat-to-beat card. */
  .lv-stats { width: 100%; margin-top: 14px; display: flex; flex-direction: column; gap: 10px; }
  .lv-tiles { display: flex; gap: 10px; }
  .lv-tile, .lv-rr { background: #141416; border-radius: 18px; }
  .lv-tile { flex: 1; padding: 12px 14px 10px; }
  .lv-tile svg { width: 100%; height: 24px; margin-top: 7px; }
  .lv-lab { font-size: 11px; font-weight: 700; letter-spacing: .8px; text-transform: uppercase; color: #9a9aa0; }
  .lv-val { display: flex; align-items: baseline; gap: 4px; margin-top: 5px; }
  .lv-val b { font-family: Manrope, sans-serif; font-weight: 800; font-size: 29px; line-height: 34px; font-variant-numeric: tabular-nums; }
  .lv-val b.red { color: #e03127; }
  .lv-val small { font-size: 12px; color: #9a9aa0; }
  .lv-rr { padding: 11px 14px 9px; }
  .lv-rr-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
  .lv-sig { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: #9a9aa0; }
  .lv-sig i { width: 6px; height: 6px; border-radius: 999px; background: #16a34a; }
  .lv-rr svg { width: 100%; height: 88px; }

  .lv-foot { position: absolute; left: 0; right: 0; bottom: 0; padding: 12px 18px 34px; background: #1a1a1c; border-top: .5px solid #303034; }
  .lv-foot span { display: block; padding: 13px 0; border-radius: 10px; background: #e03127; text-align: center; font-size: 16px; font-weight: 600; line-height: 20px; color: #fff; }
</style>
