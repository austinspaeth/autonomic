<script lang="ts">
  import type { Article } from '../api/articles/types';
  import ArticleCover from '$lib/ArticleCover.svelte';
  import ArticleCard from '$lib/ArticleCard.svelte';
  export let data: { articles?: Article[] };

  const articles: Article[] = data.articles ?? [];
  $: featured = articles[0];
  $: rest = articles.slice(1);

  const fmtDate = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
</script>

<svelte:head>
  <title>The Autonomic Blog — HRV, POTS &amp; dysautonomia recovery</title>
  <meta
    name="description"
    content="Practical, evidence-aware writing on HRV, POTS, dysautonomia and post-viral recovery — how to read your autonomic data and turn it into better days."
  />
  <link rel="canonical" href="https://autonomic.app/blog/" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="The Autonomic Blog" />
  <meta property="og:description" content="HRV, POTS and dysautonomia recovery, explained for the people living it." />
</svelte:head>

<section class="section">
  <div class="wrap">
    <div class="blog-head">
      <p class="eyebrow">The Autonomic blog</p>
      <h1 class="h2">Reading your nervous system, in plain language.</h1>
      <p class="lead" style="margin: 0 auto;">Field notes on HRV, POTS, dysautonomia and post-viral recovery — what the numbers mean, and how to turn them into better days.</p>
    </div>

    {#if featured}
      <a class="blog-featured" href={`/blog/${featured.slug}/`}>
        <div class="bf-art">
          <ArticleCover
            photoLocation={featured.photoLocation}
            photoAttribution={featured.photoAttribution}
            title={featured.title}
            slug={featured.slug}
            category={featured.categories?.[0]}
            eager
          />
        </div>
        <div class="bf-body">
          <p class="bf-eyebrow">Featured · {fmtDate(featured.date)} · {featured.author}</p>
          <h2 class="bf-title">{featured.title}</h2>
          <p class="bf-sum">{featured.summary}</p>
          <span class="bf-more">Read the full article →</span>
        </div>
      </a>
    {/if}

    {#if rest.length}
      <div class="blog-list">
        {#each rest as a (a.slug)}
          <ArticleCard article={a} />
        {/each}
      </div>
    {/if}

    {#if !articles.length}
      <p class="blog-empty">No articles yet — the first posts are on the way. Join the waitlist to get them in your inbox.</p>
    {/if}
  </div>
</section>
