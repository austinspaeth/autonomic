<!-- The newest guides for one topic, as the blog's own cards: the six most
     recent articles filed under (or matching) the topic, newest first, so a
     condition page always ends on what was written most recently for it. -->
<script lang="ts">
  import { page } from '$app/stores';
  import type { Article } from '../../routes/api/articles/types';
  import { topicArticles, getTopic } from '$lib/topics';
  import PostCard from './blog/PostCard.svelte';
  export let topic: string;
  export let title: string;
  export let count = 6;
  export let white = false;
  $: all = ($page.data.articles ?? []) as Article[];
  $: latest = topicArticles(all, topic)
    .slice()
    .sort((a, b) => (b.updated || b.date).localeCompare(a.updated || a.date))
    .slice(0, count);
  $: hubName = getTopic(topic)?.shortName ?? 'this topic';
</script>

{#if latest.length}
  <section class="v2-sec" class:white>
    <div class="v2-wrap">
      <div class="v2-headrow end">
        <div><h2 class="v2-h2 sm">{title}</h2></div>
        <a class="v2-link bl-headlink" href="/insights/{topic}/">Every guide on {hubName} →</a>
      </div>
      <div class="bl-grid">
        {#each latest as a (a.slug)}<PostCard article={a} />{/each}
      </div>
    </div>
  </section>
{/if}
