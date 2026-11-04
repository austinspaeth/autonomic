<!-- The page's numbered reference list, rendered at the end of its Explainer.
     Each entry is a checked record from sources.ts, with a plain line on what
     the page uses it for, so a reader can see why it is there. -->
<script lang="ts">
  import { SOURCES_REVIEWED, type Source } from './sources';
  export let items: Source[];
  const reviewed = new Date(SOURCES_REVIEWED + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
</script>

<div class="v2-sources" id="sources">
  <div class="v2-sources-head"><h3>Sources</h3><span>Checked {reviewed}</span></div>
  <ol>
    {#each items as s, i}
      <li id="src-{i + 1}">
        <a href={s.url} target="_blank" rel="noopener">{s.title}</a>
        <span class="v2-sources-by">{s.authors}{s.authors.endsWith('.') ? '' : '.'} <em>{s.where}</em>, {s.year}.</span>
        <span class="v2-sources-why">{s.note}</span>
      </li>
    {/each}
  </ol>
</div>
