<script lang="ts">
  import { page } from '$app/stores';
  import type { Article } from '../../../api/articles/types';
  import ArticleLine from '$lib/ArticleLine.svelte';
  import InsightsShell from '$lib/InsightsShell.svelte';
  import { getTopic, topicLabel } from '$lib/topics';

  export let data: { articles?: Article[] };

  $: slug = $page.params.topic ?? '';
  $: topic = getTopic(slug);
  $: longName = topic?.longName ?? topicLabel(slug);
  $: articles = (data.articles ?? []).filter((a) => a.categories?.includes(slug));
  $: canonical = `https://autonomic.care/insights/articles/${slug}/`;
</script>

<svelte:head>
  <title>All {longName} articles | The Autonomic Blog</title>
  <meta name="description" content={`Every ${longName} article from the Autonomic blog.`} />
  <link rel="canonical" href={canonical} />
  {#if !topic || !articles.length}<meta name="robots" content="noindex, follow" />{/if}
  <meta property="og:type" content="website" />
  <meta property="og:url" content={canonical} />
  <meta property="og:title" content={`All ${longName} articles | The Autonomic Blog`} />
  <meta property="og:description" content={`Every ${longName} article from the Autonomic blog.`} />
  <meta property="og:image" content="https://autonomic.care/og.png" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content="https://autonomic.care/og.png" />
</svelte:head>

<InsightsShell>
  <div class="articles-index">
    <a class="article-back" href={`/insights/${slug}/`}>← {longName}</a>
    <h1 class="h2">{longName} <span class="al-muted">· all articles</span></h1>
    <div class="article-lines">
      {#each articles as a (a.slug)}
        <ArticleLine article={a} />
      {/each}
    </div>
    {#if !articles.length}
      <p class="blog-empty">No articles in this topic yet.</p>
    {/if}
  </div>
</InsightsShell>
