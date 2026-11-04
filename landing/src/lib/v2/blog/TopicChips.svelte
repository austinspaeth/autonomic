<!-- "I am here about": topic hubs as pills on the plum hero. Pass `items` (topic
     slugs) to choose and order them; otherwise every topic in the bar. -->
<script lang="ts">
  import { barTopics, getTopic, type Topic } from '$lib/topics';
  export let active = '';
  export let label = 'I am here about';
  export let items: string[] = [];
  const list: Topic[] = items.length ? items.map((s) => getTopic(s)).filter((t): t is Topic => Boolean(t)) : barTopics();
</script>

<div class="bl-chips">
  {#if label}<span class="bl-chips-l">{label}</span>{/if}
  {#each list as t}
    <a class="bl-chip" class:on={t.slug === active} href={`/insights/${t.slug}/`}>{t.shortName}</a>
  {/each}
</div>
