<script lang="ts">
  /*
   * The Journal tab, as a picture. Shared by the landing hero phone and the
   * blog sidebar's mini phone, so the two can never show different apps.
   *
   * Authored in the app's own POINTS (a 402pt-wide iPhone screen) with the
   * numbers lifted straight from mobile/src/features/DaySummary.tsx,
   * budget/Strip.tsx, JournalSections.tsx and the tab bar, then scaled into its
   * frame with `zoom`. Keeping the source units is what keeps it faithful: a
   * change in the app is a change to one number here, not a re-derivation at
   * two different scales.
   *
   * The day shown is internally consistent with the app's own rules: 88 is
   * Excellent (SCORE_CATS), the guidance is OUTLOOK_GUIDE.Excellent verbatim,
   * the delta names its 7-day window, pacing reads "left of" a firm ceiling
   * (hm() pads the minutes) and is behind its pace marker, so the fill is green.
   */
  import { APP_MARK_PATH } from './site';

  /** Frame width divided by 402. */
  export let zoom = 1;
  /** Screen height in app points. */
  export let height = 874;
</script>

<div class="jm" style="zoom:{zoom};height:{height}px" aria-hidden="true">
  <!-- Status bar + date header -->
  <div class="jm-head">
    <div class="jm-status">
      <span class="jm-clock">12:40</span>
      <span class="jm-island"></span>
      <span class="jm-sys">
        <svg width="19" height="12" viewBox="0 0 19 12"><rect x="0" y="8" width="3.2" height="4" rx="1" fill="currentColor"/><rect x="5.2" y="5.5" width="3.2" height="6.5" rx="1" fill="currentColor"/><rect x="10.4" y="3" width="3.2" height="9" rx="1" fill="currentColor"/><rect x="15.6" y="0" width="3.2" height="12" rx="1" fill="currentColor"/></svg>
        <svg width="17" height="12" viewBox="0 0 16 12"><path d="M8 10.6 5.9 8.4a3 3 0 0 1 4.2 0zM3.8 6.3a6 6 0 0 1 8.4 0l1.3-1.4a8 8 0 0 0-11 0zM1.6 4a9.2 9.2 0 0 1 12.8 0l1.3-1.4a11.1 11.1 0 0 0-15.4 0z" fill="currentColor"/></svg>
        <svg width="27" height="13" viewBox="0 0 27 12"><rect x="0.5" y="0.5" width="22" height="11" rx="3.2" fill="none" stroke="currentColor" stroke-opacity="0.4"/><rect x="2" y="2" width="19" height="8" rx="2" fill="currentColor"/><path d="M24.2 4.2v3.6a2 2 0 0 0 0-3.6z" fill="currentColor" fill-opacity="0.4"/></svg>
      </span>
    </div>
    <div class="jm-datebar">
      <span class="jm-arw">‹</span>
      <span class="jm-date">Today</span>
      <span class="jm-arw jm-arw-off">›</span>
    </div>
  </div>

  <div class="jm-body">
    <!-- Autonomic Outlook -->
    <div class="jm-outlook">
      <div class="jm-between">
        <span class="jm-section">Autonomic Outlook</span>
        <span class="jm-tagwrap">
          <span class="jm-info">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(242,242,245,0.72)" stroke-width="1.9" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
          </span>
          <span class="jm-grade">Excellent</span>
        </span>
      </div>

      <div class="jm-gauge">
        <svg width="176" height="176" viewBox="0 0 176 176">
          <path d="M35.67 140.33 A74 74 0 1 1 140.33 140.33" fill="none" stroke="rgba(0,0,0,0.4)" stroke-width="12" stroke-linecap="round"/>
          <path d="M35.67 140.33 A74 74 0 1 1 160.22 104.14" fill="none" stroke="#2ee06a" stroke-width="19" stroke-linecap="round" opacity="0.16"/>
          <path d="M35.67 140.33 A74 74 0 1 1 160.22 104.14" fill="none" stroke="#2ee06a" stroke-width="12" stroke-linecap="round"/>
        </svg>
        <div class="jm-gauge-in">
          <div class="jm-num jm-score">88</div>
          <div class="jm-delta"><b>▲ 10</b><span>vs 7d avg</span></div>
        </div>
      </div>
      <div class="jm-conf">94% confidence</div>
      <p class="jm-guide">Strong baseline with reserves to spare. A good day for your full protocol.</p>

      <!-- Pacing strip -->
      <div class="jm-pacing">
        <div class="jm-pc-top">
          <span class="jm-pc-label">Pacing</span>
          <span class="jm-num jm-pc-fig">2h 50m</span>
          <span class="jm-pc-sub">left of 4h 10m</span>
        </div>
        <div class="jm-pc-row">
          <span class="jm-bar">
            <i class="jm-fill"></i>
            <i class="jm-mark"></i>
            <i class="jm-tri"></i>
          </span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(154,154,160,0.8)" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
        </div>
        <div class="jm-pc-note">Behind pace for 12:40pm, which leaves room</div>
      </div>

      <!-- The three key figures -->
      <div class="jm-figs">
        <div class="jm-fig"><div class="jm-fig-v"><b class="jm-num" style="color:#2ee06a">42</b><span>ms</span></div><div class="jm-fig-l">HRV</div></div>
        <div class="jm-fig"><div class="jm-fig-v"><b class="jm-num" style="color:#16a34a">58</b><span>bpm</span></div><div class="jm-fig-l">Resting HR</div></div>
        <div class="jm-fig"><div class="jm-fig-v"><b class="jm-num" style="color:#2ee06a">7h 48m</b></div><div class="jm-fig-l">Sleep</div></div>
      </div>
    </div>

    <!-- Clean-day streak -->
    <div class="jm-card jm-rowcard">
      <span class="jm-ic" style="background:rgba(249,115,22,0.14)">
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.6 4.6L18 9.2l-4.4 1.6L12 15.4l-1.6-4.6L6 9.2l4.4-1.6z"/><path d="M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8z"/></svg>
      </span>
      <span class="jm-grow">
        <span class="jm-streak"><b>2</b>&nbsp;clean days · <em>Building</em></span>
        <span class="jm-s">Clean day. Streak continues.</span>
      </span>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9a9aa0" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
    </div>

    <!-- Sleep section (JournalSections SleepSection + SleepGrade). Stages sum to
         the 7h 48m on the Outlook's Sleep tile, and both grade Excellent. -->
    <div class="jm-sec">
      <div class="jm-sec-h">Sleep</div>
      <div class="jm-sec-in">
        <div class="jm-night">
          <div class="jm-night-top">
            <span class="jm-night-l">Last night</span>
            <span class="jm-night-g">Excellent</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9a9aa0" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          </div>
          <div class="jm-night-big"><b class="jm-num">7.8</b><span>hrs asleep</span></div>
          <div class="jm-night-sub">11:24pm → 7:30am · HR 52–78 bpm</div>
          <div class="jm-stages"><i style="flex-grow:102;background:#8b5cf6"></i><i style="flex-grow:89;background:#3d93ee"></i><i style="flex-grow:277;background:#2f66d0"></i><i style="flex-grow:18;background:#71717a"></i></div>
          <div class="jm-legend">
            <span><i style="background:#8b5cf6"></i>Deep 1h 42m</span>
            <span><i style="background:#3d93ee"></i>REM 1h 29m</span>
            <span><i style="background:#2f66d0"></i>Core 4h 37m</span>
            <span><i style="background:#71717a"></i>Awake 18m</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Floating tab bar -->
  <div class="jm-tabs">
    <span class="jm-brand"><svg width="37" height="20" viewBox="0 0 651.59 348.34"><path d={APP_MARK_PATH} fill="#e03127"/></svg></span>
    <span class="jm-tab on">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1H9zM9 11h6M9 15h4"/></svg>
      <b>Journal</b>
    </span>
    <span class="jm-tab">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 16v-4M12 16V8M16 16v-6"/></svg>
      <b>Progress</b>
    </span>
    <span class="jm-tab">
      <span class="jm-tab-ic">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.4 4.1L17.5 8l-3.6 1.4L12 13l-1.9-3.6L6.5 8l4.1-.9zM18.5 14l.8 2.3 2.2.8-2.2.8-.8 2.3-.8-2.3-2.2-.8 2.2-.8zM5 15l.6 1.6L7 17l-1.4.4L5 19l-.6-1.6L3 17l1.4-.4z"/></svg>
        <i class="jm-dot"></i>
      </span>
      <b>Insight</b>
    </span>
    <span class="jm-tab jm-cog">
      <svg width="22" height="22" viewBox="0 0 24 24"><path fill="currentColor" fill-rule="evenodd" d="M19.4 13.5a7.7 7.7 0 0 0 0-3l2-1.5-2-3.4-2.3.9a7.6 7.6 0 0 0-2.6-1.5L14.1 2.5h-4.2l-.4 2.5A7.6 7.6 0 0 0 6.9 6.5l-2.3-.9-2 3.4 2 1.5a7.7 7.7 0 0 0 0 3l-2 1.5 2 3.4 2.3-.9a7.6 7.6 0 0 0 2.6 1.5l.4 2.5h4.2l.4-2.5a7.6 7.6 0 0 0 2.6-1.5l2.3.9 2-3.4zM12 15.3a3.3 3.3 0 1 0 0-6.6 3.3 3.3 0 0 0 0 6.6z"/></svg>
    </span>
  </div>
</div>

<style>
  .jm {
    position: relative; width: 402px; overflow: hidden;
    background: #000; color: #f2f2f5; text-align: left; line-height: normal;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .jm-num { font-family: Manrope, "Space Grotesk", -apple-system, sans-serif; font-weight: 800; font-variant-numeric: tabular-nums; }

  /* Header */
  .jm-head { height: 127px; background: #0d0d0e; border-bottom: 1px solid rgba(255,255,255,0.07); }
  .jm-status { position: relative; height: 62px; display: flex; align-items: center; justify-content: space-between; padding: 6px 30px 0 56px; }
  .jm-clock { font-size: 17px; font-weight: 600; letter-spacing: -0.2px; }
  .jm-island { position: absolute; left: 50%; top: 11px; width: 124px; height: 36px; margin-left: -62px; border-radius: 999px; background: #000; }
  .jm-sys { display: inline-flex; align-items: center; gap: 6px; }
  .jm-datebar { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 0 16px; }
  .jm-arw { width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; font-size: 25px; color: #f2f2f5; }
  .jm-arw-off { opacity: 0.3; }
  .jm-date {
    flex: 1; max-width: 280px; text-align: center;
    background: #1a1a1c; border: 1px solid #303034; border-radius: 14px;
    padding: 10px 14px; font-size: 17px; font-weight: 600; color: #e03127;
  }

  .jm-body { padding: 15px 16px 0; }

  /* The Outlook: dark surface, the grade lighting its top-left corner and border */
  .jm-outlook {
    margin-bottom: 12px; padding: 16px; border-radius: 14px; border: 1px solid transparent;
    background:
      radial-gradient(ellipse 80% 90% at 0 0, rgba(46,224,106,0.10) 0%, rgba(46,224,106,0.032) 40%, rgba(46,224,106,0) 100%) padding-box,
      linear-gradient(#1a1a1c, #1a1a1c) padding-box,
      linear-gradient(162deg, #2ee06a 0%, rgba(46,224,106,0.4) 14%, #303034 100%) border-box;
  }
  .jm-between { display: flex; align-items: center; justify-content: space-between; }
  .jm-section { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: #9a9aa0; }
  .jm-tagwrap { display: flex; align-items: center; gap: 8px; }
  .jm-info { width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; }
  .jm-grade {
    height: 26px; display: flex; align-items: center; padding: 0 12px; border-radius: 999px;
    background: #2ee06a; color: #fff; font-size: 13px; font-weight: 800; text-transform: uppercase;
  }
  .jm-gauge { position: relative; width: 176px; height: 176px; margin: 8px auto; }
  .jm-gauge svg { position: absolute; inset: 0; }
  .jm-gauge-in { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .jm-score { font-size: 57px; line-height: 62px; letter-spacing: -1px; margin-top: 13px; }
  .jm-delta { display: flex; align-items: center; gap: 4px; margin-top: 2px; font-size: 12px; line-height: 14px; }
  .jm-delta b { font-weight: 800; color: #16a34a; font-variant-numeric: tabular-nums; }
  .jm-delta span { font-weight: 600; color: #9a9aa0; }
  .jm-conf { text-align: center; font-size: 14px; font-weight: 600; color: #9a9aa0; margin-top: -14px; }
  .jm-guide { margin: 14px 0 0; font-size: 15px; line-height: 21px; color: #f2f2f5; }

  /* Pacing strip */
  .jm-pacing { border-top: 1px solid #2a2a2e; margin-top: 14px; padding-top: 12px; }
  .jm-pc-top { display: flex; align-items: baseline; gap: 7px; margin-bottom: 9px; white-space: nowrap; }
  .jm-pc-label { font-size: 14.5px; font-weight: 700; letter-spacing: 0.9px; text-transform: uppercase; color: #9a9aa0; }
  .jm-pc-fig { font-size: 14.5px; color: #f2f2f5; }
  .jm-pc-sub { font-size: 12.5px; color: #9a9aa0; }
  .jm-pc-row { display: flex; align-items: center; gap: 11px; }
  .jm-bar { position: relative; flex: 1; height: 12px; border-radius: 999px; background: rgba(242,242,245,0.06); }
  .jm-bar i { position: absolute; display: block; }
  .jm-fill {
    left: 0; top: 0; bottom: 0; width: 32%; border-radius: 999px; background: #16a34a;
    box-shadow: 0 0 0 3px rgba(22,163,74,0.16), 0 0 6px rgba(22,163,74,0.45);
  }
  .jm-mark { left: 38%; top: -4px; bottom: -4px; width: 2px; margin-left: -1px; border-radius: 999px; background: rgba(242,242,245,0.84); }
  .jm-tri {
    left: 38%; top: 14px; margin-left: -5px; width: 0; height: 0;
    border-left: 5px solid transparent; border-right: 5px solid transparent; border-bottom: 6px solid rgba(242,242,245,0.84);
  }
  .jm-pc-note { margin-top: 14px; font-size: 12.5px; color: #9a9aa0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* Key figures */
  .jm-figs { display: flex; gap: 8px; border-top: 1px solid #2a2a2e; margin-top: 16px; padding-top: 14px; }
  /* Padding and box are re-balanced from the RN numbers: a web line box puts
     Manrope's digits lower than Yoga does, so these land the ink where the app's does. */
  .jm-fig { flex: 1; min-width: 0; background: #141416; border: 1px solid #303034; border-radius: 14px; padding: 8px 9px 5px; }
  .jm-fig-v { display: flex; align-items: baseline; height: 24px; margin-bottom: 2px; white-space: nowrap; }
  .jm-fig-v b { font-size: 21px; line-height: 21px; }
  .jm-fig-v span { font-size: 11px; font-weight: 600; color: #9a9aa0; margin-left: 2px; }
  .jm-fig-l { font-size: 11.5px; line-height: 15px; color: #9a9aa0; }

  /* Plain cards */
  .jm-card { margin-bottom: 12px; padding: 15px; border-radius: 14px; background: #1a1a1c; border: 1px solid #303034; }
  .jm-rowcard { display: flex; align-items: center; gap: 13px; }
  .jm-ic { flex: none; width: 42px; height: 42px; border-radius: 9px; display: flex; align-items: center; justify-content: center; font-size: 21px; }
  .jm-grow { flex: 1; min-width: 0; display: block; }
  .jm-s { display: block; font-size: 13px; color: #9a9aa0; margin-top: 2px; }
  .jm-streak { display: block; font-size: 15px; }
  .jm-streak b { font-weight: 800; }
  .jm-streak em { font-style: normal; font-weight: 600; color: #9a9aa0; }

  /* Sleep section */
  .jm-sec { margin-bottom: 12px; border-radius: 14px; background: #1a1a1c; border: 1px solid #303034; overflow: hidden; }
  .jm-sec-h { padding: 12px 16px; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: #9a9aa0; }
  .jm-sec-in { padding: 0 14px 14px; }
  .jm-night { padding: 14px; border-radius: 14px; background: #242427; border: 1px solid #303034; }
  .jm-night-top { display: flex; align-items: center; gap: 8px; }
  .jm-night-l { flex: 1; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: #9a9aa0; }
  .jm-night-g { padding: 4px 11px; border-radius: 999px; background: #2ee06a; color: #fff; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.4px; }
  .jm-night-big { display: flex; align-items: baseline; margin-top: 6px; }
  .jm-night-big b { font-size: 38px; line-height: 44px; }
  .jm-night-big span { font-size: 16px; font-weight: 700; color: #9a9aa0; margin-left: 6px; }
  .jm-night-sub { font-size: 13px; color: #9a9aa0; margin-top: 4px; }
  .jm-stages { display: flex; gap: 2px; height: 10px; margin-top: 12px; }
  .jm-stages i { flex-basis: 0; border-radius: 3px; }
  .jm-legend { display: flex; flex-wrap: wrap; column-gap: 16px; row-gap: 6px; margin-top: 10px; }
  .jm-legend span { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 500; }
  .jm-legend i { width: 9px; height: 9px; border-radius: 2.5px; }

  /* Tab bar */
  .jm-tabs {
    /* Scaled up from its bottom edge so it reads as wide as the cards above it
       (unscaled it was ~340pt against their 370pt), and seated low on the screen. */
    position: absolute; left: 50%; bottom: 16px;
    transform: translateX(-50%) scale(1.12); transform-origin: 50% 100%;
    /* Positioned from the centre, so without this it shrinks to half the screen
       and squeezes the brand mark and cog out of existence. */
    width: max-content;
    display: flex; align-items: center; gap: 2px; padding: 5px; border-radius: 999px;
    background: rgba(6,6,9,0.82); border: 1px solid rgba(255,255,255,0.14);
    box-shadow: 0 14px 30px -12px rgba(0,0,0,0.95);
    backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
  }
  .jm-brand { flex: none; display: flex; align-items: center; padding: 0 6px 0 8px; margin-right: 6px; }
  .jm-tab { flex: none; display: flex; flex-direction: column; align-items: center; padding: 8px 14px; border-radius: 999px; color: #9a9aa0; }
  .jm-tab b { font-size: 11px; font-weight: 600; margin-top: 3px; }
  .jm-tab.on { background: rgba(255,255,255,0.14); color: #f2f2f5; }
  .jm-tab-ic { position: relative; display: block; height: 22px; }
  .jm-dot { position: absolute; top: -2px; right: -5px; width: 7px; height: 7px; border-radius: 999px; background: #a78bfa; }
  .jm-cog { align-self: stretch; justify-content: center; }
</style>
