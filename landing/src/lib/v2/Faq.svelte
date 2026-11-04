<script lang="ts">
  export let items: { q: string; a: string }[];
  export let title = 'Good to know';
  export let id = '';
</script>

<section class="v2-sec" id={id || undefined}>
  <div class="v2-wrap v2-narrow">
    <h2 class="v2-h2 sm">{title}</h2>
    <div class="faq">
      {#each items as f}
        <details><summary>{f.q}<span class="fq-i">+</span></summary><p>{f.a}</p></details>
      {/each}
    </div>
  </div>
</section>
