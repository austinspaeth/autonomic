<!-- The long-form part of a page: a heading that stays in view on the left and
     plain, readable prose on the right. This is where a page earns its search
     ranking, so it is written to be read, not skimmed past. -->
<script lang="ts">
  export let eyebrow = '';
  export let title: string;
  export let id = '';
  export let tone: 'white' | 'paper' = 'paper';
</script>

<section class="v2-sec" class:white={tone === 'white'} id={id || undefined}>
  <div class="v2-wrap v2-explain">
    <div class="v2-explain-head">
      {#if eyebrow}<p class="v2-eyebrow">{eyebrow}</p>{/if}
      <h2 class="v2-h2 sm">{title}</h2>
      <slot name="aside" />
    </div>
    <div class="v2-prose"><slot /></div>
  </div>
</section>
