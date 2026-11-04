<!-- "What to track": a real table (search engines read it as one), drawn as a
     card of rows. Below 760px each row stacks and its cells carry their own
     column label. -->
<script lang="ts">
  export let eyebrow = 'What to track';
  export let title: string;
  export let sub = '';
  export let head: [string, string, string] = ['Signal', 'What it can tell you', 'How Autonomic gets it'];
  export let rows: [string, string, string][];
  export let tone: 'white' | 'paper' | 'lilac' = 'paper';
  export let note = '';
  export let id = '';
  /** Draw a third column of 'Free' / 'Pro' as the site's FREE and PRO tags. */
  export let tags = false;
</script>

<section class="v2-sec" class:white={tone === 'white'} class:lilac={tone === 'lilac'} id={id || undefined}>
  <div class="v2-wrap">
    {#if $$slots.lead}
      <!-- A page can lead the table with its own heading block (a split with a
           screen beside it); `title` then names the table for screen readers. -->
      <slot name="lead" />
    {:else}
      <div class="v2-headrow end">
        <div>{#if eyebrow}<p class="v2-eyebrow">{eyebrow}</p>{/if}<h2 class="v2-h2">{title}</h2></div>
        {#if sub}<p class="v2-sub narrow">{sub}</p>{/if}
      </div>
    {/if}
    <div class="v2-tt-wrap">
      <table class="v2-tt" aria-label={$$slots.lead ? title : undefined}>
        <thead><tr>{#each head as h}<th scope="col">{h}</th>{/each}</tr></thead>
        <tbody>
          {#each rows as r}
            <tr><th scope="row">{r[0]}</th><td data-label={head[1]}>{r[1]}</td><td data-label={head[2]}>{#if tags && (r[2] === 'Free' || r[2] === 'Pro')}<i class={r[2] === 'Pro' ? 'v2-propill' : 'v2-freepill'}>{r[2].toUpperCase()}</i>{:else}{r[2]}{/if}</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
    {#if note}<p class="v2-fine">{note}</p>{/if}
  </div>
</section>
