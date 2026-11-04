<script lang="ts">
  import type { Article } from '../../../../api/articles/types';
  import ArticleCover from '$lib/ArticleCover.svelte';
  import SocialShareWidget from '$lib/SocialShareWidget.svelte';
  import { formatDate, isoDate, APP_MARK_PATH } from '$lib/site';
  import PostCard from '$lib/v2/blog/PostCard.svelte';
  import BlogCta from '$lib/v2/blog/BlogCta.svelte';
  import Stores from '$lib/v2/Stores.svelte';
  import { topicLabel } from '$lib/topics';
  import { writerSlug, getWriter } from '$lib/writers';
  import ogCards from '$lib/og-cards.json';

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
    social?: { linkedin?: string; reddit?: string; x?: string; facebook?: string };
  };
  export let data: { content: any; meta: Meta; articles?: Article[] };

  $: meta = data.meta;
  $: primaryCat = meta.categories?.[0];
  // Canonical is always the primary-topic URL, matching every link to this article.
  $: canonical = `https://autonomic.care/insights/${primaryCat ?? 'basics'}/${meta.slug}/`;
  // The SHARE card is not the cover. scripts/gen-og.mjs writes a 1200x630 card
  // per article (the cover, with the brand strip along the bottom) into
  // static/og/, which is what Facebook, Reddit and X get; the page itself still
  // renders photoLocation untouched. Covers come in at every aspect from 763px
  // wide up, so pointing scrapers at one gave a `summary_large_image` promise
  // that half the articles could not keep. Fall back to the cover, then to the
  // site card, for any article gen-og.mjs has no entry for.
  $: ogCard = (ogCards as Record<string, string>)[meta.slug]
    ? `https://autonomic.care/og/${meta.slug}.jpg`
    : null;
  $: ogImage = ogCard
    ?? (meta.photoLocation
      ? (meta.photoLocation.startsWith('/') ? `https://autonomic.care${meta.photoLocation}` : meta.photoLocation)
      : 'https://autonomic.care/og.png');
  $: authorSlug = writerSlug(meta.author);
  $: bio = getWriter(authorSlug)?.about;
  $: photo = getWriter(authorSlug)?.photo;
  $: readMin = (data.articles ?? []).find((a) => a.slug === meta.slug)?.readMin;
  $: initials = meta.author.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  /* The rail's "On this page" list, the numbered section anchors and the
     reading-progress bar under the topic bar. Built from the article's own h2s
     at load (the markdown carries no ids), so without script the rail simply
     shows no list. */
  const articleScript = `<script>
(function () {
  var prose = document.querySelector('[data-prose]');
  if (!prose) return;
  var hs = Array.prototype.slice.call(prose.querySelectorAll('h2'));
  var toc = document.querySelector('[data-toc]');
  var used = {};
  var links = hs.map(function (h, i) {
    var id = h.id || (h.textContent || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || ('section-' + (i + 1));
    while (used[id]) id += '-' + i;
    used[id] = 1; h.id = id;
    if (!toc) return null;
    var a = document.createElement('a');
    a.href = '#' + id;
    a.innerHTML = '<span>' + String(i + 1).padStart(2, '0') + '</span>';
    a.appendChild(document.createTextNode(h.textContent || ''));
    toc.appendChild(a);
    return a;
  });
  if (toc && hs.length) toc.closest('[data-toc-card]').hidden = false;
  var bar = document.querySelector('[data-read-bar]');
  var art = document.querySelector('[data-article]');
  var ticking = false;
  function update() {
    ticking = false;
    if (bar && art) {
      var r = art.getBoundingClientRect(), vh = window.innerHeight;
      var p = Math.min(1, Math.max(0, (vh * 0.35 - r.top) / Math.max(1, r.height - vh * 0.5)));
      bar.style.width = (p * 100).toFixed(1) + '%';
    }
    var cur = -1;
    for (var i = 0; i < hs.length; i++) if (hs[i].getBoundingClientRect().top < 240) cur = i;
    links.forEach(function (a, i) { if (a) a.classList.toggle('on', i === cur); });
  }
  window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  update();
})();
<\/script>`;

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
        url: 'https://autonomic.care/web-app-manifest-512x512.png',
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
  <!-- Marks the page as eligible for the mobile sticky download CTA and picks
       its copy (see the sticky-CTA block in src/app.html). -->
  <meta name="aj-cta-topic" content={primaryCat ?? 'basics'} />

  <meta property="og:type" content="article" />
  <meta property="og:title" content={meta.title} />
  <meta property="og:description" content={meta.description || meta.summary} />
  <meta property="og:image" content={ogImage} />
  <meta property="og:image:alt" content={meta.title} />
  {#if ogCard}
    <meta property="og:image:type" content="image/jpeg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
  {/if}
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

<section class="bl-ahero">
  <figure class="bl-ahero-bg">
    <ArticleCover photoLocation={meta.photoLocation} photoAttribution={meta.photoAttribution} title={meta.title} slug={meta.slug} category={primaryCat} showTag={false} eager />
    {#if meta.photoLocation && meta.photoAttribution}<figcaption>© {meta.photoAttribution}</figcaption>{/if}
  </figure>
  <div class="v2-wrap bl-ahero-in">
    <div class="bl-ahero-copy">
      <nav class="bl-crumb" aria-label="Breadcrumb">
        <a href="/insights/">Blog</a>
        {#if primaryCat}<span aria-hidden="true">/</span><a href={`/insights/${primaryCat}/`}>{topicLabel(primaryCat)}</a>{/if}
      </nav>
      {#if meta.categories?.length}
        <div class="bl-atags">
          {#each meta.categories as c}<a href={`/insights/${c}/`}>{topicLabel(c)}</a>{/each}
        </div>
      {/if}
      <h1 class="bl-ah1">{meta.title}</h1>
      {#if meta.summary}<p class="bl-lead">{meta.summary}</p>{/if}
      <div class="bl-byline">
        <span class="bl-avatar" aria-hidden="true">{#if photo}<img src={photo} alt="" width="48" height="48" />{:else}{initials}{/if}</span>
        <span>
          <a class="bl-byline-n" href={`/insights/writers/${authorSlug}/`}>{meta.author}</a>
          <span class="bl-byline-m"><time datetime={isoDate(meta.date)}>{formatDate(meta.date)}</time>{#if readMin} · {readMin} min read{/if}</span>
        </span>
      </div>
    </div>
  </div>
</section>

<section class="bl-abody">
  <div class="v2-wrap bl-agrid">
    <article class="bl-article" data-article>
      <SocialShareWidget social={meta.social} />

      <div class="bl-answers">
        {#if meta.tldr}
          <div class="bl-ans">
            <p class="bl-ans-k">The short answer</p>
            <p class="bl-ans-t">{meta.tldr}</p>
          </div>
        {/if}
        <div class="bl-ans dark">
          <p class="bl-ans-k"><svg viewBox="0 0 651.59 348.34" aria-hidden="true"><path d={APP_MARK_PATH} fill="#e03127" stroke="#e03127" stroke-width="9" /></svg>Your answer</p>
          <p class="bl-ans-t">Only your own readings can say what this looks like for you. Two minutes tomorrow morning is where that starts.</p>
          <a class="bl-ans-btn" data-dl-cta href="/#download">Get the free app</a>
        </div>
      </div>

      <div class="article-prose bl-prose" data-prose>
        <svelte:component this={data.content} />
      </div>

      {#if meta.faq?.length}
        <section class="bl-afaq">
          <h2 class="bl-sub-h">Frequently asked questions</h2>
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

      {#if bio}
        <section class="bl-author">
          <span class="bl-avatar lg" aria-hidden="true">{#if photo}<img src={photo} alt="" width="64" height="64" loading="lazy" />{:else}{initials}{/if}</span>
          <div>
            <p class="bl-ans-k">Written by</p>
            <h2><a href={`/insights/writers/${authorSlug}/`}>{meta.author}</a></h2>
            <p>{bio}</p>
          </div>
        </section>
      {/if}
    </article>

    <aside class="bl-rail">
      <div class="bl-rail-card" data-toc-card hidden>
        <p class="bl-ans-k">On this page</p>
        <nav class="bl-toc" data-toc aria-label="On this page"></nav>
      </div>
      <div class="bl-rail-card dark">
        <span class="v2-appicon sm"><svg viewBox="0 0 651.59 348.34" aria-hidden="true"><path d={APP_MARK_PATH} fill="#e03127" stroke="#e03127" stroke-width="9" /></svg></span>
        <p class="bl-rail-h">See it in your own numbers.</p>
        <p class="bl-rail-s">A two-minute HRV reading each morning, scored against your own baseline. Free on iPhone and Android.</p>
        <Stores tone="glass" stack />
      </div>
      <div class="bl-rail-share">
        <span>Share</span>
        {#each shares as s}<a href={s.href} target="_blank" rel="noopener noreferrer">{s.label}</a>{/each}
      </div>
    </aside>
  </div>
</section>

{#if related.length}
  <section class="v2-sec white">
    <div class="v2-wrap">
      <div class="v2-headrow end">
        <div><p class="v2-eyebrow">Keep reading</p><h2 class="v2-h2 sm">Related answers</h2></div>
        {#if primaryCat}<a class="v2-link bl-headlink" href={`/insights/${primaryCat}/`}>More on {topicLabel(primaryCat)} →</a>{/if}
      </div>
      <div class="bl-grid">
        {#each related as a (a.slug)}<PostCard article={a} />{/each}
      </div>
    </div>
  </section>
{/if}

<BlogCta />

{@html articleScript}
