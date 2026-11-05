<script lang="ts">
  import type { Article } from '../../api/articles/types';
  import { APP_MARK_PATH, articleHref, PILLARS } from '$lib/site';
  import { barTopics, topicArticles, topicLabel } from '$lib/topics';
  import { writerSlug } from '$lib/writers';
  import ogCards from '$lib/og-cards.json';
  import { CONDITIONS } from '$lib/v2/conditions';
  import { appLd, APP_ID } from '$lib/v2/appLd';
  import BlogAppBand from '$lib/v2/blog/BlogAppBand.svelte';
  import BlogHero from '$lib/v2/blog/BlogHero.svelte';
  import TopicChips from '$lib/v2/blog/TopicChips.svelte';
  import BlogSearch from '$lib/v2/blog/BlogSearch.svelte';
  import PostCard from '$lib/v2/blog/PostCard.svelte';
  import PostRow from '$lib/v2/blog/PostRow.svelte';
  import BlogCta from '$lib/v2/blog/BlogCta.svelte';
  import ReviewStrip from '$lib/v2/ReviewStrip.svelte';
  import { SYMPTOMS, TOPIC_PITCH, bySlugs } from '$lib/v2/blogData';

  export let data: { articles?: Article[] };

  const articles: Article[] = data.articles ?? [];
  // The hero carries the newest answer; the grid picks up after it.
  const latest = articles[0];
  const recent = articles.filter((a) => a !== latest).slice(0, 6);

  // The cornerstone guides, resolved from PILLARS against the live article list.
  const pillars = bySlugs(articles, PILLARS);
  const pillarMin = pillars.reduce((n, a) => n + (a.readMin ?? 0), 0);

  const symptoms = SYMPTOMS.map((s) => ({ ...s, posts: bySlugs(articles, s.slugs) })).filter((s) => s.posts.length);

  // One card per topic hub: its count, two answers and its page in the app.
  // "Browse by topic" covers the conditions and subjects; the app has its own hero chip.
  const shown = new Set([latest, ...recent, ...pillars].filter(Boolean).map((a) => a!.slug));
  const topicCards = barTopics()
    .filter((t) => t.slug !== 'app')
    .map((t) => {
      const inTopic = topicArticles(articles, t.slug);
      // Two answers the page has not already shown, so each card adds
      // something rather than repeating the grid above it.
      const posts = inTopic.filter((a) => !shown.has(a.slug)).slice(0, 2);
      posts.forEach((a) => shown.add(a.slug));
      return { topic: t, count: inTopic.length, posts };
    })
    .filter((c) => c.count > 0);

  /* "What is bothering you most?": a card opens its reading list under the grid.
     Without the script each card is a plain link to its first answer. */
  const symScript = `<script>
(function () {
  var cards = document.querySelectorAll('[data-sym]');
  cards.forEach(function (c) {
    c.addEventListener('click', function (e) {
      e.preventDefault();
      var id = c.getAttribute('data-sym'), open = c.getAttribute('aria-expanded') === 'true';
      cards.forEach(function (o) { o.setAttribute('aria-expanded', 'false'); });
      document.querySelectorAll('[data-sym-panel]').forEach(function (p) { p.hidden = true; });
      if (!open) {
        c.setAttribute('aria-expanded', 'true');
        var p = document.querySelector('[data-sym-panel="' + id + '"]');
        if (p) p.hidden = false;
      }
    });
  });
})();
<\/script>`;

  // Everything in the head is built from the live article list, so a new
  // article reaches the title count, the description and the structured data
  // on the next build with nothing to edit here.
  const SITE = 'https://autonomic.care';
  const URL_ = `${SITE}/insights/`;
  const title = 'Questions People Ask: POTS, Long COVID & ME/CFS | Autonomic';
  const description = `${articles.length} plain answers to what people with POTS, long COVID, ME/CFS and dysautonomia ask, from dizziness to crashes. Each starts with the short answer.`;
  const shareImage = `${SITE}/og/features/blog.jpg`;
  const abs = (src = '') => (src.startsWith('/') ? `${SITE}${src}` : src);
  const cardOf = (a: Article) => ((ogCards as Record<string, string>)[a.slug] ? `${SITE}/og/${a.slug}.jpg` : abs(a.photoLocation) || undefined);
  const day = (d?: string) => (d ? String(d).slice(0, 10) : undefined);
  // Each post points at its writer by id; the writers are described once below.
  const authorId = (name: string) => `${SITE}/insights/writers/${writerSlug(name)}/#person`;
  const writers = [...new Set(articles.map((a) => a.author))].map((name) => ({ '@type': 'Person', '@id': authorId(name), name, url: `${SITE}/insights/writers/${writerSlug(name)}/` }));

  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${URL_}#page`,
        url: URL_,
        name: 'Questions People Ask',
        headline: title,
        description,
        inLanguage: 'en-US',
        isPartOf: { '@id': `${SITE}/#website` },
        publisher: { '@id': `${SITE}/#organization` },
        primaryImageOfPage: { '@type': 'ImageObject', url: shareImage, width: 1200, height: 630 },
        breadcrumb: { '@id': `${URL_}#crumbs` },
        mainEntity: { '@id': `${URL_}#blog` },
        about: CONDITIONS.map((c) => ({ '@type': 'MedicalCondition', name: c.title, url: `${SITE}${c.href}` })),
        mentions: { '@id': APP_ID },
        hasPart: topicCards.map((c) => ({ '@type': 'CollectionPage', name: c.topic.longName, url: `${URL_}${c.topic.slug}/`, description: c.topic.description }))
      },
      {
        '@type': 'Blog',
        '@id': `${URL_}#blog`,
        url: URL_,
        name: 'Questions People Ask',
        alternateName: 'The Autonomic Blog',
        description,
        inLanguage: 'en-US',
        publisher: { '@id': `${SITE}/#organization` },
        // Every published answer, newest first: the blog's complete table of
        // contents. Kept to what identifies a post; each page carries the rest.
        ...(writers.length === 1 ? { author: { '@id': writers[0]['@id'] } } : {}),
        blogPost: articles.map((a) => ({
          '@type': 'BlogPosting',
          url: `${SITE}${articleHref(a)}`,
          headline: a.title,
          datePublished: day(a.date),
          ...(a.updated && day(a.updated) !== day(a.date) ? { dateModified: day(a.updated) } : {}),
          ...(cardOf(a) ? { image: cardOf(a) } : {}),
          ...(a.categories?.[0] ? { articleSection: topicLabel(a.categories[0]) } : {}),
          ...(writers.length > 1 ? { author: { '@id': authorId(a.author) } } : {})
        }))
      },
      {
        '@type': 'ItemList',
        '@id': `${URL_}#start`,
        name: 'Start here',
        itemListOrder: 'https://schema.org/ItemListOrderAscending',
        itemListElement: pillars.map((a, i) => ({ '@type': 'ListItem', position: i + 1, name: a.title, url: `${SITE}${articleHref(a)}` }))
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${URL_}#crumbs`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'Questions People Ask', item: URL_ }
        ]
      },
      ...writers,
      appLd()
    ]
  };
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={description} />
  <link rel="canonical" href={URL_} />
  <meta property="og:type" content="website" />
  <meta property="og:url" content={URL_} />
  <meta property="og:title" content="Questions People Ask" />
  <meta property="og:description" content={description} />
  <meta property="og:image" content={shareImage} />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="Questions People Ask: plain answers about POTS, long COVID and ME/CFS, from Autonomic." />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="Questions People Ask" />
  <meta name="twitter:description" content={description} />
  <meta name="twitter:image" content={shareImage} />
  {@html `<script type="application/ld+json">${JSON.stringify(ld)}<\/script>`}
</svelte:head>


<BlogHero size="xl" title="Questions people ask." lead="Honest answers about POTS, long COVID, ME/CFS and dysautonomia, written by someone living it. Every one starts with the short answer." {latest}>
  <TopicChips items={['pots', 'postviral', 'mecfs', 'just-diagnosed', 'supporting-someone', 'app']} />
  <BlogSearch count={articles.length} />
</BlogHero>

{#if symptoms.length}
  <section class="v2-sec bl-sec-mid">
    <div class="v2-wrap">
      <div class="v2-headrow end"><div><h2 class="v2-h2 sm">What is bothering you most?</h2></div></div>
      <div class="bl-syms">
        {#each symptoms as s}
          <a class="bl-sym" href={articleHref(s.posts[0])} data-sym={s.id} aria-expanded="false" aria-controls={`sym-${s.id}`}>
            <span class="bl-sym-t">{s.label}</span>
            <span class="bl-sym-n">{s.posts.length} answers<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></span>
          </a>
        {/each}
      </div>
      {#each symptoms as s}
        <div class="bl-sym-panel" data-list="blog_symptom" id={`sym-${s.id}`} data-sym-panel={s.id} hidden>
          <p class="bl-sym-panel-h">{s.label}</p>
          {#each s.posts as a (a.slug)}<PostRow article={a} />{/each}
          <a class="bl-pitch" href={s.app.href} data-cta={`symptom_pitch_${s.id}`}>
            <span class="v2-appicon sm" aria-hidden="true"><svg viewBox="0 0 651.59 348.34"><path d={APP_MARK_PATH} fill="#e03127" stroke="#e03127" stroke-width="9" /></svg></span>
            <span class="bl-pitch-b"><b>{s.app.name} in Autonomic</b><span>{s.app.line}</span></span>
            <svg class="bl-pitch-go" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
          </a>
        </div>
      {/each}
    </div>
  </section>
{/if}

<ReviewStrip app />

{#if recent.length}
  <section class="v2-sec white" data-list="blog_new">
    <div class="v2-wrap">
      <div class="v2-headrow end">
        <div><h2 class="v2-h2 sm">New questions, new answers.</h2></div>
        <a class="v2-link bl-headlink" href="/insights/articles/">All {articles.length} answers →</a>
      </div>
      <div class="bl-grid">
        {#each recent as a (a.slug)}<PostCard article={a} />{/each}
      </div>
    </div>
  </section>
{/if}

<BlogAppBand />

{#if pillars.length}
  <section class="v2-sec">
    <div class="v2-wrap bl-start">
      <div class="bl-start-head">
        <h2 class="v2-h2 sm">New to all this? {pillars.length} guides to help you make sense of everything.</h2>
        <p class="v2-sub">Read them in order and you will understand your nervous system better than most people ever get to.</p>
        {#if pillarMin}<p class="bl-start-total"><span></span>About {pillarMin} minutes total</p>{/if}
      </div>
      <ol class="bl-pillars" data-list="blog_start_here">
        {#each pillars as a, i (a.slug)}
          <li>
            <a href={articleHref(a)} class:last={i === pillars.length - 1}>
              <span class="bl-pillar-n">{String(i + 1).padStart(2, '0')}</span>
              <span class="bl-pillar-b"><b>{a.title}</b>{#if a.readMin}<span>{a.readMin} min</span>{/if}</span>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
            </a>
          </li>
        {/each}
      </ol>
    </div>
  </section>
{/if}

{#if topicCards.length}
  <section class="v2-sec nopad-top">
    <div class="v2-wrap">
      <div class="v2-headrow end"><div><h2 class="v2-h2 sm">Browse by topic</h2></div></div>
      <div class="bl-topics" data-list="blog_topics">
        {#each topicCards as c (c.topic.slug)}
          <div class="bl-topic">
            <a class="bl-topic-h" href={`/insights/${c.topic.slug}/`}><b>{c.topic.shortName}</b><span>{c.count}<i> answers</i></span></a>
            {#each c.posts as a (a.slug)}<a class="bl-topic-a" href={articleHref(a)}>{a.title}</a>{/each}
            {#if TOPIC_PITCH[c.topic.slug]}<a class="bl-topic-app" href={TOPIC_PITCH[c.topic.slug].href} data-cta={`topic_pitch_${c.topic.slug}`}>{TOPIC_PITCH[c.topic.slug].name} →</a>{/if}
          </div>
        {/each}
      </div>
    </div>
  </section>
{/if}

{#if !articles.length}
  <p class="bl-empty">No articles yet, the first posts are on the way.</p>
{/if}

<BlogCta />

{@html symScript}
