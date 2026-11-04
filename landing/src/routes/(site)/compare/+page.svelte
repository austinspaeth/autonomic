<!-- /compare/: every comparison in one place, linked from pricing, the footer
     and the condition pages. Each card states the one honest difference that
     matters most, then sends the reader to the full, cited page. -->
<script lang="ts">
  import { pricing, priceLabel } from '$lib/site';
  import { RIVALS } from '$lib/v2/compare';
  import FeatureSeo from '$lib/v2/FeatureSeo.svelte';
  import CompareTable from '$lib/v2/CompareTable.svelte';
  import ReviewStrip from '$lib/v2/ReviewStrip.svelte';
  import Faq from '$lib/v2/Faq.svelte';
  import PageCta from '$lib/v2/PageCta.svelte';
  const cards: Record<string, { q: string; t: string }> = {
    visible: { q: 'Pacing for ME/CFS and long COVID', t: 'Visible needs its own band and a membership. Autonomic paces you with the watch, strap or phone you already have.' },
    welltory: { q: 'HRV for POTS and long COVID', t: 'Welltory is built for stress and wellbeing. Autonomic adds a stand test and a pacing budget, and every reading is free.' },
    bearable: { q: 'A symptom tracker for chronic illness', t: 'Bearable is a great, cheaper diary. Autonomic also measures your nervous system each morning and paces your day.' }
  };
  const faq = [
    { q: 'What is the best app for POTS, long COVID and ME/CFS?', a: `It depends on what you need. If pacing with a dedicated band matters most, Visible is built for that. For general stress and wellbeing, Welltory. For a mood and symptom diary, Bearable. Autonomic is built for POTS, long COVID, ME/CFS and dysautonomia together: a five-minute HRV reading, a guided stand test, a pacing budget and Insights, with no band to buy and your data on your phone, for ${priceLabel(pricing.yearly)} a year.` },
    { q: 'Is there a free alternative to Visible?', a: `Autonomic’s journal, daily score, crash warnings and every HRV reading are free forever. The pacing budget is part of Pro, ${priceLabel(pricing.yearly)} a year, and every install starts with ${pricing.trialDays} days of Pro with no card, so you can try pacing free before deciding.` },
    { q: 'How do you keep these comparisons fair?', a: 'Every claim about another app comes from its own App Store listing, website or help pages, or a dated independent review, and is linked as a source. We say where each app is stronger. If something has changed, tell us and we will correct it.' }
  ];
</script>

<FeatureSeo
  name="Compare"
  path="/compare/"
  section={null}
  {faq}
  title="Autonomic vs Visible, Welltory & Bearable (2026) | Autonomic"
  description="Autonomic vs Visible, Welltory and Bearable for POTS, long COVID and ME/CFS: price, devices, pacing, HRV and privacy compared, with every claim sourced."
/>

<section class="v2-phead">
  <div class="v2-wrap">
    <nav class="v2-crumb" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><span>Compare</span></nav>
    <h1>How Autonomic compares with Visible, Welltory and Bearable.</h1>
    <p class="v2-lead">Honest side by sides with the apps people ask us about, from their own listings and help pages, with every claim sourced.</p>
  </div>
</section>

<section class="v2-sec white">
  <div class="v2-wrap">
    <div class="cmp-cards">
      {#each RIVALS as r}
        <a class="cmp-card" href="/compare/{r.slug}/">
          <span class="cmp-logos"><img src="/apple-touch-icon.png" width="48" height="48" alt="" /><i>vs</i><img src={r.icon} width="48" height="48" alt="" /></span>
          <small>{cards[r.slug].q}</small>
          <h2>Autonomic vs {r.name}</h2>
          <p>{cards[r.slug].t}</p>
          <span class="cmp-go">Read the comparison<b aria-hidden="true">→</b></span>
        </a>
      {/each}
    </div>
  </div>
</section>

<section class="v2-sec">
  <div class="v2-wrap">
    <div class="v2-center"><h2 class="v2-h2">All three, at a glance.</h2></div>
    <CompareTable />
  </div>
</section>

<ReviewStrip />

<Faq title="Comparison questions" items={faq} />

<PageCta title="Try Autonomic free for {pricing.trialDays} days." sub="No card, no account. The journal and every HRV reading stay free forever." />

<style>
  .cmp-cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
  .cmp-card { display: flex; flex-direction: column; gap: 10px; padding: 26px; border-radius: 26px; background: var(--paper); color: var(--ink); }
  .cmp-logos { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
  .cmp-logos img { width: 48px; height: 48px; border-radius: 12px; }
  .cmp-logos i { font-style: normal; font-weight: 800; color: var(--mute); }
  .cmp-card small { font-size: 14px; font-weight: 700; color: var(--mute); }
  .cmp-card h2 { margin: 0; font-size: 27px; font-weight: 800; letter-spacing: -.03em; line-height: 1.1; }
  .cmp-card p { flex: 1; margin: 0; color: var(--mute); font-size: 15.5px; line-height: 1.55; }
  .cmp-go { display: flex; align-items: center; margin-top: 6px; padding: 14px 18px; border-radius: 16px; background: var(--ink); color: #fff; font-weight: 800; }
  .cmp-go b { margin-left: auto; transition: transform .15s; }
  @media (hover: hover) { .cmp-card:hover { box-shadow: 0 0 0 3px #d3c8d6; } .cmp-card:hover .cmp-go b { transform: translateX(3px); } }
  @media (max-width: 900px) { .cmp-cards { grid-template-columns: 1fr; max-width: 520px; margin: 0 auto; } }
</style>
