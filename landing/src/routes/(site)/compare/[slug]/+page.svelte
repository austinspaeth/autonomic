<script lang="ts">
  import { rivalBySlug } from '$lib/v2/compare';
  import ComparePage from '$lib/v2/ComparePage.svelte';
  export let data: { slug: string };
  $: rival = rivalBySlug(data.slug)!;
</script>

{#key rival.slug}<ComparePage {rival} />{/key}
