<script lang="ts">
  import InsightsSidebar from './InsightsSidebar.svelte';
</script>

<!-- Two-column blog shell: sticky sidebar on the left, article content on the right. -->
<div class="insights-cols wrap">
  <div class="insights-main">
    <slot />
  </div>
  <aside class="insights-side">
    <InsightsSidebar />
  </aside>
</div>
