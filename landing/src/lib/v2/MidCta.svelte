<!-- A download mid-page, closing the section that just made the case: the app
     icon, one line of offer, the store badges, and under them the App Store
     rating with one real review, so the ask arrives with its proof. Every
     feature and condition page carries one. Pass `bare` to drop it inside an
     existing section (Pacing's comparison), `review` to pick which quote. -->
<script lang="ts">
  import { APP_MARK_PATH, rating } from '$lib/site';
  import { REVIEWS } from './features';
  import Stores from './Stores.svelte';
  import StarRow from './StarRow.svelte';
  export let title: string;
  export let sub: string;
  export let bare = false;
  /** Which of the App Store reviews to quote (0 to 2). */
  export let review = 0;
  $: r = REVIEWS[review % REVIEWS.length];
</script>

{#if bare}
  <div class="v2-wrap">
    <div class="v2-midcta" data-cta="mid_cta">
      <span class="v2-appicon"><svg viewBox="0 0 651.59 348.34" aria-hidden="true"><path d={APP_MARK_PATH} fill="#e03127" stroke="#e03127" stroke-width="9" /></svg></span>
      <div class="v2-midcta-copy"><b>{title}</b><span>{sub}</span></div>
      <Stores />
      <div class="v2-midcta-proof"><span class="v2-midcta-score"><StarRow /><b>{rating.label}</b><small>{rating.reviews} App Store ratings</small></span><q>{r.short}</q></div>
    </div>
  </div>
{:else}
  <section class="v2-sec tight v2-midcta-sec">
    <div class="v2-wrap">
      <div class="v2-midcta" data-cta="mid_cta">
        <span class="v2-appicon"><svg viewBox="0 0 651.59 348.34" aria-hidden="true"><path d={APP_MARK_PATH} fill="#e03127" stroke="#e03127" stroke-width="9" /></svg></span>
        <div class="v2-midcta-copy"><b>{title}</b><span>{sub}</span></div>
        <Stores />
        <div class="v2-midcta-proof"><span class="v2-midcta-score"><StarRow /><b>{rating.label}</b><small>{rating.reviews} App Store ratings</small></span><q>{r.short}</q></div>
      </div>
    </div>
  </section>
{/if}
