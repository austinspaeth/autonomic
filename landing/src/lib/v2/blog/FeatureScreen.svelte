<!-- A feature's own app screen in a phone, at any size: the drawn screens the
     feature pages use, so an article's pitch always shows the real feature. -->
<script lang="ts">
  import type { FeatureSlug } from '../articlePitch';
  import Phone from '../Phone.svelte';
  import JournalScreen from '../screens/JournalScreen.svelte';
  import PacingSheetScreen from '../screens/PacingSheetScreen.svelte';
  import InsightsTabScreen from '../screens/InsightsTabScreen.svelte';
  import StandResultScreen from '../screens/StandResultScreen.svelte';
  import CycleImpactScreen from '../screens/CycleImpactScreen.svelte';
  import AiReportsSheetScreen from '../screens/AiReportsSheetScreen.svelte';
  import ProgressScreen from '../screens/ProgressScreen.svelte';
  /** A feature's screen, or 'progress' for the Progress view (the article rail). */
  export let feature: FeatureSlug | 'progress';
  export let w = 210;
</script>

{#if feature === 'apple-watch'}
  <img class="bl-fs-watch" src="/features/watch-stand-test.webp" width="410" height="502" alt="" loading="lazy" style="width:{w}px" />
{:else}
  <Phone {w}><div class="v2-ph-full">
    {#if feature === 'progress'}<ProgressScreen time="9:19" battery={0.9} />
    {:else if feature === 'pacing-budget'}<PacingSheetScreen time="8:48" battery={0.9} />
    {:else if feature === 'insights'}<InsightsTabScreen />
    {:else if feature === 'pots-stand-test'}<StandResultScreen time="9:12" />
    {:else if feature === 'cycle-tracking'}<CycleImpactScreen time="7:18" battery={0.85} />
    {:else if feature === 'doctor-reports'}<AiReportsSheetScreen time="8:12" battery={0.85} />
    {:else}<JournalScreen time="8:48" battery={0.9} />{/if}
  </div></Phone>
{/if}
