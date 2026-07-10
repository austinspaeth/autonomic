<script lang="ts">
  import { page } from '$app/stores';
  import type { Article } from '../../../api/articles/types';
  import ArticleLine from '$lib/ArticleLine.svelte';
  import InsightsShell from '$lib/InsightsShell.svelte';
  import { getWriter, writerName } from '$lib/writers';

  export let data: { articles?: Article[] };

  $: slug = $page.params.writer ?? '';
  $: writer = getWriter(slug);
  $: name = writerName(slug);
  $: articles = (data.articles ?? []).filter(
    (a) => a.author?.trim().replace(/\s+/g, '-').toLowerCase() === slug
  );
  $: canonical = `https://autonomic.care/insights/writers/${slug}/`;

  $: profileLd = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    url: canonical,
    dateModified: articles[0]?.updated || articles[0]?.date,
    mainEntity: {
      '@type': 'Person',
      '@id': `${canonical}#person`,
      name,
      description: writer?.about,
      url: canonical,
      jobTitle: 'Writer',
      worksFor: { '@id': 'https://autonomic.care/#organization' }
    }
  };
</script>

<svelte:head>
  <title>{name} | The Autonomic Blog</title>
  <meta name="description" content={writer?.about ?? `Articles by ${name}.`} />
  <link rel="canonical" href={canonical} />
  {#if !writer}<meta name="robots" content="noindex, follow" />{/if}
  <meta property="og:type" content="profile" />
  <meta property="og:url" content={canonical} />
  <meta property="og:title" content={`${name} | The Autonomic Blog`} />
  <meta property="og:description" content={writer?.about ?? `Articles by ${name}.`} />
  <meta property="og:image" content="https://autonomic.care/og.png" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={`${name} | The Autonomic Blog`} />
  <meta name="twitter:description" content={writer?.about ?? `Articles by ${name}.`} />
  <meta name="twitter:image" content="https://autonomic.care/og.png" />
  {@html `<script type="application/ld+json">${JSON.stringify(profileLd)}<\/script>`}
</svelte:head>

<InsightsShell>
  <div class="articles-index">
    <a class="article-back" href="/insights/">← Blog home</a>
    <section class="author-box author-box--lead">
      <p class="author-eyebrow">Writer</p>
      <h1 class="author-name">{name}</h1>
      {#if writer?.about}<p class="author-bio">{writer.about}</p>{/if}
    </section>

    <h2 class="insights-section-title">Articles by {name}</h2>
    <div class="article-lines">
      {#each articles as a (a.slug)}
        <ArticleLine article={a} />
      {/each}
    </div>
    {#if !articles.length}
      <p class="blog-empty">No articles yet.</p>
    {/if}
  </div>
</InsightsShell>
