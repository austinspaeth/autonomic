<!-- Drawn: Welltory's Today dashboard, redrawn from Welltory's own published
     screenshot for /compare/welltory/ (never their image file): the wellness
     banner, the Battery, Stress, Sleep and Activity tiles with their figures as
     published (35%, 66%, 6h 10min, 2h 13min), the stress insight and the tab
     bar. Their wording; nothing invented. Authored in iPhone POINTS like the
     other drawn screens, so it sits in the same Phone frame as ours. -->
<script lang="ts">
  import PhoneChrome from './PhoneChrome.svelte';
  export let time = '6:57';
</script>

<div class="wt" aria-hidden="true">
  <PhoneChrome tabs={false} {time} />
  <div class="wt-top">
    <span class="wt-menu"><i></i><i></i><i></i></span>
    <span class="wt-btns">
      <span class="wt-circ"><svg viewBox="0 0 24 24"><path d="M7 18V9M12 18V5M17 18v-7" /></svg></span>
      <span class="wt-circ plus"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg></span>
    </span>
  </div>

  <div class="wt-banner">
    <svg class="wt-heart" viewBox="0 0 40 36"><defs><radialGradient id="wtH" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#9ef06a" /><stop offset="1" stop-color="#2f9e3a" /></radialGradient></defs><path d="M20 34C8 25 2 18 2 11 2 5.5 6.5 2 11 2c4 0 7 2.5 9 5.5C22 4.5 25 2 29 2c4.5 0 9 3.5 9 9 0 7-6 14-18 23z" fill="url(#wtH)" /></svg>
    <span>Your long-term wellness scores are within your personal norm</span>
    <svg class="wt-chev" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg>
  </div>

  <div class="wt-grid">
    <div class="wt-tile">
      <svg class="wt-art" viewBox="0 0 172 172" preserveAspectRatio="none"><defs><linearGradient id="wtB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7d86ff" /><stop offset="1" stop-color="#3540b8" /></linearGradient><radialGradient id="wtBg" cx=".5" cy=".55" r=".6"><stop offset="0" stop-color="#8d95ff" stop-opacity=".55" /><stop offset="1" stop-color="#8d95ff" stop-opacity="0" /></radialGradient></defs><rect width="172" height="110" fill="url(#wtBg)" /><rect y="92" width="172" height="80" fill="url(#wtB)" /></svg>
      <b class="wt-t">Battery</b><svg class="wt-chev sm" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg>
      <span class="wt-v"><em>35<small>%</small></em><i>Holding strong</i></span>
    </div>
    <div class="wt-tile">
      <svg class="wt-art" viewBox="0 0 172 172"><defs><radialGradient id="wtS" cx=".5" cy=".1" r=".9"><stop offset="0" stop-color="#fff" /><stop offset=".35" stop-color="#ff7a52" /><stop offset="1" stop-color="#c2241a" /></radialGradient></defs><path d="M118 98 L48 70 A72 72 0 0 1 178 56 Z" fill="url(#wtS)" /><path d="M118 98 L178 56 A72 72 0 0 1 188 100 Z" fill="#3a3a3e" opacity=".85" /></svg>
      <b class="wt-t">Stress</b><svg class="wt-chev sm" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg>
      <span class="wt-v"><em>66<small>%</small></em><i>Elevated</i></span>
    </div>
    <div class="wt-tile">
      <svg class="wt-art" viewBox="0 0 172 172" preserveAspectRatio="none"><defs><linearGradient id="wtL" x1="0" x2="1"><stop offset="0" stop-color="#ff3d6e" /><stop offset=".5" stop-color="#ffcf3a" /><stop offset="1" stop-color="#ff3d6e" /></linearGradient></defs><path d="M0 56 C40 40 60 82 90 76 S140 44 172 52 V70 C140 62 120 96 90 94 S40 60 0 74 Z" fill="url(#wtL)" /><path d="M0 76 C40 62 60 100 90 96 S140 66 172 72 V90 C140 84 120 112 90 112 S40 80 0 92 Z" fill="#3a3a3e" opacity=".7" /></svg>
      <b class="wt-t">Sleep</b><svg class="wt-chev sm" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg>
      <span class="wt-v"><em>6<small>h</small> 10<small>min</small></em><i>Not enough rest</i></span>
    </div>
    <div class="wt-tile">
      <svg class="wt-art" viewBox="0 0 172 172"><defs><linearGradient id="wtA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff9a3c" /><stop offset=".55" stop-color="#c98a7a" /><stop offset="1" stop-color="#4f6de0" /></linearGradient></defs><path d="M10 172 L92 58 L180 172 Z" fill="url(#wtA)" /><circle cx="136" cy="54" r="12" fill="#fff" /><circle cx="136" cy="54" r="22" fill="#fff" opacity=".18" /></svg>
      <b class="wt-t">Activity</b><svg class="wt-chev sm" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg>
      <span class="wt-v"><em>2<small>h</small> 13<small>min</small></em><i>Perfect day</i></span>
    </div>
  </div>

  <div class="wt-ins">
    <span class="wt-chip">Stress Insight</span>
    <b>Stress is building, move before it sets</b>
    <p>Your body has a limited time to clear stress through movement.</p>
  </div>

  <div class="wt-tabs">
    <span class="on"><svg viewBox="0 0 24 24"><path d="M12 3l2 5.5 5.5 2-5.5 2L12 18l-2-5.5L4.5 10.5l5.5-2z" /></svg>Today</span>
    <span><svg viewBox="0 0 24 24"><path d="M5 4h10l4 4v12H5z" /></svg>Journal</span>
    <span class="mid"><i><svg viewBox="0 0 24 24"><path d="M3 12h4l2-5 4 10 2-5h6" /></svg></i></span>
    <span><svg viewBox="0 0 24 24"><circle cx="9" cy="12" r="5" /><circle cx="16" cy="10" r="4" /></svg>Echo</span>
    <span><svg viewBox="0 0 24 24"><path d="M6 19v-6M12 19V5M18 19v-9" /></svg>Trends</span>
  </div>
</div>

<style>
  .wt { position: absolute; left: 0; top: 0; width: 390px; height: 842px; transform: scale(.62051); transform-origin: 0 0; overflow: hidden; background: #000; color: #fff; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased; }
  .wt svg { display: block; }
  .wt-top { display: flex; align-items: center; justify-content: space-between; padding: 64px 20px 0 22px; }
  .wt-menu { display: flex; flex-direction: column; gap: 6px; }
  .wt-menu i { width: 24px; height: 2px; border-radius: 1px; background: #8e8e93; }
  .wt-btns { display: flex; gap: 10px; }
  .wt-circ { width: 38px; height: 38px; border-radius: 19px; background: #3a3a3e; display: flex; align-items: center; justify-content: center; }
  .wt-circ svg { width: 20px; height: 20px; fill: none; stroke: #c7c7cc; stroke-width: 2.2; stroke-linecap: round; }
  .wt-circ.plus { background: linear-gradient(180deg, #ffb13d, #ff7a1a); }
  .wt-circ.plus svg { stroke: #1a1a1a; stroke-width: 2.6; }
  .wt-banner { display: flex; align-items: center; gap: 14px; margin: 18px 12px 0; padding: 14px 16px; border-radius: 26px; background: #1a1a1c; }
  .wt-heart { width: 40px; height: 36px; flex: none; }
  .wt-banner span { flex: 1; font-size: 14px; line-height: 19px; color: #d1d1d6; }
  .wt-chev { width: 18px; height: 18px; fill: none; stroke: #8e8e93; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; flex: none; }
  .wt-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin: 6px 12px 0; }
  .wt-tile { position: relative; height: 180px; border-radius: 26px; background: #1a1a1c; overflow: hidden; }
  .wt-art { position: absolute; inset: 0; width: 100%; height: 100%; }
  .wt-t { position: absolute; left: 18px; top: 16px; font-size: 18px; font-weight: 500; }
  .wt-chev.sm { position: absolute; right: 16px; top: 18px; width: 16px; height: 16px; }
  .wt-v { position: absolute; left: 18px; bottom: 16px; display: flex; flex-direction: column; text-shadow: 0 1px 10px rgba(0,0,0,.35); }
  .wt-v em { font-style: normal; font-size: 32px; font-weight: 700; letter-spacing: -.5px; line-height: 1.1; }
  .wt-v small { font-size: 20px; font-weight: 600; }
  .wt-v i { font-style: normal; font-size: 14px; color: #e5e5ea; margin-top: 2px; }
  .wt-ins { margin: 6px 12px 0; padding: 18px 20px 120px; border-radius: 26px; background: #1a1a1c; }
  .wt-chip { display: inline-block; padding: 4px 10px; border-radius: 8px; background: #3d1414; color: #ff5a4a; font-size: 13px; font-weight: 600; }
  .wt-ins b { display: block; margin-top: 14px; font-size: 25px; font-weight: 700; line-height: 31px; letter-spacing: -.3px; }
  .wt-ins p { margin: 14px 0 0; font-size: 15px; line-height: 21px; color: #aeaeb2; }
  .wt-tabs { position: absolute; left: 18px; right: 18px; bottom: 26px; height: 62px; display: flex; align-items: center; justify-content: space-around; border-radius: 31px; background: rgba(40,40,44,.92); box-shadow: 0 0 0 1px rgba(255,255,255,.06); }
  .wt-tabs span { display: flex; flex-direction: column; align-items: center; gap: 3px; font-size: 11px; color: #aeaeb2; }
  .wt-tabs svg { width: 22px; height: 22px; fill: none; stroke: #aeaeb2; stroke-width: 1.8; stroke-linejoin: round; stroke-linecap: round; }
  .wt-tabs span.on { color: #fff; }
  .wt-tabs span.on svg { fill: #c9c4ff; stroke: #e6e2ff; }
  .wt-tabs .mid i { width: 46px; height: 46px; border-radius: 23px; background: radial-gradient(circle at 40% 35%, #ff6b7a, #e0243c); display: flex; align-items: center; justify-content: center; }
  .wt-tabs .mid svg { stroke: #fff; stroke-width: 2.2; }
</style>
