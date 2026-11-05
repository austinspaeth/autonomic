<script lang="ts">
  import BlogHero from '$lib/v2/blog/BlogHero.svelte';
  import PostRow from '$lib/v2/blog/PostRow.svelte';
  import BlogCta from '$lib/v2/blog/BlogCta.svelte';
  import TopicChips from '$lib/v2/blog/TopicChips.svelte';
  import type { Article } from '../../../api/articles/types';
  import { articleHref } from '$lib/site';

  export let data: { articles?: Article[] };
  $: articles = data.articles ?? [];

  const canonical = 'https://autonomic.care/insights/articles/';
  $: collectionLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'All answers | Questions People Ask',
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
  <title>All answers | Questions People Ask, Autonomic</title>
  <meta name="description" content="Every article from the Autonomic blog, HRV, POTS, dysautonomia and post-viral recovery." />
  <link rel="canonical" href={canonical} />
  <meta property="og:type" content="website" />
  <meta property="og:url" content={canonical} />
  <meta property="og:title" content="All answers | Questions People Ask, Autonomic" />
  <meta property="og:description" content="Every article from the Autonomic blog, HRV, POTS, dysautonomia and post-viral recovery." />
  <meta property="og:image" content="https://autonomic.care/og.png" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="All answers | Questions People Ask, Autonomic" />
  <meta name="twitter:description" content="Every article from the Autonomic blog, HRV, POTS, dysautonomia and post-viral recovery." />
  <meta name="twitter:image" content="https://autonomic.care/og.png" />
  {@html `<script type="application/ld+json">${JSON.stringify(collectionLd)}<\/script>`}
  {@html `<script type="application/ld+json">${JSON.stringify(breadcrumbLd)}<\/script>`}
</svelte:head>

<BlogHero crumbs={[{ href: '/insights/', label: 'Blog' }, { label: 'All articles' }]} title="Every answer." lead={`All ${articles.length} articles, newest first.`}>
  <TopicChips label="Or by topic" />
</BlogHero>

<section class="v2-sec bl-sec-top">
  <div class="v2-wrap"><div class="bl-rows">{#each articles as a (a.slug)}<PostRow article={a} />{/each}</div></div>
</section>

<BlogCta />
