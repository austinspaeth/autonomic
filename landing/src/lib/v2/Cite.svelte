<!-- An inline citation: a superscript number that jumps to the page's Sources
     list (Sources.svelte), which numbers its entries in the same order. -->
<script lang="ts">
  export let n: number | number[];
  $: list = Array.isArray(n) ? n : [n];
</script>

<sup class="v2-cite">{#each list as k, i}{#if i},{/if}<a href="#src-{k}" aria-label="Source {k}">{k}</a>{/each}</sup>
