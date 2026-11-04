<!-- "The questions you live with": each card is a question in the reader's own
     words, answered underneath by the part of the app that answers it. The
     whole card is the link. (Speech bubbles belong to the home hero alone.)
     Cards that point at a main feature wear its icon; cards that jump to a part
     of the page they sit on have none. -->
<script lang="ts">
  import FeatureIcon from './FeatureIcon.svelte';
  export let eyebrow = 'The questions you live with';
  export let title: string;
  export let sub = '';
  export let tone: 'white' | 'paper' = 'white';
  export let items: { q: string; a: string; feature: string; href: string; icon?: string; pro?: boolean }[];
</script>

<section class="v2-sec" class:white={tone === 'white'}>
  <div class="v2-wrap">
    <div class="v2-center">{#if eyebrow}<p class="v2-eyebrow">{eyebrow}</p>{/if}<h2 class="v2-h2">{title}</h2>{#if sub}<p class="v2-sub">{sub}</p>{/if}</div>
    <div class="v2-qa">
      {#each items as it}
        <a class="v2-qa-card" href={it.href}>
          <span class="v2-qa-q">{it.q}</span>
          <span class="v2-qa-a">{it.a}</span>
          <span class="v2-qa-f">{#if it.icon}<span class="v2-tile xs"><FeatureIcon name={it.icon} size={16} /></span>{/if}{it.feature}{#if it.pro}<i class="v2-propill">PRO</i>{/if}<b aria-hidden="true">→</b></span>
        </a>
      {/each}
    </div>
  </div>
</section>
