<script lang="ts">
  import { pricing } from '$lib/site';
  import FeatureIcon from './FeatureIcon.svelte';
  import DownloadBox from './DownloadBox.svelte';
  /** Empty for a page with no feature tile (the condition pages). */
  export let icon = '';
  export let badge = '';
  export let name: string;
  export let tagline: string;
  export let note = `Every install starts with ${pricing.trialDays} days of Pro, free`;
  export let crumb: { label: string; href: string } = { label: 'Features', href: '/features/' };
  /** The breadcrumb's last step, when the H1 is a sentence rather than a name. */
  export let here = '';
  /** A name that is already a sentence needs only a space before its tagline. */
  $: sep = /[.!?]$/.test(name) ? ' ' : ': ';
</script>

<section class="v2-fhero">
  <div class="v2-wrap">
    <nav class="v2-crumb" aria-label="Breadcrumb"><a href={crumb.href}>{crumb.label}</a><span>/</span><span>{here || name}</span></nav>
    <div class="v2-fhero-grid">
      <div>
        {#if icon || badge}
          <div class="v2-fhero-badges">
            {#if icon}<span class="v2-tile"><FeatureIcon name={icon} size={24} /></span>{/if}
            {#if badge}<span class="v2-pill">{badge}</span>{/if}
          </div>
        {/if}
        <!-- The heading is the name AND its promise, so the H1 carries the words
             people search for while the two lines look as they always did. -->
        <h1 class="v2-fhero-h1">{name}<span class="v2-sr">{sep}</span><span class="v2-fhero-tag">{tagline}</span></h1>
        <p class="v2-lead"><slot name="lead" /></p>
        <DownloadBox />
        <p class="v2-fine">{note}</p>
      </div>
      <div class="v2-fhero-art">
        <slot />
      </div>
    </div>
  </div>
</section>
