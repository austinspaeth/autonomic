<script lang="ts">
  import { FEATURES } from './features';
  import FeatureIcon from './FeatureIcon.svelte';
  export let current: string;
  $: rest = FEATURES.filter((f) => f.slug !== current).slice(0, 3);
</script>

<section class="v2-sec soft">
  <div class="v2-wrap">
    <div class="v2-rule"><span>More features</span></div>
    <div class="v2-g3">
      {#each rest as f}
        <a class="v2-fcard" href={f.href}>
          <span class="v2-tile sm"><FeatureIcon name={f.icon} size={20} /></span>
          <b>{f.name}</b><span>{f.tag}</span><em>Explore →</em>
        </a>
      {/each}
    </div>
  </div>
</section>
