<script lang="ts">
  import BlogHero from '$lib/v2/blog/BlogHero.svelte';
  import PostRow from '$lib/v2/blog/PostRow.svelte';
  import BlogCta from '$lib/v2/blog/BlogCta.svelte';
  import { page } from '$app/stores';
  import type { Article } from '../../../../api/articles/types';
  import { getTopic, topicLabel, topicArticles } from '$lib/topics';

  export let data: { articles?: Article[] };

  $: slug = $page.params.topic ?? '';
  $: topic = getTopic(slug);
  $: longName = topic?.longName ?? topicLabel(slug);
  $: articles = topicArticles(data.articles ?? [], slug);
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

<BlogHero crumbs={[{ href: '/insights/', label: 'Blog' }, { href: `/insights/${slug}/`, label: longName }, { label: 'All articles' }]} title={longName} lead={`All ${articles.length} articles, newest first.`} />

<section class="v2-sec bl-sec-top">
  <div class="v2-wrap">
    {#if articles.length}
      <div class="bl-rows">{#each articles as a (a.slug)}<PostRow article={a} />{/each}</div>
    {:else}
      <p class="bl-empty">No articles in this topic yet.</p>
    {/if}
  </div>
</section>

<BlogCta />
