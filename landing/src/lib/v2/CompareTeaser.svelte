<!-- A short "how we compare" on a condition page: a few rows from that rival's
     comparison (compare.ts, so the facts and sources are the same ones), then a
     link to the full, cited page. -->
<script lang="ts">
  import { rivalBySlug, type Cell } from './compare';
  export let slug: string;
  export let title: string;
  export let sub: string;
  /** Row labels to show, from the rival's table, in this order. */
  export let keys: string[];
  $: r = rivalBySlug(slug)!;
  $: rows = keys.map((k) => r.rows.find((x) => x.k === k)).filter((x): x is NonNullable<typeof x> => !!x);
  const txt = (c: Cell) => (typeof c === 'string' ? c : c.t);
</script>

<section class="v2-sec white">
  <div class="v2-wrap ct">
    <div>
      <span class="ct-logos" aria-hidden="true"><img src="/apple-touch-icon.png" width="44" height="44" alt="" /><i>vs</i><img src={r.icon} width="44" height="44" alt="" /></span>
      <h2 class="v2-h2">{title}</h2>
      <p class="v2-sub">{sub}</p>
      <a class="v2-link" href="/compare/{r.slug}/" data-cta="compare_teaser_link">Read the full comparison with {r.name} →</a>
    </div>
    <div class="ct-rows">
      {#each rows as row}
        <div class="ct-row"><b>{row.k}</b><span class="us">{row.us}</span><span class="them"><img src={r.icon} width="18" height="18" alt="" />{txt(row.them)}</span></div>
      {/each}
      <a class="ct-go" href="/compare/{r.slug}/" data-cta="compare_teaser_card">Autonomic vs {r.name}, with sources<b aria-hidden="true">→</b></a>
    </div>
  </div>
</section>

<style>
  .ct { display: grid; grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr); gap: 56px; align-items: center; }
  .ct-logos { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; }
  .ct-logos img { width: 44px; height: 44px; border-radius: 11px; }
  .ct-logos i { font-style: normal; font-weight: 800; color: var(--mute); }
  .ct-rows { display: flex; flex-direction: column; gap: 10px; }
  .ct-row { display: grid; grid-template-columns: 150px 1fr 1fr; gap: 14px; align-items: center; padding: 16px 18px; border-radius: 18px; background: var(--paper); font-size: 15px; line-height: 1.4; }
  .ct-row b { font-weight: 800; }
  .ct-row .us { font-weight: 700; color: var(--ink); }
  .ct-row .them { display: flex; gap: 8px; align-items: flex-start; color: var(--mute); }
  .ct-row .them img { flex: none; width: 18px; height: 18px; border-radius: 5px; margin-top: 1px; }
  .ct-go { display: flex; align-items: center; padding: 15px 18px; border-radius: 16px; background: var(--ink); color: #fff; font-weight: 800; }
  .ct-go b { margin-left: auto; transition: transform .15s; }
  @media (hover: hover) { .ct-go:hover b { transform: translateX(3px); } }
  @media (max-width: 900px) { .ct { grid-template-columns: 1fr; gap: 28px; } }
  @media (max-width: 620px) { .ct-row { grid-template-columns: 1fr; gap: 6px; } }
</style>
