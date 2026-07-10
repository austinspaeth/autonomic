<script lang="ts">
  import type { Article } from '../../api/articles/types';
  import ArticleLine from '$lib/ArticleLine.svelte';
  import InsightsShell from '$lib/InsightsShell.svelte';
  import { articleHref } from '$lib/site';

  export let data: { articles?: Article[] };
  $: articles = data.articles ?? [];

  const canonical = 'https://autonomic.care/insights/articles/';
  $: collectionLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'All articles | The Autonomic Blog',
    url: canonical,
    description:
      'Every article from the Autonomic blog on HRV, POTS, dysautonomia and post-viral recovery.',
    inLanguage: 'en-US',
    isPartOf: { '@id': 'https://autonomic.care/#website' },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: articles.map((a, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `https://autonomic.care${articleHref(a)}`,
        name: a.title
      }))
    }
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://autonomic.care/' },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: 'https://autonomic.care/insights/' },
      { '@type': 'ListItem', position: 3, name: 'All articles', item: canonical }
    ]
  };
</script>

<svelte:head>
  <title>All articles | The Autonomic Blog</title>
  <meta name="description" content="Every article from the Autonomic blog, HRV, POTS, dysautonomia and post-viral recovery." />
  <link rel="canonical" href={canonical} />
  <meta property="og:type" content="website" />
  <meta property="og:url" content={canonical} />
  <meta property="og:title" content="All articles | The Autonomic Blog" />
  <meta property="og:description" content="Every article from the Autonomic blog, HRV, POTS, dysautonomia and post-viral recovery." />
  <meta property="og:image" content="https://autonomic.care/og.png" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="All articles | The Autonomic Blog" />
  <meta name="twitter:description" content="Every article from the Autonomic blog, HRV, POTS, dysautonomia and post-viral recovery." />
  <meta name="twitter:image" content="https://autonomic.care/og.png" />
  {@html `<script type="application/ld+json">${JSON.stringify(collectionLd)}<\/script>`}
  {@html `<script type="application/ld+json">${JSON.stringify(breadcrumbLd)}<\/script>`}
</svelte:head>

<InsightsShell>
  <div class="articles-index">
    <a class="article-back" href="/insights/">← Blog home</a>
    <h1 class="h2">All articles</h1>
    <div class="article-lines">
      {#each articles as a (a.slug)}
        <ArticleLine article={a} />
      {/each}
    </div>
  </div>
</InsightsShell>
