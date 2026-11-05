<script lang="ts">
  import { APP_MARK_PATH } from '$lib/site';
  import Stores from './Stores.svelte';
  export let title: string;
  export let sub: string;
</script>

<section class="v2-sec soft" id="download" data-cta="page_cta">
  <div class="v2-wrap">
    <div class="v2-cta">
      <span class="v2-appicon"><svg viewBox="0 0 651.59 348.34" aria-hidden="true"><path d={APP_MARK_PATH} fill="#e03127" stroke="#e03127" stroke-width="9" /></svg></span>
      <div class="v2-cta-copy"><h2>{title}</h2><p>{sub}</p></div>
      <Stores tone="glass" stack />
    </div>
  </div>
</section>
