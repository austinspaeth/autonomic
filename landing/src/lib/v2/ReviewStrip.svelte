<!-- The App Store rating beside three short reviews. Pass `app` to add a second
     row naming the app with its store badges, for pages where a reader may not
     yet know whose reviews these are (the blog home). -->
<script lang="ts">
  import { rating, APP_MARK_PATH } from '$lib/site';
  import { REVIEWS } from './features';
  import StarRow from './StarRow.svelte';
  import Stores from './Stores.svelte';
  export let app = false;
</script>

<section class="v2-sec tight" data-cta="review_strip">
  <div class="v2-wrap">
    <div class="v2-revcard" class:app>
      <div class="v2-revstrip">
        <div class="v2-revscore"><b>{rating.label}</b><span><StarRow /><small>{rating.store}</small></span></div>
        {#each REVIEWS as r}
          <figure><blockquote>“{r.short}”</blockquote><figcaption>{r.title} · App Store</figcaption></figure>
        {/each}
      </div>
      {#if app}
        <div class="v2-revapp">
          <a class="v2-appline" href="/">
            <span class="v2-appicon xs"><svg viewBox="0 0 651.59 348.34" aria-hidden="true"><path d={APP_MARK_PATH} fill="#e03127" stroke="#e03127" stroke-width="9" /></svg></span>
            <span>
              <span class="v2-appline-n">Autonomic</span>
              <span class="v2-revapp-s">HRV, POTS and pacing, free on iPhone and Android</span>
            </span>
          </a>
          <Stores />
        </div>
      {/if}
    </div>
  </div>
</section>
