<!-- "Questions people ask": a reader's question, answered by a real article. A
     slug that stops resolving drops out rather than leaving a dead link. -->
<script lang="ts">
  import { page } from '$app/stores';
  import { articleHref } from '$lib/site';
  export let title: string;
  export let eyebrow = 'Questions people ask';
  export let hub: { label: string; href: string };
  export let items: { q: string; slug: string }[];
  $: articles = ($page.data.articles ?? []) as { slug: string; title: string; categories?: string[] }[];
  $: rows = items
    .map((i) => ({ ...i, a: articles.find((a) => a.slug === i.slug) }))
    .filter((r): r is typeof r & { a: NonNullable<typeof r.a> } => !!r.a);
</script>

<section class="v2-sec white">
  <div class="v2-wrap v2-qgrid">
    <div>
      {#if eyebrow}<p class="v2-eyebrow">{eyebrow}</p>{/if}
      <h2 class="v2-h2">{title}</h2>
      <a class="v2-link" href={hub.href}>{hub.label} →</a>
    </div>
    <div>
      {#each rows as r}
        <a class="v2-qrow" href={articleHref(r.a)}>
          <span><b>{r.q}</b><small>Read: {r.a?.title}</small></span>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#e5432f" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
        </a>
      {/each}
    </div>
  </div>
</section>
