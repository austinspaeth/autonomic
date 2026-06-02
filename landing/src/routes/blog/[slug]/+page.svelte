<script lang="ts">
  import type { Article } from '../../api/articles/types';
  import ArticleCover from '$lib/ArticleCover.svelte';
  import ArticleCard from '$lib/ArticleCard.svelte';
  import { categoryLabel } from '$lib/site';

  type Meta = {
    title: string;
    slug: string;
    author: string;
    description?: string;
    summary?: string;
    tldr?: string;
    date: string;
    keywords?: string;
    categories?: string[];
    photoLocation?: string;
    photoAttribution?: string;
  };
  export let data: { content: any; meta: Meta; articles?: Article[] };

  $: meta = data.meta;
  $: canonical = `https://autonomic.app/blog/${meta.slug}/`;
  $: ogImage = meta.photoLocation || 'https://autonomic.app/og.png';
  $: primaryCat = meta.categories?.[0];

  const fmtDate = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // Related: prefer articles sharing a category, then fill with most recent.
  $: related = (() => {
    const all = (data.articles ?? []).filter((a) => a.slug !== meta.slug);
    const cats = new Set(meta.categories ?? []);
    const shares = (a: Article) => (a.categories ?? []).some((c) => cats.has(c));
    return [...all.filter(shares), ...all.filter((a) => !shares(a))].slice(0, 3);
  })();

  // Reader share links — pure anchors so they work with no client JS (csr=false).
  $: shareUrl = encodeURIComponent(canonical);
  $: shareText = encodeURIComponent(meta.title);
  $: shares = [
    { label: 'X', href: `https://twitter.com/intent/tweet?url=${shareUrl}&text=${shareText}` },
    { label: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}` },
    { label: 'Reddit', href: `https://www.reddit.com/submit?url=${shareUrl}&title=${shareText}` }
  ];

  $: articleLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: meta.title,
    description: meta.description || meta.summary,
    image: ogImage,
    datePublished: meta.date,
    author: { '@type': 'Person', name: meta.author },
    publisher: { '@type': 'Organization', name: 'Autonomic' },
    mainEntityOfPage: canonical,
    keywords: meta.keywords
  };
  $: breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://autonomic.app/' },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: 'https://autonomic.app/blog/' },
      { '@type': 'ListItem', position: 3, name: meta.title, item: canonical }
    ]
  };
</script>

<svelte:head>
  <title>{meta.title} | Autonomic</title>
  <meta name="description" content={meta.description || meta.summary} />
  {#if meta.keywords}<meta name="keywords" content={meta.keywords} />{/if}
  <meta name="author" content={meta.author} />
  <link rel="canonical" href={canonical} />

  <meta property="og:type" content="article" />
  <meta property="og:title" content={meta.title} />
  <meta property="og:description" content={meta.description || meta.summary} />
  <meta property="og:image" content={ogImage} />
  <meta property="og:url" content={canonical} />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={meta.title} />
  <meta name="twitter:description" content={meta.description || meta.summary} />

  {@html `<script type="application/ld+json">${JSON.stringify(articleLd)}<\/script>`}
  {@html `<script type="application/ld+json">${JSON.stringify(breadcrumbLd)}<\/script>`}
</svelte:head>

<article class="article">
  <div class="wrap article-wrap">
    <a class="article-back" href="/blog/">← All articles</a>

    <div class="article-meta">
      <span>{fmtDate(meta.date)} · {meta.author}</span>
      {#if primaryCat}<span class="article-tag">{categoryLabel(primaryCat)}</span>{/if}
    </div>
    <h1 class="article-title">{meta.title}</h1>
    {#if meta.summary}<p class="article-summary">{meta.summary}</p>{/if}

    <figure class="article-figure">
      <ArticleCover
        photoLocation={meta.photoLocation}
        photoAttribution={meta.photoAttribution}
        title={meta.title}
        slug={meta.slug}
        category={primaryCat}
        eager
      />
      {#if meta.photoLocation && meta.photoAttribution}
        <figcaption>{meta.photoAttribution}</figcaption>
      {/if}
    </figure>

    {#if meta.tldr}
      <div class="article-tldr"><strong>TLDR</strong>{meta.tldr}</div>
    {/if}

    <div class="article-prose">
      <svelte:component this={data.content} />
    </div>

    <div class="article-share">
      <span class="ash-label">Share</span>
      {#each shares as s}
        <a class="ash-btn" href={s.href} target="_blank" rel="noopener noreferrer">{s.label}</a>
      {/each}
    </div>

    <div class="article-cta">
      <h3>Track your recovery with Autonomic</h3>
      <p>A private, offline journal that scores your daily HRV, BP, ECG and orthostatic readings. $50/year, 7-day free trial.</p>
      <a class="btn btn-primary btn-lg" href="/#waitlist">Join the waitlist</a>
    </div>

    {#if related.length}
      <section class="article-related">
        <h2 class="ar-title">Keep reading</h2>
        <div class="blog-list">
          {#each related as a (a.slug)}
            <ArticleCard article={a} />
          {/each}
        </div>
      </section>
    {/if}
  </div>
</article>
