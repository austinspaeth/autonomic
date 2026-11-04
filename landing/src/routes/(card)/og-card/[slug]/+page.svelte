<script lang="ts">
  import { APP_MARK_PATH } from '$lib/site';
  import FeatureIcon from '$lib/v2/FeatureIcon.svelte';
  import Phone from '$lib/v2/Phone.svelte';
  import JournalScreen from '$lib/v2/screens/JournalScreen.svelte';
  import PacingSheetScreen from '$lib/v2/screens/PacingSheetScreen.svelte';
  import InsightsTabScreen from '$lib/v2/screens/InsightsTabScreen.svelte';
  import StandResultScreen from '$lib/v2/screens/StandResultScreen.svelte';
  import CycleImpactScreen from '$lib/v2/screens/CycleImpactScreen.svelte';
  import AiReportsSheetScreen from '$lib/v2/screens/AiReportsSheetScreen.svelte';
  import { CARDS } from './cards';
  export let data: { slug: string };
  $: c = CARDS[data.slug];
</script>

<svelte:head><meta name="robots" content="noindex" /><title>{c.name}</title></svelte:head>

<div class="og">
  <div class="og-copy">
    <div class="og-brand">
      <span class="og-app"><svg viewBox="0 0 651.59 348.34" aria-hidden="true"><path d={APP_MARK_PATH} fill="#e03127" stroke="#e03127" stroke-width="9" /></svg></span>
      <b>Autonomic</b>
    </div>
    <div class="og-main">
      <div class="og-badges">
        {#if c.icon}<span class="og-tile"><FeatureIcon name={c.icon} size={34} /></span>{/if}
        <span class="og-pill">{c.badge}</span>
      </div>
      <h1>{c.name}</h1>
      <p>{c.tagline}</p>
    </div>
    <div class="og-foot">autonomic.care<i></i>{c.foot || 'Free on iPhone and Android'}</div>
  </div>
  <div class="og-art" class:watch={data.slug === 'apple-watch'}>
    {#if data.slug === 'apple-watch'}
      <img src="/features/watch-stand-test.webp" width="410" height="502" alt="" />
    {:else if c.photo}
      <div class="og-portrait"><img src={c.photo} width="720" height="900" alt="" /></div>
    {:else}
      <div class="og-phone">
        {#if data.slug === 'hrv-readings'}
          <Phone w={320} src="/features/live-hrv.webp" alt="" />
        {:else}
          <Phone w={320}><div class="v2-ph-full">
            {#if data.slug === 'pacing-budget'}<PacingSheetScreen time="8:48" battery={0.9} />
            {:else if data.slug === 'insights'}<InsightsTabScreen />
            {:else if data.slug === 'pots-stand-test'}<StandResultScreen time="9:12" />
            {:else if data.slug === 'cycle-tracking'}<CycleImpactScreen time="7:18" battery={0.85} />
            {:else if data.slug === 'doctor-reports'}<AiReportsSheetScreen time="8:12" battery={0.85} />
            {:else}<JournalScreen time="8:48" battery={0.9} />{/if}
          </div></Phone>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  :global(html), :global(body) { margin: 0; background: #f2eff1; }
  .og { position: relative; width: 1200px; height: 630px; overflow: hidden; display: flex; background: #f2eff1; font-family: 'Plus Jakarta Sans', sans-serif; color: #231f28; }
  .og-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; padding: 56px 0 52px 72px; }
  .og-brand { display: flex; align-items: center; gap: 14px; }
  .og-brand b { font-size: 30px; font-weight: 800; letter-spacing: -.02em; }
  .og-app { width: 56px; height: 56px; border-radius: 15px; background: #0b0b0c; display: flex; align-items: center; justify-content: center; box-shadow: 0 10px 22px -12px rgba(20,14,26,.6); }
  .og-app svg { width: 44px; height: auto; }
  .og-main { margin: auto 0; }
  .og-badges { display: flex; align-items: center; gap: 14px; margin-bottom: 26px; }
  .og-tile { width: 72px; height: 72px; border-radius: 20px; background: #fff; display: flex; align-items: center; justify-content: center; box-shadow: 0 10px 24px -16px rgba(20,14,26,.45); }
  .og-pill { font-size: 17px; font-weight: 800; letter-spacing: .04em; color: #3a2f44; background: #e7e0ea; border-radius: 999px; padding: 9px 18px; }
  h1 { margin: 0; font-size: 78px; font-weight: 800; letter-spacing: -.045em; line-height: .98; }
  p { margin: 20px 0 0; max-width: 560px; font-size: 40px; font-weight: 800; letter-spacing: -.03em; line-height: 1.1; color: #e5432f; }
  .og-foot { display: flex; align-items: center; gap: 14px; font-size: 21px; font-weight: 700; color: #6b6371; }
  .og-foot i { width: 6px; height: 6px; border-radius: 3px; background: #c9bfcd; }
  .og-art { position: relative; width: 470px; flex: none; }
  .og-art::before { content: ''; position: absolute; left: 30px; right: 30px; top: 60px; bottom: -40px; background: #e7e0ea; border-radius: 220px 220px 0 0; }
  .og-phone { position: absolute; left: 75px; top: 56px; filter: drop-shadow(0 30px 40px rgba(20,14,26,.28)); }
  .og-portrait { position: absolute; left: 60px; top: 70px; width: 350px; height: 600px; border-radius: 180px 180px 0 0; overflow: hidden; }
  .og-portrait img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 20%; }
  .og-art.watch img { position: absolute; left: 50px; top: 96px; width: 370px; height: auto; border-radius: 34px; box-shadow: 0 34px 60px -30px rgba(20,14,26,.6); }
</style>
