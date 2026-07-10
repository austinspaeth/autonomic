<script lang="ts">
  import { page } from '$app/stores';
  import { allTopics } from './topics';
  import TopicIcon from './TopicIcon.svelte';

  const list = allTopics();

  // Active topic from /insights/<topic>/… or /insights/articles/<topic>/.
  $: seg = $page.url.pathname.replace(/\/+$/, '').split('/');
  $: activeTopic = seg[2] === 'articles' ? (seg[3] ?? '') : seg[2] === 'writers' ? '' : (seg[2] ?? '');
  $: isAll = activeTopic === '';
</script>

<nav class="insights-bar" aria-label="Topics">
  <div class="wrap insights-bar-row">
    <a class="insights-pill" class:active={isAll} href="/insights/">All topics</a>
    {#each list as t}
      <a class="insights-pill" class:active={activeTopic === t.slug} href={`/insights/${t.slug}/`}>
        <span class="insights-pill-ic" aria-hidden="true"><TopicIcon topic={t} /></span>{t.shortName}
      </a>
    {/each}
  </div>
</nav>
