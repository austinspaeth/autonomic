<script lang="ts">
  import type { Article } from '../../../api/articles/types';
  import ArticleCover from '$lib/ArticleCover.svelte';
  import ArticleCard from '$lib/ArticleCard.svelte';
  import BlogEndCTA from '$lib/BlogEndCTA.svelte';
  import InsightsShell from '$lib/InsightsShell.svelte';
  import { formatDate, isoDate, articleHref } from '$lib/site';
  import { topicLabel } from '$lib/topics';
  import { writerSlug, getWriter } from '$lib/writers';

  type Meta = {
    title: string;
    slug: string;
    author: string;
    description?: string;
    summary?: string;
    tldr?: string;
    date: string;
    updated?: string;
    keywords?: string;
    categories?: string[];
    photoLocation?: string;
    photoAttribution?: string;
    faq?: { q: string; a: string }[];
  };
  export let data: { content: any; meta: Meta; articles?: Article[] };

  $: meta = data.meta;
  $: primaryCat = meta.categories?.[0];
  // Canonical is always the primary-topic URL, matching every link to this article.
  $: canonical = `https://autonomic.care/insights/${primaryCat ?? 'basics'}/${meta.slug}/`;
  $: ogImage = meta.photoLocation || 'https://autonomic.care/og.png';
  $: authorSlug = writerSlug(meta.author);
  $: bio = getWriter(authorSlug)?.about;
  $: extraCats = (meta.categories ?? []).slice(1);

  // Related: prefer articles sharing a category, then fill with most recent.
  $: related = (() => {
    const all = (data.articles ?? []).filter((a) => a.slug !== meta.slug);
    const cats = new Set(meta.categories ?? []);
    const shares = (a: Article) => (a.categories ?? []).some((c) => cats.has(c));
    return [...all.filter(shares), ...all.filter((a) => !shares(a))].slice(0, 3);
  })();

  // Reader share links, pure anchors so they work with no client JS (csr=false).
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
    image: [ogImage],
    datePublished: meta.date,
    dateModified: meta.updated || meta.date,
    inLanguage: 'en-US',
    url: canonical,
    articleSection: topicLabel(primaryCat),
    author: {
      '@type': 'Person',
      name: meta.author,
      url: `https://autonomic.care/insights/writers/${authorSlug}/`
    },
    publisher: {
      '@type': 'Organization',
      name: 'Autonomic',
      url: 'https://autonomic.care/',
      logo: {
        '@type': 'ImageObject',
        url: 'https://autonomic.care/favicon-512.png',
        width: 512,
        height: 512
      }
    },
    isPartOf: {
      '@type': 'Blog',
      '@id': 'https://autonomic.care/insights/#blog',
      name: 'The Autonomic Blog',
      url: 'https://autonomic.care/insights/'
    },
    mainEntityOfPage: canonical,
    keywords: meta.keywords
  };
  $: faqLd = meta.faq?.length
    ? {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: meta.faq.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a }
        }))
      }
    : null;
  $: breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Blog', item: 'https://autonomic.care/insights/' },
      { '@type': 'ListItem', position: 2, name: topicLabel(primaryCat), item: `https://autonomic.care/insights/${primaryCat}/` },
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
  <meta property="og:image:alt" content={meta.title} />
  <meta property="og:url" content={canonical} />
  <meta property="article:published_time" content={isoDate(meta.date)} />
  <meta property="article:modified_time" content={isoDate(meta.updated || meta.date)} />
  <meta property="article:author" content={meta.author} />
  {#if primaryCat}<meta property="article:section" content={topicLabel(primaryCat)} />{/if}
  {#each meta.categories ?? [] as c}<meta property="article:tag" content={topicLabel(c)} />{/each}
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={meta.title} />
  <meta name="twitter:description" content={meta.description || meta.summary} />
  <meta name="twitter:image" content={ogImage} />
  <meta name="twitter:image:alt" content={meta.title} />
  <meta name="twitter:label1" content="Written by" />
  <meta name="twitter:data1" content={meta.author} />
  <meta name="twitter:label2" content="Filed under" />
  <meta name="twitter:data2" content={topicLabel(primaryCat)} />

  {@html `<script type="application/ld+json">${JSON.stringify(articleLd)}<\/script>`}
  {@html `<script type="application/ld+json">${JSON.stringify(breadcrumbLd)}<\/script>`}
  {#if faqLd}{@html `<script type="application/ld+json">${JSON.stringify(faqLd)}<\/script>`}{/if}
</svelte:head>

<InsightsShell>
  <article class="article-card">
    <figure class="ac-figure">
      <ArticleCover
        photoLocation={meta.photoLocation}
        photoAttribution={meta.photoAttribution}
        title={meta.title}
        slug={meta.slug}
        category={primaryCat}
        eager
      />
      {#if meta.photoLocation && meta.photoAttribution}
        <figcaption class="ac-figcap">© {meta.photoAttribution}</figcaption>
      {/if}
    </figure>

    <div class="ac-body">
      <h1 class="ac-title">{meta.title}</h1>

      <div class="ac-meta">
        <a class="ac-author" href={`/insights/writers/${authorSlug}/`}>{meta.author}</a>
        <span class="ac-date"><time datetime={isoDate(meta.date)}>{formatDate(meta.date)}</time></span>
        {#if primaryCat}<a class="ac-tag" href={`/insights/${primaryCat}/`}>{topicLabel(primaryCat)}</a>{/if}
      </div>

      {#if extraCats.length}
        <div class="article-chips ac-chips">
          {#each extraCats as c}
            <a class="chip" href={`/insights/${c}/`}>{topicLabel(c)}</a>
          {/each}
        </div>
      {/if}

      {#if meta.summary}<p class="ac-summary">{meta.summary}</p>{/if}

      {#if meta.tldr}
        <div class="article-tldr"><strong>TLDR</strong>{meta.tldr}</div>
      {/if}

      <div class="article-prose">
        <svelte:component this={data.content} />
      </div>

      {#if meta.faq?.length}
        <section class="article-faq">
          <h2 class="af-title">Frequently asked questions</h2>
          <div class="faq">
            {#each meta.faq as f}
              <details>
                <summary>{f.q}<span class="fq-i">+</span></summary>
                <p>{f.a}</p>
              </details>
            {/each}
          </div>
        </section>
      {/if}

      <div class="article-share">
        <span class="ash-label">Share</span>
        {#each shares as s}
          <a class="ash-btn" href={s.href} target="_blank" rel="noopener noreferrer">{s.label}</a>
        {/each}
      </div>

      <BlogEndCTA />

      {#if bio}
        <section class="author-box">
          <p class="author-eyebrow">Written by</p>
          <h2 class="author-name"><a href={`/insights/writers/${authorSlug}/`}>{meta.author}</a></h2>
          <p class="author-bio">{bio}</p>
        </section>
      {/if}

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
</InsightsShell>
