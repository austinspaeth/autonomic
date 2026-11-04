<!-- The condition pages as cards. On a condition page it is "Often travels
     with" (every other condition); on a feature page it is "Built for". -->
<script lang="ts">
  import { CONDITIONS } from './conditions';
  export let title = 'Often travels with';
  export let current = '';
  $: list = CONDITIONS.filter((c) => c.slug !== current);
</script>

<section class="v2-sec soft">
  <div class="v2-wrap">
    <div class="v2-rule"><span>{title}</span></div>
    <div class="v2-conds" class:five={list.length === 5}>
      {#each list as c}
        <a class="v2-cond" href={c.href}>
          <b>{c.title}</b>
          <span>“{c.question}”</span>
          <em>Answers for {c.name} →</em>
        </a>
      {/each}
    </div>
  </div>
</section>
