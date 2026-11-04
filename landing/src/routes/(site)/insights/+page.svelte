<script lang="ts">
  import type { Article } from '../../api/articles/types';
  import { articleHref, PILLARS } from '$lib/site';
  import { barTopics, topicArticles } from '$lib/topics';
  import BlogHero from '$lib/v2/blog/BlogHero.svelte';
  import TopicChips from '$lib/v2/blog/TopicChips.svelte';
  import PostCard from '$lib/v2/blog/PostCard.svelte';
  import PostRow from '$lib/v2/blog/PostRow.svelte';
  import BlogCta from '$lib/v2/blog/BlogCta.svelte';
  import ReviewStrip from '$lib/v2/ReviewStrip.svelte';
  import { SYMPTOMS, bySlugs } from '$lib/v2/blogData';

  export let data: { articles?: Article[] };

  const articles: Article[] = data.articles ?? [];
  // The hero carries the newest answer; the grid picks up after it.
  const latest = articles[0];
  const recent = articles.filter((a) => a !== latest).slice(0, 6);

  // The cornerstone guides, resolved from PILLARS against the live article list.
  const pillars = bySlugs(articles, PILLARS);
  const pillarMin = pillars.reduce((n, a) => n + (a.readMin ?? 0), 0);

  const symptoms = SYMPTOMS.map((s) => ({ ...s, posts: bySlugs(articles, s.slugs) })).filter((s) => s.posts.length);

  // One card per topic hub: its count and newest three.
  // "Browse by topic" covers the conditions and subjects; the app has its own hero chip.
  const topicCards = barTopics()
    .filter((t) => t.slug !== 'app')
    .map((t) => {
      const inTopic = topicArticles(articles, t.slug);
      return { topic: t, count: inTopic.length, posts: inTopic.slice(0, 3) };
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

  const blogLd = {
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


<BlogHero size="xl" eyebrow="The Autonomic blog" title="Questions people ask." lead="Honest answers about POTS, long COVID, ME/CFS and dysautonomia, written by someone living it. Every one starts with the short answer." {latest}>
  <TopicChips items={['pots', 'postviral', 'mecfs', 'just-diagnosed', 'supporting-someone', 'app']} />
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
        <div class="bl-sym-panel" id={`sym-${s.id}`} data-sym-panel={s.id} hidden>
          <p class="bl-sym-panel-h">{s.label}</p>
          {#each s.posts as a (a.slug)}<PostRow article={a} />{/each}
        </div>
      {/each}
    </div>
  </section>
{/if}

<ReviewStrip app />

{#if recent.length}
  <section class="v2-sec white">
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

{#if pillars.length}
  <section class="v2-sec">
    <div class="v2-wrap bl-start">
      <div class="bl-start-head">
        <h2 class="v2-h2 sm">New to all this? {pillars.length} guides to help you make sense of everything.</h2>
        <p class="v2-sub">Read them in order and you will understand your nervous system better than most people ever get to.</p>
        {#if pillarMin}<p class="bl-start-total"><span></span>About {pillarMin} minutes total</p>{/if}
      </div>
      <ol class="bl-pillars">
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
      <div class="v2-headrow end"><div><p class="v2-eyebrow">Go deeper</p><h2 class="v2-h2 sm">Browse by topic</h2></div></div>
      <div class="bl-topics">
        {#each topicCards as c (c.topic.slug)}
          <div class="bl-topic">
            <div class="bl-topic-h"><a href={`/insights/${c.topic.slug}/`}>{c.topic.shortName}</a><span>{c.count} answers</span></div>
            {#each c.posts as a (a.slug)}<a class="bl-topic-a" href={articleHref(a)}>{a.title}</a>{/each}
            <a class="bl-topic-more" href={`/insights/${c.topic.slug}/`}>Explore {c.topic.shortName.replace(/^The /, '')} →</a>
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
