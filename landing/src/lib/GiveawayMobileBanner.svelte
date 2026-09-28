<script lang="ts">
  import { giveawayUrl } from './site';
  import GiveawayRibbon from './GiveawayRibbon.svelte';
</script>

<!-- Phone version of the blog's giveaway card: one compact row under the
     topic bar. Shown only at widths where the sidebar card is hidden. -->
<div class="gvm wrap">
  <a class="gvm-link" href={giveawayUrl} aria-label="Dysautonomia Awareness Month giveaway: learn more">
    <span class="gvm-glow" aria-hidden="true"></span>
    <span class="gvm-ribbon"><GiveawayRibbon /></span>
    <span class="gvm-text">
      <span class="gvm-kicker">Dysautonomia Awareness Month</span>
      <span class="gvm-title">Win an Apple&nbsp;Watch or Polar&nbsp;H10</span>
    </span>
    <svg class="gvm-chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
  </a>
</div>

<style>
  .gvm { display: none; padding-top: 12px; padding-bottom: 16px; }
  /* The banner owns the gap below it, so the page's own top padding goes. */
  @media (max-width: 900px) {
    .gvm { display: block; }
    :global(.gvm + .insights-cols) { padding-top: 0; }
    :global(.gvm + .insights-cols .article-card) { margin-top: 0; }
  }
  .gvm-link {
    position: relative; display: flex; align-items: center; gap: 12px; overflow: hidden;
    background: #0c1010; border: 1px solid rgba(45,212,191,0.22); border-radius: var(--r);
    padding: 12px 16px 12px 14px; color: var(--text); text-decoration: none;
    transition: border-color 0.2s;
  }
  .gvm-link:hover { border-color: rgba(45,212,191,0.44); }
  .gvm-glow {
    position: absolute; left: -70px; top: 50%; width: 200px; height: 200px; margin-top: -100px;
    border-radius: 999px; background: radial-gradient(closest-side, rgba(45,212,191,0.17), rgba(45,212,191,0));
    pointer-events: none;
  }
  .gvm-ribbon { position: relative; flex: none; width: 18px; height: 25px; }
  .gvm-text { position: relative; flex: 1; min-width: 0; }
  .gvm-kicker {
    display: block; font-size: 10.5px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
    color: #5eead4; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .gvm-title {
    display: block; font-family: var(--display); font-size: 18px; font-weight: 700;
    letter-spacing: -0.02em; line-height: 1.15; text-wrap: balance;
  }
  .gvm-chev { position: relative; flex: none; color: #5eead4; }
</style>
