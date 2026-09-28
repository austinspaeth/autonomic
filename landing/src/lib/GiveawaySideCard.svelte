<script lang="ts">
  import { giveawayUrl } from './site';
  import GiveawayRibbon from './GiveawayRibbon.svelte';
  import PrizeWatchArt from './PrizeWatchArt.svelte';
  import PrizeStrapArt from './PrizeStrapArt.svelte';
</script>

<!-- Blog sidebar version of the home page's giveaway banner. The whole card is
     one link; desktop only (hidden once the sidebar drops below the articles). -->
<a class="gvs" href={giveawayUrl}>
  <span class="gvs-glow" aria-hidden="true"></span>
  <span class="gvs-body">
    <span class="gvs-eyebrow">
      <span class="gvs-ribbon"><GiveawayRibbon /></span>
      <span class="gvs-kicker">Dysautonomia<br />Awareness Month</span>
    </span>
    <span class="gvs-title">This October, your daily reading enters you to win.</span>
    <span class="gvs-sub">One entry for every day you take an HRV reading, up to 10. Other prizes available.</span>
    <span class="gvs-prizes">
      <span class="gvs-prize">
        <span class="gvs-art"><span class="gvs-watch"><PrizeWatchArt /></span></span>
        <span class="gvs-meta">
          <span class="gvs-tag">iPhone</span>
          <span class="gvs-name">Apple Watch Series 12</span>
        </span>
      </span>
      <span class="gvs-prize">
        <span class="gvs-art"><span class="gvs-strap"><PrizeStrapArt /></span></span>
        <span class="gvs-meta">
          <span class="gvs-tag">Android</span>
          <span class="gvs-name">Polar H10 strap</span>
        </span>
      </span>
    </span>
    <span class="gvs-btn">
      Learn more
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
    </span>
    <span class="gvs-fine">Free to enter · No purchase necessary<br />No health data collected</span>
  </span>
</a>

<style>
  .gvs {
    position: relative; display: block; overflow: hidden;
    background: #0c1010; border: 1px solid rgba(45,212,191,0.22);
    border-radius: var(--r); padding: 20px 18px 18px;
    color: var(--text); text-decoration: none;
    transition: border-color 0.2s;
  }
  .gvs:hover { border-color: rgba(45,212,191,0.44); }
  .gvs-glow {
    position: absolute; left: 50%; top: -150px; width: 360px; height: 300px; margin-left: -180px;
    border-radius: 999px; background: radial-gradient(closest-side, rgba(45,212,191,0.15), rgba(45,212,191,0));
    pointer-events: none;
  }
  .gvs-body { position: relative; display: block; }
  .gvs-eyebrow { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
  .gvs-ribbon { flex: none; width: 20px; height: 28px; }
  .gvs-kicker {
    font-size: 10.5px; font-weight: 700; letter-spacing: 0.13em; text-transform: uppercase;
    color: #5eead4; line-height: 1.35;
  }
  .gvs-title {
    display: block; font-family: var(--display); font-size: 23px; font-weight: 700;
    letter-spacing: -0.025em; line-height: 1.12; margin-bottom: 8px; text-wrap: balance;
  }
  .gvs-sub { display: block; font-size: 13.5px; line-height: 1.5; color: #a8a8b0; margin-bottom: 16px; text-wrap: pretty; }
  .gvs-prizes { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px; }
  .gvs-prize {
    display: block; background: #0b0b0c; border: 1px solid rgba(255,255,255,0.05);
    border-radius: 14px; padding: 6px 6px 10px;
  }
  .gvs-art {
    height: 92px; border-radius: 10px; margin-bottom: 8px; overflow: hidden;
    background: radial-gradient(ellipse 70% 60% at 50% 45%, #1d1f22 0%, #0b0b0c 80%);
    display: flex; align-items: center; justify-content: center;
  }
  .gvs-watch { display: block; height: 84px; }
  .gvs-strap { display: block; width: 120px; height: 62px; flex: none; }
  .gvs-meta { display: block; padding: 0 4px; }
  .gvs-tag {
    display: block; font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
    color: #5eead4; margin-bottom: 2px;
  }
  .gvs-name { display: block; font-size: 12.5px; font-weight: 700; line-height: 1.25; }
  /* Same hover as the home banner's button (and the site's .btn-primary),
     driven by the card since the whole card is the link. */
  .gvs-btn {
    display: flex; align-items: center; justify-content: center; gap: 8px;
    height: 48px; margin-bottom: 12px; border-radius: 999px;
    background: #0d9488; color: #fff; font-family: var(--display); font-size: 16px; font-weight: 700;
    box-shadow: 0 8px 30px -8px rgba(45,212,191,0.6);
    transition: transform 0.18s var(--bounce), background 0.2s, box-shadow 0.2s;
  }
  .gvs:hover .gvs-btn {
    background: #14b8a6; transform: translateY(-2px);
    box-shadow: 0 14px 38px -8px rgba(45,212,191,0.7);
  }
  .gvs-fine { display: block; font-size: 12px; line-height: 1.45; color: #6a6a72; text-align: center; }
  @media (max-width: 900px) {
    .gvs { display: none; }
  }
</style>
