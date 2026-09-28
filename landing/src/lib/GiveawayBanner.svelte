<script lang="ts">
  import { giveawayUrl } from './site';
  import GiveawayRibbon from './GiveawayRibbon.svelte';
  import PrizeWatchArt from './PrizeWatchArt.svelte';
  import PrizeStrapArt from './PrizeStrapArt.svelte';
</script>

<section class="gva" aria-labelledby="gvaTitle">
  <div class="gva-glow" aria-hidden="true"></div>
  <div class="wrap gva-grid">
    <div class="gva-copy">
      <div class="gva-eyebrow">
        <span class="gva-ribbon">
          <GiveawayRibbon />
        </span>
        <span class="gva-kicker">Dysautonomia Awareness Month</span>
      </div>
      <h2 class="gva-title" id="gvaTitle">This October, your daily reading enters you to win.</h2>
      <p class="gva-sub">One entry for every day you take an HRV reading, up to 10. Two grand prizes, plus other prizes available.</p>
      <a class="btn gva-btn" href={giveawayUrl}>
        Learn more
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </a>
      <div class="gva-fine">Free to enter · No purchase necessary · No health data collected</div>
    </div>

    <div class="gva-prizes">
      <div class="gva-prize">
        <div class="gva-art">
          <PrizeWatchArt />
        </div>
        <div class="gva-prize-meta">
          <div class="gva-prize-tag">iPhone grand prize</div>
          <div class="gva-prize-name">Apple Watch Series 12</div>
        </div>
      </div>

      <div class="gva-prize">
        <div class="gva-art">
          <PrizeStrapArt />
        </div>
        <div class="gva-prize-meta">
          <div class="gva-prize-tag">Android grand prize</div>
          <div class="gva-prize-name">Polar H10 strap</div>
        </div>
      </div>
    </div>
  </div>
</section>

<style>
  .gva {
    --gva-teal: #2dd4bf;
    --gva-teal-light: #5eead4;
    --gva-teal-deep: #0d9488;
    position: relative; overflow: hidden;
    background: #070708;
    border-top: 1px solid rgba(255,255,255,0.04);
    border-bottom: 1px solid rgba(255,255,255,0.04);
    padding: 40px 0;
  }
  .gva-glow {
    position: absolute; right: -160px; top: 50%;
    width: 760px; height: 760px; margin-top: -380px; border-radius: 999px;
    background: radial-gradient(closest-side, rgba(45,212,191,0.13), rgba(45,212,191,0));
    pointer-events: none;
  }
  .gva-grid {
    position: relative;
    display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 440px), 1fr));
    gap: 40px; align-items: center;
  }
  .gva-eyebrow { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
  .gva-ribbon { flex: none; width: 24px; height: 34px; }
  .gva-kicker {
    font-size: 13px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase;
    color: var(--gva-teal-light);
  }
  .gva-title {
    font-family: var(--display); font-size: clamp(34px, 4.2vw, 50px); line-height: 1.04;
    letter-spacing: -0.035em; font-weight: 700; margin: 0 0 12px; text-wrap: balance;
  }
  .gva-sub {
    font-size: clamp(17px, 1.8vw, 19px); line-height: 1.55; color: #b4b4bc;
    margin: 0 0 24px; max-width: 520px; text-wrap: pretty;
  }
  /* Rides the site's .btn (font, bounce transition) and mirrors .btn-primary's
     hover in teal: brighter fill, 2px lift, the glow growing underneath. */
  .gva-btn {
    height: 60px; padding: 0 34px; margin-bottom: 18px; gap: 10px;
    font-size: 19px; font-weight: 700;
    background: var(--gva-teal-deep); color: #fff;
    box-shadow: 0 8px 30px -8px rgba(45,212,191,0.6);
  }
  .gva-btn:hover {
    background: #14b8a6; color: #fff; transform: translateY(-2px);
    box-shadow: 0 14px 38px -8px rgba(45,212,191,0.7);
  }
  .gva-fine { font-size: 14px; color: #8a8a92; }
  .gva-prizes { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 14px; }
  .gva-prize {
    position: relative;
    background: #111113; border: 1px solid rgba(255,255,255,0.06);
    border-radius: var(--r-lg); padding: 12px 12px 16px;
  }
  /* Teal rim lit from the top right: a gradient ring laid over the hairline,
     masked to the 1px border so it fades out toward the bottom left. */
  .gva-prize::before {
    content: ''; position: absolute; inset: -1px; border-radius: inherit; padding: 1px;
    background: linear-gradient(225deg, var(--gva-teal) 0%, rgba(45,212,191,0.35) 22%, rgba(45,212,191,0) 50%);
    -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    -webkit-mask-composite: xor;
    mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0);
    pointer-events: none;
  }
  .gva-art {
    height: 170px; margin-bottom: 12px; border-radius: var(--r); overflow: hidden;
    background: radial-gradient(ellipse 70% 60% at 50% 45%, #1d1f22 0%, #0b0b0c 75%);
    display: flex; align-items: center; justify-content: center;
  }
  .gva-prize-meta { padding: 0 6px; }
  .gva-prize-tag {
    font-size: 11.5px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
    color: var(--gva-teal-light); margin-bottom: 4px;
  }
  .gva-prize-name { font-family: var(--display); font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
</style>
