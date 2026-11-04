<script lang="ts">
  import { page } from '$app/stores';
  import { barTopics } from './topics';

  const list = barTopics();

  // Active topic from /insights/<topic>/… or /insights/articles/<topic>/.
  $: seg = $page.url.pathname.replace(/\/+$/, '').split('/');
  $: activeTopic = seg[2] === 'articles' ? (seg[3] ?? '') : seg[2] === 'writers' ? '' : (seg[2] ?? '');
  $: isAll = activeTopic === '';
  // The blog home: the bar's title waits until the hero's own title scrolls away.
  $: isHome = seg.length === 2;
  // /insights/<topic>/<slug>: an article, which gets the reading-progress line.
  $: isArticle = seg.length === 4 && seg[2] !== 'articles' && seg[2] !== 'writers';
</script>

<nav class="insights-bar" class:ib-wait={isHome} aria-label="Topics" data-ib>
  <div class="v2-wrap ib-in">
    <a class="ib-title" href="/insights/" tabindex={isHome ? -1 : undefined}>Questions people ask.</a>
    <div class="insights-bar-row" data-ib-row>
      <a class="insights-pill" class:active={isAll} href="/insights/">All topics</a>
      {#each list as t}
        <a class="insights-pill" class:active={activeTopic === t.slug} href={`/insights/${t.slug}/`}>{t.shortName}</a>
      {/each}
    </div>
  </div>
  {#if isArticle}<div class="insights-prog" aria-hidden="true"><i data-read-bar></i></div>{/if}
</nav>
