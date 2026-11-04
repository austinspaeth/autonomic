<script lang="ts">
  import BlogHero from '$lib/v2/blog/BlogHero.svelte';
  import PostRow from '$lib/v2/blog/PostRow.svelte';
  import BlogCta from '$lib/v2/blog/BlogCta.svelte';
  import { page } from '$app/stores';
  import type { Article } from '../../../../api/articles/types';
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

<BlogHero crumbs={[{ href: '/insights/', label: 'Blog' }, { label: 'Writers' }]} eyebrow="Writer" title={name} lead={writer?.about ?? ''}>
  <svelte:fragment slot="top">{#if writer?.photo}<span class="bl-avatar xl"><img src={writer.photo} alt={name} width="96" height="96" /></span>{/if}</svelte:fragment>
</BlogHero>

<section class="v2-sec bl-sec-top">
  <div class="v2-wrap">
    <div class="v2-headrow end"><div><p class="v2-eyebrow">{articles.length} articles</p><h2 class="v2-h2 sm">Written by {name}</h2></div></div>
    {#if articles.length}
      <div class="bl-rows">{#each articles as a (a.slug)}<PostRow article={a} />{/each}</div>
    {:else}
      <p class="bl-empty">No articles yet.</p>
    {/if}
  </div>
</section>

<BlogCta />
