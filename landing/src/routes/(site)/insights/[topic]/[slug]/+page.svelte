<script lang="ts">
  import type { Article } from '../../../../api/articles/types';
  import ArticleCover from '$lib/ArticleCover.svelte';
  import SocialShareWidget from '$lib/SocialShareWidget.svelte';
  import { formatDate, isoDate, APP_MARK_PATH, pricing, rating } from '$lib/site';
  import PostCard from '$lib/v2/blog/PostCard.svelte';
  import Stores from '$lib/v2/Stores.svelte';
  import BlogAppBand from '$lib/v2/blog/BlogAppBand.svelte';
  import ArticleAppCard from '$lib/v2/blog/ArticleAppCard.svelte';
  import FeatureScreen from '$lib/v2/blog/FeatureScreen.svelte';
  import Qr from '$lib/v2/Qr.svelte';
  import StarRow from '$lib/v2/StarRow.svelte';
  import { TOPIC_PAGE, firstSentence } from '$lib/v2/blogData';
  import { pitchFor, TOPIC_CONDITION, type ArticleApp } from '$lib/v2/articlePitch';
  import { CONDITIONS } from '$lib/v2/conditions';
  import { appLd, APP_ID } from '$lib/v2/appLd';
  import type { Citation } from './+page';
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
    /** When the article was last checked against its sources (YYYY-MM-DD). */
    reviewed?: string;
    /** The plain question the article answers, shown above the title. */
    question?: string;
    /** The app feature this article leads to, and the lines that tie them. */
    app?: ArticleApp;
  };
  export let data: { content: any; meta: Meta; articles?: Article[]; citations?: Citation[]; wordCount?: number };

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

  // The question this answers: its own field, else a title that is one.
  $: question = meta.question || (/\?\s*$/.test(meta.title) ? meta.title : '');
  $: showQuestion = !!meta.question && meta.question.trim() !== meta.title.trim();
  $: pitch = pitchFor(meta.app, primaryCat);
  $: band = TOPIC_PAGE[primaryCat ?? ''] ?? TOPIC_PAGE.basics;
  $: condLink = TOPIC_CONDITION[primaryCat ?? ''];
  // The short answer leads with its first sentence; the rest reads as detail.
  $: tldrLead = firstSentence(meta.tldr ?? '');
  $: tldrRest = (meta.tldr ?? '').slice(tldrLead.length).trim();
  $: condition = condLink ? CONDITIONS.find((c) => c.href === condLink.href) : undefined;

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
  // The app card is rendered after the body; it belongs before the heading
  // about halfway through, while the reader is still reading. Never before
  // the second section, never after the last.
  var art = document.querySelector('[data-article]');
  var card = document.querySelector('[data-app-card]');
  if (card && hs.length >= 3) {
    var k = Math.min(hs.length - 1, Math.max(2, Math.round(hs.length / 2)));
    hs[k].parentNode.insertBefore(card, hs[k]);
  }

  var bar = document.querySelector('[data-read-bar]');
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

  // "Questions people also ask": scored by shared topics (the primary topic
  // counts double) and shared keywords, newest breaking ties.
  $: related = (() => {
    const cats = meta.categories ?? [];
    const words = new Set((meta.keywords ?? '').toLowerCase().split(/[,\s]+/).filter((w) => w.length > 3));
    const score = (a: Article) =>
      (a.categories ?? []).reduce((n, c) => n + (c === primaryCat ? 2 : cats.includes(c) ? 1 : 0), 0) +
      (a.keywords ?? '').toLowerCase().split(/[,\s]+/).filter((w) => words.has(w)).length * 0.25;
    return (data.articles ?? [])
      .filter((a) => a.slug !== meta.slug)
      .map((a) => ({ a, s: score(a) }))
      .sort((x, y) => y.s - x.s)
      .slice(0, 6)
      .map((x) => x.a);
  })();

  // Reader share links, pure anchors so they work with no client JS (csr=false).
  $: shareUrl = encodeURIComponent(canonical);
  $: shareText = encodeURIComponent(meta.title);
  $: shares = [
    { label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`, icon: 'M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z' },
    { label: 'X', href: `https://twitter.com/intent/tweet?url=${shareUrl}&text=${shareText}`, icon: 'M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.21-6.82-5.97 6.82H1.67l7.73-8.84L1.25 2.25h6.83l4.71 6.23 5.45-6.23zm-1.16 17.52h1.83L7.08 4.13H5.12l11.96 15.64z' },
    { label: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}`, icon: 'M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z' },
    { label: 'Reddit', href: `https://www.reddit.com/submit?url=${shareUrl}&title=${shareText}`, icon: 'M24 11.78a2.6 2.6 0 0 0-4.42-1.86 12.8 12.8 0 0 0-6.9-2.19l1.17-5.5 3.82.81a1.85 1.85 0 1 0 .19-.91l-4.27-.9a.47.47 0 0 0-.56.36l-1.31 6.14a12.83 12.83 0 0 0-7 2.19 2.6 2.6 0 1 0-2.86 4.25 5.1 5.1 0 0 0-.06.78c0 3.97 4.62 7.2 10.32 7.2s10.32-3.23 10.32-7.2a5 5 0 0 0-.06-.77A2.6 2.6 0 0 0 24 11.78zM6.67 13.6a1.85 1.85 0 1 1 3.7 0 1.85 1.85 0 0 1-3.7 0zm10.38 4.9c-1.27 1.27-3.7 1.37-5.05 1.37s-3.78-.1-5.05-1.37a.55.55 0 0 1 .78-.78c.8.8 2.5 1.09 4.27 1.09s3.47-.29 4.27-1.09a.55.55 0 0 1 .78.78zm-.32-3.05a1.85 1.85 0 1 1 0-3.7 1.85 1.85 0 0 1 0 3.7z' }
  ];

  $: authorId = `https://autonomic.care/insights/writers/${authorSlug}/#person`;
  $: ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        '@id': `${canonical}#article`,
        headline: meta.title,
        ...(question && question !== meta.title ? { alternativeHeadline: question } : {}),
        description: meta.description || meta.summary,
        ...(meta.tldr ? { abstract: meta.tldr } : {}),
        image: [ogImage, ...(meta.photoLocation && ogCard ? [meta.photoLocation.startsWith('/') ? `https://autonomic.care${meta.photoLocation}` : meta.photoLocation] : [])],
        datePublished: isoDate(meta.date),
        dateModified: isoDate(meta.updated || meta.date),
        inLanguage: 'en-US',
        url: canonical,
        mainEntityOfPage: { '@type': 'WebPage', '@id': canonical, ...(meta.reviewed ? { lastReviewed: isoDate(meta.reviewed) } : {}) },
        articleSection: topicLabel(primaryCat),
        ...(meta.keywords ? { keywords: meta.keywords } : {}),
        ...(data.wordCount ? { wordCount: data.wordCount } : {}),
        ...(readMin ? { timeRequired: `PT${readMin}M` } : {}),
        ...(condition ? { about: { '@type': 'MedicalCondition', name: condition.title, url: `https://autonomic.care${condition.href}` } } : {}),
        mentions: { '@id': APP_ID },
        author: { '@id': authorId },
        publisher: { '@id': 'https://autonomic.care/#organization' },
        isPartOf: { '@type': 'Blog', '@id': 'https://autonomic.care/insights/#blog', name: 'Questions People Ask', url: 'https://autonomic.care/insights/' },
        breadcrumb: { '@id': `${canonical}#crumbs` },
        // The parts a voice assistant can read aloud: the question and its short answer.
        speakable: { '@type': 'SpeakableSpecification', cssSelector: ['.bl-ah1', '.bl-ans-t'] },
        ...(data.citations?.length ? { citation: data.citations.map((c) => ({ '@type': 'CreativeWork', name: c.name, url: c.url })) } : {})
      },
      {
        '@type': 'Person',
        '@id': authorId,
        name: meta.author,
        url: `https://autonomic.care/insights/writers/${authorSlug}/`,
        ...(photo ? { image: `https://autonomic.care${photo}` } : {}),
        ...(bio ? { description: bio } : {})
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${canonical}#crumbs`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://autonomic.care/' },
          { '@type': 'ListItem', position: 2, name: 'Questions People Ask', item: 'https://autonomic.care/insights/' },
          { '@type': 'ListItem', position: 3, name: topicLabel(primaryCat), item: `https://autonomic.care/insights/${primaryCat}/` },
          { '@type': 'ListItem', position: 4, name: meta.title, item: canonical }
        ]
      },
      ...(meta.faq?.length
        ? [{
            '@type': 'FAQPage',
            '@id': `${canonical}#faq`,
            mainEntity: meta.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } }))
          }]
        : []),
      appLd()
    ]
  };
</script>

<svelte:head>
  <title>{meta.title} | Autonomic</title>
  <meta name="description" content={meta.description || meta.summary} />
  <meta name="author" content={meta.author} />
  <link rel="canonical" href={canonical} />

  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="Autonomic" />
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
  <meta name="twitter:label1" content="Reading time" />
  <meta name="twitter:data1" content={readMin ? `${readMin} minutes` : meta.author} />
  <meta name="twitter:label2" content="Filed under" />
  <meta name="twitter:data2" content={topicLabel(primaryCat)} />

  {@html `<script type="application/ld+json">${JSON.stringify(ld)}<\/script>`}
</svelte:head>

<section class="bl-ahero">
  <figure class="bl-ahero-bg">
    <ArticleCover photoLocation={meta.photoLocation} photoAttribution={meta.photoAttribution} title={meta.title} slug={meta.slug} category={primaryCat} showTag={false} eager />
    {#if meta.photoLocation && meta.photoAttribution}<figcaption>© {meta.photoAttribution}</figcaption>{/if}
  </figure>
  <div class="v2-wrap bl-ahero-in">
    <div class="bl-ahero-copy">
      <nav class="bl-crumb" aria-label="Breadcrumb">
        <a href="/insights/">Questions people ask</a>
        {#if primaryCat}<span aria-hidden="true">/</span><a href={`/insights/${primaryCat}/`}>{topicLabel(primaryCat)}</a>{/if}
      </nav>
      {#if showQuestion}<p class="bl-aq"><span aria-hidden="true">“</span>{meta.question}<span aria-hidden="true">”</span></p>{/if}
      <h1 class="bl-ah1">{meta.title}</h1>
      {#if meta.summary}<p class="bl-lead">{meta.summary}</p>{/if}
      <div class="bl-byline">
        <span class="bl-avatar" aria-hidden="true">{#if photo}<img src={photo} alt="" width="48" height="48" />{:else}{initials}{/if}</span>
        <span>
          <a class="bl-byline-n" href={`/insights/writers/${authorSlug}/`}>{meta.author}</a>
          <span class="bl-byline-m"><time datetime={isoDate(meta.date)}>{formatDate(meta.date)}</time>{#if meta.reviewed} · Reviewed <time datetime={isoDate(meta.reviewed)}>{formatDate(meta.reviewed)}</time>{:else if meta.updated && meta.updated !== meta.date} · Updated <time datetime={isoDate(meta.updated)}>{formatDate(meta.updated)}</time>{/if}{#if readMin} · {readMin} min read{/if}</span>
        </span>
      </div>
      {#if meta.categories?.length}
        <div class="bl-atags">
          {#each meta.categories as c}<a href={`/insights/${c}/`}>{topicLabel(c)}</a>{/each}
        </div>
      {/if}
    </div>
  </div>
</section>

<section class="bl-abody">
  <div class="v2-wrap bl-agrid">
    <article class="bl-article" data-article data-slug={meta.slug} data-feature={pitch.feature}>
      <SocialShareWidget social={meta.social} />

      <div class="bl-answers">
        {#if meta.tldr}
          <div class="bl-ans">
            <p class="bl-ans-k">The short answer</p>
            <p class="bl-ans-t"><b>{tldrLead}</b>{#if tldrRest} {tldrRest}{/if}</p>
          </div>
        {/if}
        <div class="bl-ans dark" data-cta="article_answer_box">
          <p class="bl-ans-k"><svg viewBox="0 0 651.59 348.34" aria-hidden="true"><path d={APP_MARK_PATH} fill="#e03127" stroke="#e03127" stroke-width="9" /></svg>Your answer</p>
          <p class="bl-ans-t">{pitch.hook === pitch.featureHook ? 'Only your own numbers can say what this looks like for you.' : pitch.featureHook}</p>
          <div class="bl-ans-go">
            <a class="bl-ans-btn" data-dl-cta href="/#download">Get the free app</a>
            <a class="bl-ans-link" href={pitch.href} data-cta="article_answer_link">How it works</a>
          </div>
        </div>
      </div>

      <div class="article-prose bl-prose" data-prose>
        <svelte:component this={data.content} />
      </div>

      <ArticleAppCard {pitch} />

      {#if meta.faq?.length}
        <section class="bl-afaq">
          <h2 class="bl-sub-h">Questions people also ask about this</h2>
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
      <a class="bl-rail-card bl-rail-app" href="/#download" data-cta="article_rail" data-feature={pitch.feature} data-dl-cta aria-label="Get Autonomic on your phone">
        <span class="bl-rail-ph" aria-hidden="true"><FeatureScreen feature="progress" w={170} /></span>
        <span class="bl-rail-app-b">
          <b>Get it on your phone</b>
          <span>Free to download, with every feature for {pricing.trialDays} days.</span>
          <span class="bl-rail-qr"><Qr /></span>
          <span class="bl-rail-rate"><StarRow /><b>{rating.label}</b></span>
        </span>
      </a>
      <div class="bl-rail-share">
        <span>Share</span>
        {#each shares as sh}
          <a href={sh.href} target="_blank" rel="noopener noreferrer" aria-label={`Share on ${sh.label}`} title={`Share on ${sh.label}`} data-share={sh.label}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d={sh.icon} /></svg>
          </a>
        {/each}
      </div>
    </aside>
  </div>
</section>

<BlogAppBand title={band.title} sub={band.sub} rows={band.rows} link={condLink ? { href: condLink.href, name: `How Autonomic helps with ${condLink.name}` } : band.link} />

{#if related.length}
  <section class="v2-sec" data-list="related">
    <div class="v2-wrap">
      <div class="v2-headrow end">
        <div><h2 class="v2-h2 sm">Questions people also ask</h2></div>
        {#if primaryCat}<a class="v2-link bl-headlink" href={`/insights/${primaryCat}/`}>More on {topicLabel(primaryCat)} →</a>{/if}
      </div>
      <div class="bl-grid">
        {#each related as a (a.slug)}<PostCard article={a} />{/each}
      </div>
    </div>
  </section>
{/if}

{@html articleScript}
