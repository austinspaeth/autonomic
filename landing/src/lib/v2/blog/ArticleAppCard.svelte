<!-- The app card inside an article: the feature that continues this article's
     question, its own screen in the phone, and the article's tailored hook and
     line. Rendered after the body and moved by the article script to sit after
     a heading near the middle, so a reader meets it while still reading. -->
<script lang="ts">
  import { APP_MARK_PATH, pricing, rating } from '$lib/site';
  import type { Pitch } from '../articlePitch';
  import Stores from '../Stores.svelte';
  import StarRow from '../StarRow.svelte';
  import FeatureScreen from './FeatureScreen.svelte';
  export let pitch: Pitch;
</script>

<aside class="bl-pcard" data-cta="article_mid_card" data-feature={pitch.feature} data-app-card aria-label="Autonomic: {pitch.name}">
  <div class="bl-pcard-copy">
    <p class="bl-pcard-app"><span class="v2-appicon sm"><svg viewBox="0 0 651.59 348.34" aria-hidden="true"><path d={APP_MARK_PATH} fill="#e03127" stroke="#e03127" stroke-width="9" /></svg></span>Autonomic · {pitch.name}</p>
    <p class="bl-pcard-h">{pitch.hook}</p>
    <p class="bl-pcard-s">{pitch.line}</p>
    <div class="bl-pcard-cta">
      <Stores tone="glass" />
      <a class="bl-pcard-more" href={pitch.href} data-cta="article_mid_card_link">How {pitch.name.replace(/^The /, 'the ')} works →</a>
    </div>
    <p class="bl-pcard-proof"><StarRow /><b>{rating.label}</b> on the {rating.store} · Free to download · Every feature free for {pricing.trialDays} days</p>
  </div>
  <div class="bl-pcard-ph" aria-hidden="true"><FeatureScreen feature={pitch.feature} /></div>
</aside>
