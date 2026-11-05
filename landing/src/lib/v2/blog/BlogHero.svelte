<!-- The plum header every blog page opens on: a crumb or eyebrow, a big title,
     a lead, and a slot under it (topic chips, an author line). Pass `photo` for
     a picture behind it (the topic pages). Pass `latest` and
     the hero wears that article's cover under the article page's tint, with the
     question and its short answer set under a divider. -->
<script lang="ts">
  import type { Article } from '../../../routes/api/articles/types';
  import ArticleCover from '$lib/ArticleCover.svelte';
  import { articleHref, formatDate } from '$lib/site';
  import { topicLabel } from '$lib/topics';
  import { shortAnswer } from '../blogData';
  export let eyebrow = '';
  export let title: string;
  export let lead = '';
  export let crumbs: { href?: string; label: string }[] = [];
  export let size: 'xl' | 'lg' = 'lg';
  export let latest: Article | undefined = undefined;
  /** A photo behind the hero (a topic page's), under the same tint as a cover. */
  export let photo = '';
  export let photoPos = '60% 30%';
  export let photoFlip = false;
</script>

<section class="bl-hero" class:photo={latest || photo} class:topic={photo && !latest}>
  {#if photo && !latest}
    <figure class="bl-hero-bg" aria-hidden="true"><img class="bl-hero-photo" src={photo} alt="" width="1600" height="900" fetchpriority="high" style="object-position: {photoPos}{photoFlip ? '; transform: scaleX(-1)' : ''}" /></figure>
  {:else if latest}
    <figure class="bl-hero-bg" aria-hidden="true">
      <ArticleCover photoLocation={latest.photoLocation} photoAttribution={latest.photoAttribution} title={latest.title} slug={latest.slug} category={latest.categories?.[0]} showTag={false} eager />
    </figure>
  {:else}
    <div class="bl-hero-glow" aria-hidden="true"></div>
  {/if}
  <div class="v2-wrap bl-hero-in">
    {#if crumbs.length}
      <nav class="bl-crumb" aria-label="Breadcrumb">
        {#each crumbs as c, i}
          {#if i}<span aria-hidden="true">/</span>{/if}
          {#if c.href}<a href={c.href}>{c.label}</a>{:else}<span>{c.label}</span>{/if}
        {/each}
      </nav>
    {/if}
    <slot name="top" />
    {#if eyebrow}<p class="bl-eyebrow">{eyebrow}</p>{/if}
    <h1 class="bl-h1" class:xl={size === 'xl'}>{title}</h1>
    {#if lead}<p class="bl-lead">{lead}</p>{/if}
    <slot />

    {#if latest}
      <a class="bl-latest" href={articleHref(latest)}>
        <span class="bl-latest-k"><span class="bl-latest-dot" aria-hidden="true"></span>Latest question{#if latest.categories?.[0]}<span class="bl-latest-topic">{topicLabel(latest.categories[0])}</span>{/if}</span>
        <span class="bl-latest-t">{latest.title}</span>
        {#if shortAnswer(latest)}<span class="bl-latest-a"><b>Short answer</b>{shortAnswer(latest)}</span>{/if}
        <span class="bl-latest-foot">
          <span class="bl-latest-go">Read the full answer<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg></span>
          <span class="bl-latest-m">{[latest.author, latest.date ? formatDate(latest.date) : '', latest.readMin ? `${latest.readMin} min` : ''].filter(Boolean).join(' · ')}</span>
        </span>
      </a>
    {/if}
  </div>
  {#if latest?.photoLocation && latest.photoAttribution}<p class="bl-hero-credit">© {latest.photoAttribution}</p>{/if}
</section>
