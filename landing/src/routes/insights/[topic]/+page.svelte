<script lang="ts">
  import { page } from '$app/stores';
  import type { Article } from '../../api/articles/types';
  import ArticleCover from '$lib/ArticleCover.svelte';
  import ArticleCard from '$lib/ArticleCard.svelte';
  import BlogEndCTA from '$lib/BlogEndCTA.svelte';
  import InsightsShell from '$lib/InsightsShell.svelte';
  import { formatDate, articleHref } from '$lib/site';
  import TopicIcon from '$lib/TopicIcon.svelte';
  import { getTopic, topicLabel } from '$lib/topics';
  import { writerSlug } from '$lib/writers';

  export let data: { articles?: Article[] };

  $: slug = $page.params.topic ?? '';
  $: topic = getTopic(slug);
  $: longName = topic?.longName ?? topicLabel(slug);
  $: inTopic = (data.articles ?? []).filter((a) => a.categories?.includes(slug));
  $: featured = inTopic[0];
  $: rest = inTopic.slice(1);
  // Thin/unknown hubs shouldn't be indexed.
  $: noindex = !topic || inTopic.length === 0;
  $: canonical = `https://autonomic.care/insights/${slug}/`;

  $: collectionLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${longName} | The Autonomic Blog`,
    url: canonical,
    description: topic?.description,
    inLanguage: 'en-US',
    isPartOf: { '@id': 'https://autonomic.care/#website' },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: inTopic.map((a, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `https://autonomic.care${articleHref(a)}`,
        name: a.title
      }))
    }
  };
  $: breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Blog', item: 'https://autonomic.care/insights/' },
      { '@type': 'ListItem', position: 2, name: longName, item: canonical }
    ]
  };
</script>

<svelte:head>
  <title>{topic?.title ?? longName} | Autonomic</title>
  <meta name="description" content={topic?.description ?? `Articles on ${longName}.`} />
  {#if topic?.keywords}<meta name="keywords" content={topic.keywords} />{/if}
  <link rel="canonical" href={canonical} />
  <!-- Marks the page as eligible for the mobile sticky download CTA and picks
       its copy (see the sticky-CTA block in src/app.html). -->
  <meta name="aj-cta-topic" content={slug} />
  {#if noindex}<meta name="robots" content="noindex, follow" />{/if}
  <meta property="og:type" content="website" />
  <meta property="og:url" content={canonical} />
  <meta property="og:title" content={`${longName} | The Autonomic Blog`} />
  <meta property="og:description" content={topic?.description ?? `Articles on ${longName}.`} />
  <meta property="og:image" content="https://autonomic.care/og.png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={`${longName} | The Autonomic Blog`} />
  <meta name="twitter:description" content={topic?.description ?? `Articles on ${longName}.`} />
  <meta name="twitter:image" content="https://autonomic.care/og.png" />
  {@html `<script type="application/ld+json">${JSON.stringify(collectionLd)}<\/script>`}
  {@html `<script type="application/ld+json">${JSON.stringify(breadcrumbLd)}<\/script>`}
</svelte:head>

<InsightsShell>
    <a class="article-back" href="/insights/">← All topics</a>
    <div class="topic-head">
      <h1 class="h2 topic-title"><span class="topic-ic topic-ic--lg" aria-hidden="true"><TopicIcon {topic} /></span>{longName}</h1>
      {#if topic?.description}<p class="lead">{topic.description}</p>{/if}
    </div>

    {#if featured}
      {@const featTopic = featured.categories?.[0]}
      <article class="feat">
        <a class="feat-art" href={articleHref(featured)}>
          <ArticleCover
            photoLocation={featured.photoLocation}
            photoAttribution={featured.photoAttribution}
            title={featured.title}
            slug={featured.slug}
            category={featTopic}
            showTag={false}
            eager
          />
        </a>
        <div class="feat-body">
          <div class="feat-meta">
            <a class="feat-author" href={`/insights/writers/${writerSlug(featured.author)}/`}>{featured.author}</a>
            <span class="feat-date">{formatDate(featured.date)}</span>
            {#if featTopic}<a class="feat-tag" href={`/insights/${featTopic}/`}>{topicLabel(featTopic)}</a>{/if}
          </div>
          <a class="feat-title-link" href={articleHref(featured)}>
            <h2 class="feat-title">{featured.title}</h2>
          </a>
          <p class="feat-tldr">{featured.tldr || featured.summary}</p>
          <a class="feat-btn" href={articleHref(featured)}>Read the full story</a>
        </div>
      </article>
    {/if}

    {#if rest.length}
      <div class="blog-list">
        {#each rest as a (a.slug)}
          <ArticleCard article={a} />
        {/each}
      </div>
    {/if}

    {#if !inTopic.length}
      <p class="blog-empty">No articles in this topic yet, check back soon.</p>
    {/if}

    {#if inTopic.length > 1}
      <p style="margin-top: 28px;">
        <a class="bf-more" href={`/insights/articles/${slug}/`}>Browse all {inTopic.length} articles in {longName} →</a>
      </p>
    {/if}

    <div style="margin-top: 48px;">
      <BlogEndCTA />
    </div>
</InsightsShell>
