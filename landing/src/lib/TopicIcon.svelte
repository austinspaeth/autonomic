<script lang="ts">
  import { BRAND_POLYLINE } from './site';
  import type { Topic } from './topics';

  export let topic: Topic | undefined = undefined;
</script>

{#if topic?.slug === 'app'}
  <!-- The brand waveform (squiggle) from the logo, in place of a text glyph. -->
  <svg class="topic-ic-wave" viewBox="0 0 512 512" aria-hidden="true">
    <polyline
      points={BRAND_POLYLINE}
      fill="none"
      stroke="currentColor"
      stroke-width="52"
      stroke-linejoin="round"
      stroke-linecap="round"
    />
  </svg>
{:else if topic?.slug === 'food'}
  <!-- Monoline apple, matching the site's abstract-glyph icon vocabulary. -->
  <svg class="topic-ic-food" viewBox="0 0 24 24" aria-hidden="true">
    <g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">
      <path d="M12 8.4c-1-1.7-3.2-2.4-4.9-1.4C5.3 8 4.8 10.6 5.8 13c.8 2 2.2 3.9 3.8 4.7.9.5 1.6.2 2.4-.2.8.4 1.5.7 2.4.2 1.6-.8 3-2.7 3.8-4.7 1-2.4.5-5-1.3-6-1.7-1-3.9-.3-4.9 1.4z" />
      <path d="M12 8.4c.1-1.6 1.1-3 2.8-3.4" />
    </g>
  </svg>
{:else}
  {topic?.icon ?? '○'}
{/if}

<style>
  .topic-ic-wave {
    display: inline-block;
    width: 1.15em;
    height: 1em;
    vertical-align: -0.12em;
    color: inherit;
  }
  .topic-ic-food {
    display: inline-block;
    width: 1em;
    height: 1em;
    vertical-align: -0.14em;
    color: inherit;
  }
</style>
