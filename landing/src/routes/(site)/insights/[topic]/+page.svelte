<script lang="ts">
  import { page } from '$app/stores';
  import type { Article } from '../../../api/articles/types';
  import { articleHref } from '$lib/site';
  import { getTopic, topicLabel, topicArticles } from '$lib/topics';
  import BlogHero from '$lib/v2/blog/BlogHero.svelte';
  import FeaturedPost from '$lib/v2/blog/FeaturedPost.svelte';
  import PostCard from '$lib/v2/blog/PostCard.svelte';
  import BlogCta from '$lib/v2/blog/BlogCta.svelte';
  import { TOPIC_GUIDES, GROUP_VISIBLE } from '$lib/topicGuides';

  export let data: { articles?: Article[] };

  $: slug = $page.params.topic ?? '';
  $: topic = getTopic(slug);
  $: longName = topic?.longName ?? topicLabel(slug);
  $: inTopic = topicArticles(data.articles ?? [], slug);
  $: featured = inTopic[0];
  $: rest = inTopic.slice(1);

  // A topic with a guide reads as one: orientation, a path, grouped questions,
  // then every article newest first (the latest included, no separate feature).
  $: guide = TOPIC_GUIDES[slug];
  $: bySlug = new Map((data.articles ?? []).map((a) => [a.slug, a]));
  $: startPath = (guide?.start ?? [])
    .map((s) => ({ ...s, article: bySlug.get(s.slug) }))
    .filter((s): s is typeof s & { article: Article } => Boolean(s.article));
  $: startMin = startPath.reduce((n, s) => n + (s.article.readMin ?? 0), 0);
  $: groups = (guide?.groups ?? [])
    .map((g) => ({ ...g, posts: g.slugs.map((x) => bySlug.get(x)).filter((a): a is Article => Boolean(a)) }))
    .filter((g) => g.posts.length);
  $: everything = [...inTopic].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  $: short = topic?.shortName ?? longName;
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

<BlogHero crumbs={[{ href: '/insights/', label: 'Blog' }, { label: longName }]} title={longName} lead={topic?.description ?? ''} />

{#if guide}
  <section class="v2-sec tg-intro-sec">
    <div class="v2-wrap tg-intro" class:solo={!guide.facts?.length}>
      <div class="tg-intro-copy">
        <h2 class="v2-h2 sm">{guide.heading ?? `What ${short} actually is`}</h2>
        {#each guide.intro as para}<p class="tg-p">{para}</p>{/each}
      </div>
      {#if guide.facts?.length}
        <aside class="tg-facts" aria-label="{short} at a glance">
          <p class="tg-facts-h">{guide.factsTitle ?? 'At a glance'}</p>
          {#each guide.facts as f}<div class="tg-fact"><b>{f.big}</b><span>{f.label}</span></div>{/each}
        </aside>
      {/if}
    </div>
  </section>

  {#if startPath.length}
    <section class="v2-sec nopad-top">
      <div class="v2-wrap bl-start">
        <div class="bl-start-head">
          <h2 class="v2-h2 sm">{(guide.startTitle ?? `New to ${short}? Read these {n} first.`).replace('{n}', String(startPath.length))}</h2>
          <p class="v2-sub">{guide.startSub ?? 'Read them in order. Each one builds on the one before.'}</p>
          {#if startMin}<p class="bl-start-total"><span></span>About {startMin} minutes total</p>{/if}
        </div>
        <ol class="bl-pillars">
          {#each startPath as s, i (s.slug)}
            <li>
              <a href={articleHref(s.article)} class:last={i === startPath.length - 1}>
                <span class="bl-pillar-n">{String(i + 1).padStart(2, '0')}</span>
                <span class="bl-pillar-b"><b>{s.article.title}</b><span>{[s.why, s.article.readMin ? `${s.article.readMin} min` : ''].filter(Boolean).join(' · ')}</span></span>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
              </a>
            </li>
          {/each}
        </ol>
      </div>
    </section>
  {/if}

  {#if groups.length}
    <section class="v2-sec nopad-top">
      <div class="v2-wrap">
        <div class="v2-headrow end"><div><h2 class="v2-h2 sm">{guide.groupsTitle ?? `${short}, by what you are dealing with`}</h2></div></div>
        <nav class="tg-jump" aria-label="Jump to a section">
          {#each groups as g}<a href={`#${g.id}`}>{g.title}</a>{/each}
        </nav>
        <div class="tg-groups">
          {#each groups as g (g.id)}
            <div class="tg-group" id={g.id}>
              <div class="tg-group-h"><h3>{g.title}</h3><span>{g.posts.length}</span></div>
              <p class="tg-group-b">{g.blurb}</p>
              {#each g.posts.slice(0, GROUP_VISIBLE) as a (a.slug)}<a class="bl-topic-a" href={articleHref(a)}>{a.title}</a>{/each}
              {#if g.posts.length > GROUP_VISIBLE}
                <details class="tg-more">
                  <summary><span class="tg-more-o">Show {g.posts.length - GROUP_VISIBLE} more</span><span class="tg-more-c">Show fewer</span></summary>
                  {#each g.posts.slice(GROUP_VISIBLE) as a (a.slug)}<a class="bl-topic-a" href={articleHref(a)}>{a.title}</a>{/each}
                </details>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    </section>
  {/if}

  <section class="v2-sec white">
    <div class="v2-wrap">
      <div class="v2-headrow end">
        <div><h2 class="v2-h2 sm">Everything on {short}</h2></div>
        <a class="v2-link bl-headlink" href={`/insights/articles/${slug}/`}>As a list →</a>
      </div>
      <div class="bl-grid">
        {#each everything as a (a.slug)}<PostCard article={a} />{/each}
      </div>
    </div>
  </section>
{:else}
  {#if featured}
    <section class="v2-sec bl-sec-top">
      <div class="v2-wrap"><FeaturedPost article={featured} kicker="Newest in {topic?.shortName ?? longName}" showTopic={false} /></div>
    </section>
  {/if}

  {#if rest.length}
    <section class="v2-sec white">
      <div class="v2-wrap">
        <div class="v2-headrow end">
          <div><p class="v2-eyebrow">{inTopic.length} answers</p><h2 class="v2-h2 sm">Everything on {topic?.shortName ?? longName}</h2></div>
          <a class="v2-link bl-headlink" href={`/insights/articles/${slug}/`}>As a list →</a>
        </div>
        <div class="bl-grid">
          {#each rest as a (a.slug)}<PostCard article={a} />{/each}
        </div>
      </div>
    </section>
  {/if}
{/if}

{#if !inTopic.length}
  <p class="bl-empty">No articles in this topic yet, check back soon.</p>
{/if}

<BlogCta />
