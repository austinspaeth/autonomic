<script lang="ts">
  import type { Article } from '../api/articles/types';
  import ArticleCover from '$lib/ArticleCover.svelte';
  import RecentCard from '$lib/RecentCard.svelte';
  import TopicIcon from '$lib/TopicIcon.svelte';
  import BlogEndCTA from '$lib/BlogEndCTA.svelte';
  import InsightsShell from '$lib/InsightsShell.svelte';
  import { formatDate, articleHref, PILLARS } from '$lib/site';
  import { allTopics, topicLabel } from '$lib/topics';
  import { writerSlug } from '$lib/writers';

  export let data: { articles?: Article[] };

  const articles: Article[] = data.articles ?? [];
  $: featured = articles[0];
  // A tight "Latest" strip (3-up), the rest of the page is organized by topic.
  $: recent = articles.slice(1, 4);

  // The cornerstone guides, resolved from PILLARS against the live article list.
  $: pillars = PILLARS.map((slug) => articles.find((a) => a.slug === slug)).filter(
    (a): a is Article => Boolean(a)
  );

  // One section per topic hub: the newest few articles in that category, in nav order.
  $: topicSections = allTopics()
    .map((t) => ({ topic: t, posts: articles.filter((a) => a.categories?.includes(t.slug)).slice(0, 3) }))
    .filter((s) => s.posts.length > 0);

  const faq = [
    {
      q: 'What is HRV, in one sentence?',
      a: 'Heart rate variability is the tiny beat-to-beat variation in the time between your heartbeats, more variation usually means a more flexible, better-regulated nervous system.'
    },
    {
      q: 'Do I need special hardware to use any of this?',
      a: 'No. You can log readings from a ring, chest strap, BP cuff or pulse oximeter, Autonomic scores whatever you record.'
    },
    {
      q: 'Is anything here medical advice?',
      a: 'No. These are educational field notes to help you read your own data and have better conversations with your clinician, they do not diagnose or treat.'
    }
  ];

  $: blogLd = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'The Autonomic Blog',
    url: 'https://autonomic.care/insights/',
    description:
      'HRV, POTS, dysautonomia and post-viral recovery, explained for the people living it.',
    publisher: { '@id': 'https://autonomic.care/#organization' },
    blogPost: articles.slice(0, 10).map((a) => ({
      '@type': 'BlogPosting',
      headline: a.title,
      description: a.summary || a.description,
      datePublished: a.date,
      dateModified: a.updated || a.date,
      author: { '@type': 'Person', name: a.author },
      url: `https://autonomic.care${articleHref(a)}`
    }))
  };

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://autonomic.care/' },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: 'https://autonomic.care/insights/' }
    ]
  };
</script>

<svelte:head>
  <title>The Autonomic Blog | HRV, POTS &amp; dysautonomia recovery</title>
  <meta
    name="description"
    content="Field notes on HRV, POTS, dysautonomia and post-viral recovery, what your autonomic data means, and how to turn it into better days."
  />
  <meta name="keywords" content="HRV blog, POTS recovery, dysautonomia, long COVID, heart rate variability, orthostatic intolerance, post-viral recovery, autonomic nervous system" />
  <link rel="canonical" href="https://autonomic.care/insights/" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://autonomic.care/insights/" />
  <meta property="og:title" content="The Autonomic Blog" />
  <meta property="og:description" content="HRV, POTS and dysautonomia recovery, explained for the people living it." />
  <meta property="og:image" content="https://autonomic.care/og.png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="The Autonomic Blog: HRV, POTS and dysautonomia recovery, explained." />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="The Autonomic Blog" />
  <meta name="twitter:description" content="HRV, POTS and dysautonomia recovery, explained for the people living it." />
  <meta name="twitter:image" content="https://autonomic.care/og.png" />
  {@html `<script type="application/ld+json">${JSON.stringify(blogLd)}<\/script>`}
  {@html `<script type="application/ld+json">${JSON.stringify(breadcrumbLd)}<\/script>`}
</svelte:head>

<!-- Everything, including the top hero, lives in the main (right) column. -->
<InsightsShell>
  <!-- Top part (kept from the original blog home) - main page only. -->
  <div class="blog-head blog-head--left">
    <p class="eyebrow">The Autonomic blog</p>
    <h1 class="h2">Reading your nervous system, in plain language.</h1>
    <p class="lead">
      Field notes on HRV, POTS, dysautonomia and post-viral recovery, what the numbers mean, and
      how to turn them into better days.
    </p>
  </div>

  {#if featured}
    {@const topic = featured.categories?.[0]}
    <article class="feat">
      <a class="feat-art" href={articleHref(featured)}>
        <ArticleCover
          photoLocation={featured.photoLocation}
          photoAttribution={featured.photoAttribution}
          title={featured.title}
          slug={featured.slug}
          category={topic}
          showTag={false}
          eager
        />
      </a>
      <div class="feat-body">
        <div class="feat-meta">
          <a class="feat-author" href={`/insights/writers/${writerSlug(featured.author)}/`}>{featured.author}</a>
          <span class="feat-date">{formatDate(featured.date)}</span>
          {#if topic}<a class="feat-tag" href={`/insights/${topic}/`}>{topicLabel(topic)}</a>{/if}
        </div>
        <a class="feat-title-link" href={articleHref(featured)}>
          <h2 class="feat-title">{featured.title}</h2>
        </a>
        <p class="feat-tldr">{featured.tldr || featured.summary}</p>
        <a class="feat-btn" href={articleHref(featured)}>Read the full story</a>
      </div>
    </article>
  {/if}

  {#if recent.length}
    <div class="blog-grid-3">
      {#each recent as a (a.slug)}
        <RecentCard article={a} />
      {/each}
    </div>
  {/if}

  {#if pillars.length}
    <section class="pillar-panel">
      <h2 class="insights-section-title" style="margin-top: 0;">The pillar guides: start here</h2>
      <p class="topic-block-desc">
        A handful of deep guides that cover the core of reading and recovering your nervous system.
        Read them in order and you'll have the whole map.
      </p>
      <ol class="pillar-main-list">
        {#each pillars as a, i (a.slug)}
          <li>
            <a class="pillar-main-link" href={articleHref(a)}>
              <span class="pillar-main-n">{String(i + 1).padStart(2, '0')}</span>
              <span class="pillar-main-body">
                <span class="pillar-main-t">{a.title}</span>
                <span class="pillar-main-s">{a.summary}</span>
              </span>
            </a>
          </li>
        {/each}
      </ol>
    </section>
  {/if}

  {#each topicSections as { topic, posts } (topic.slug)}
    <section class="topic-panel">
      <a class="topic-panel-head" href={`/insights/${topic.slug}/`}>
        <h2 class="topic-panel-title">
          <span class="topic-ic" aria-hidden="true"><TopicIcon {topic} /></span> {topic.longName}
        </h2>
      </a>
      <p class="topic-panel-desc">{topic.description}</p>
      <div class="blog-grid-3">
        {#each posts as a (a.slug)}
          <RecentCard article={a} />
        {/each}
      </div>
      <a class="topic-more" href={`/insights/${topic.slug}/`}>
        Open the {topic.shortName.replace(/^The /, '')} hub →
      </a>
    </section>
  {/each}

  {#if !articles.length}
    <p class="blog-empty">No articles yet, the first posts are on the way.</p>
  {/if}

  <div class="faq-wrap" style="margin-top: 56px;">
    <h2 class="insights-section-title" style="margin-top: 0;">Good to know</h2>
    <div class="faq">
      {#each faq as f}
        <details>
          <summary>{f.q}<span class="fq-i">+</span></summary>
          <p>{f.a}</p>
        </details>
      {/each}
    </div>
    <p style="margin-top: 24px;">
      <a class="bf-more" href="/insights/articles/">Show all articles →</a>
    </p>
  </div>

  <div style="margin-top: 48px;">
    <BlogEndCTA />
  </div>
</InsightsShell>
