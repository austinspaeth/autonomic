<!-- One comparison page (/compare/<slug>/), built from a row in compare.ts.
     Autonomic is shown with its real screens; the other app with its icon and a
     link to its own listing, never its screens. Every claim about it carries a
     citation into the Sources list at the end, read on CHECKED. -->
<script lang="ts">
  import { pricing, priceLabel } from '$lib/site';
  import { CHECKED, type Rival, type Cell } from './compare';
  import FeatureSeo from './FeatureSeo.svelte';
  import FeatureHero from './FeatureHero.svelte';
  import Phone from './Phone.svelte';
  import PacingSheetScreen from './screens/PacingSheetScreen.svelte';
  import StandResultScreen from './screens/StandResultScreen.svelte';
  import InsightsTabScreen from './screens/InsightsTabScreen.svelte';
  import AiReportsSheetScreen from './screens/AiReportsSheetScreen.svelte';
  import JournalLogScreen from './screens/JournalLogScreen.svelte';
  import VisibleGaugeScreen from './screens/VisibleGaugeScreen.svelte';
  import WelltoryTodayScreen from './screens/WelltoryTodayScreen.svelte';
  import BearableTodayScreen from './screens/BearableTodayScreen.svelte';
  import JournalScreen from './screens/JournalScreen.svelte';
  import ProgressScreen from './screens/ProgressScreen.svelte';
  import ReviewStrip from './ReviewStrip.svelte';
  import MidCta from './MidCta.svelte';
  import Faq from './Faq.svelte';
  import PageCta from './PageCta.svelte';
  import Cite from './Cite.svelte';
  import Sources from './Sources.svelte';
  export let rival: Rival;
  $: r = rival;
  const CHECK = '<svg class="v2-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>';
  const txt = (c: Cell) => (typeof c === 'string' ? c : c.t);
  const cites = (c: Cell) => (typeof c === 'string' ? [] : c.c);
  const NIL = new Set(['Not offered', 'Not listed']);
  const money = (n: number) => `$${n.toFixed(2)}`;
  $: path = `/compare/${r.slug}/`;
  $: features = r.diffs.map((d) => d.t.replace(/\.$/, ''));
  $: checked = new Date(CHECKED + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  $: maxCost = r.cost ? Math.max(r.cost.us, r.cost.them) : 1;
</script>

<FeatureSeo
  name="Autonomic vs {r.name}"
  {path}
  section={{ name: 'Compare', path: '/compare/' }}
  faq={r.faq}
  sources={r.sources}
  {features}
  title={r.title}
  description={r.description}
/>

<FeatureHero crumb={{ label: 'Compare', href: '/compare/' }} here="Autonomic vs {r.name}" badge="UPDATED {checked.toUpperCase()}" name="Autonomic vs {r.name}" tagline={r.tagline} note="Free to download. {pricing.trialDays} days of Pro, no card.">
  <svelte:fragment slot="lead">{r.lead}</svelte:fragment>
  <div class={r.heroMock ? "v2-arch tall cp-solid" : "v2-arch tall photo"} style={r.heroMock ? "" : `--photo:url(${r.photo});--pos:${r.pos}`} role="img" aria-label={r.heroMock ? `Autonomic and ${r.name}, side by side` : "A person using Autonomic at home"}>
    {#if r.heroMock}
      <div class="cp-duo">
        <figure><Phone w={220}><div class="v2-ph-full">{#if r.ourMock === 'journal'}<JournalScreen time="7:06" />{:else if r.ourMock === 'insights'}<InsightsTabScreen />{:else if r.ourMock === 'progress'}<ProgressScreen />{:else}<PacingSheetScreen time="8:48" battery={0.9} />{/if}</div></Phone><figcaption class="us">Autonomic</figcaption></figure>
        <figure><Phone w={220}><div class="v2-ph-full">{#if r.heroMock === 'welltory-today'}<WelltoryTodayScreen />{:else if r.heroMock === 'bearable-today'}<BearableTodayScreen />{:else}<VisibleGaugeScreen />{/if}</div></Phone><figcaption style:background={r.heroMock === 'welltory-today' ? '#111' : r.heroMock === 'bearable-today' ? '#3d50b8' : null}>{r.name}</figcaption></figure>
      </div>
      <p class="cp-redrawn">{r.name} screen redrawn from {r.name}’s own published screenshots.</p>
    {:else}
      <Phone w={270}><div class="v2-ph-full"><PacingSheetScreen time="8:48" battery={0.9} /></div></Phone>
    {/if}
    <span class="cp-vs" aria-hidden="true"><img src="/apple-touch-icon.png" width="64" height="64" alt="" /><i>vs</i><img src={r.icon} width="64" height="64" alt="" /></span>
  </div>
</FeatureHero>

<section class="v2-sec tight">
  <div class="v2-wrap v2-g3">
    {#each r.glance as g}
      <div class="v2-stat"><b>{g.b}</b><em>{g.em}</em><span>{txt(g.span)}{#if cites(g.span).length}<Cite n={cites(g.span)} />{/if}</span></div>
    {/each}
  </div>
</section>

<ReviewStrip />

<section class="v2-sec" id="compare">
  <div class="v2-wrap">
    <div class="v2-center"><h2 class="v2-h2">Autonomic and {r.name}, side by side.</h2><p class="v2-sub">From each company’s own listing and help pages, checked {checked}. The numbers link to their sources.</p></div>
    <div class="v2-cmp-scroll">
      <table class="v2-cmp card stack multi two cp-table">
        <caption class="v2-sr">Autonomic compared with {r.name}</caption>
        <colgroup><col class="feat" /><col /><col /></colgroup>
        <thead><tr>
          <th><span class="v2-sr">Feature</span></th>
          <th scope="col" class="us"><span class="v2-cmp-logo"><img src="/apple-touch-icon.png" width="36" height="36" alt="" /></span><span class="v2-cmp-name">Autonomic</span></th>
          <th scope="col"><span class="v2-cmp-logo"><img src={r.icon} width="36" height="36" alt="" /></span><span class="v2-cmp-name">{r.name}</span></th>
        </tr></thead>
        <tbody>
          {#each r.rows as row}
            <tr class:price={row.k === 'Price'}><th scope="row">{row.k}</th><td class="us" data-label="Autonomic">{@html CHECK}{row.us}</td><td data-label={r.name} class:nil={NIL.has(txt(row.them))}><span>{txt(row.them)}{#if cites(row.them).length}<Cite n={cites(row.them)} />{/if}</span></td></tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p class="v2-fine cp-fine">US prices. {r.name} is a trademark of its owner; we are not affiliated. <a href={r.storeUrl} rel="noopener" target="_blank">See {r.name} on the App Store →</a></p>
  </div>
</section>

{#if r.free}
  <section class="v2-sec white cp-onwhite" id="free">
    <div class="v2-wrap">
      <div class="v2-center"><h2 class="v2-h2">What you get for $0.</h2><p class="v2-sub">Before anyone pays a cent: the free version of each app, side by side.</p></div>
      <div class="v2-cmp-scroll">
        <table class="v2-cmp card stack multi two cp-table">
          <caption class="v2-sr">The free versions of Autonomic and {r.name} compared</caption>
          <colgroup><col class="feat" /><col /><col /></colgroup>
          <thead><tr>
            <th><span class="v2-sr">Feature</span></th>
            <th scope="col" class="us"><span class="v2-cmp-logo"><img src="/apple-touch-icon.png" width="36" height="36" alt="" /></span><span class="v2-cmp-name">Autonomic Free</span></th>
            <th scope="col"><span class="v2-cmp-logo"><img src={r.icon} width="36" height="36" alt="" /></span><span class="v2-cmp-name">{r.name} Free</span></th>
          </tr></thead>
          <tbody>
            {#each r.free as row}
              <tr><th scope="row">{row.k}</th><td class="us" data-label="Autonomic Free">{@html CHECK}{row.us}</td><td data-label="{r.name} Free" class:nil={NIL.has(txt(row.them))}><span>{txt(row.them)}{#if cites(row.them).length}<Cite n={cites(row.them)} />{/if}</span></td></tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p class="v2-fine cp-fine">Autonomic Pro adds Insights, the pacing budget, your full history and AI reports for {priceLabel(pricing.yearly)} a year, with {pricing.trialDays} days free to start.</p>
    </div>
  </section>
{/if}

{#if r.cost}
  <section class="v2-sec white">
    <div class="v2-wrap cp-cost">
      <div>
        <h2 class="v2-h2">What two years cost.</h2>
        <p class="v2-sub">Autonomic Pro has no hardware to buy, and the journal and every HRV reading are free forever.</p>
      </div>
      <div class="cp-bars" role="img" aria-label="Two years of Autonomic Pro costs {money(r.cost.us)}; {r.name} costs {money(r.cost.them)}">
        <div class="cp-bar us"><span><b>Autonomic Pro</b><small>Two years, nothing to buy</small></span><i style="width:{(r.cost.us / maxCost) * 100}%"></i><em>{money(r.cost.us)}</em></div>
        <div class="cp-bar"><span><b>{r.name}</b><small>{r.cost.themNote}<Cite n={r.cost.c} /></small></span><i style="width:{(r.cost.them / maxCost) * 100}%"></i><em>{money(r.cost.them)}</em></div>
        <p class="cp-save">{money(r.cost.them - r.cost.us)} less over two years.</p>
      </div>
    </div>
  </section>
{/if}

<section class="v2-sec" class:white={!r.cost && !r.free}>
  <div class="v2-wrap">
    <div class="v2-center"><h2 class="v2-h2">Where {r.name} is strong.</h2><p class="v2-sub">It is a good app. Here is what it does well, in its own words.</p></div>
    <div class="cp-strong">
      {#each r.strong as s}
        <div><b>{s.t}</b><span>{txt(s.b)}{#if cites(s.b).length}<Cite n={cites(s.b)} />{/if}</span></div>
      {/each}
    </div>
  </div>
</section>

{#each r.diffs as d, i}
  <section class="v2-sec" class:white={(i % 2 === 0) === (!!r.cost || !!r.free)}>
    <div class="v2-wrap v2-split" class:cp-flip={i % 2 === 1}>
      <div>
        <h2 class="v2-h2">{d.t}</h2>
        <p class="v2-sub">{d.b}</p>
        {#if d.them}<p class="cp-them"><img src={r.icon} width="22" height="22" alt="" />{txt(d.them)}<Cite n={cites(d.them)} /></p>{/if}
        <a class="v2-link" href={d.href}>See how it works →</a>
      </div>
      <div class="v2-arch">
        {#if d.key === 'hrv'}<Phone w={260} src="/features/live-hrv.webp" alt="A live HRV reading in Autonomic" />
        {:else}<Phone w={260}><div class="v2-ph-full">
          {#if d.key === 'pacing'}<PacingSheetScreen time="8:48" battery={0.9} />
          {:else if d.key === 'stand'}<StandResultScreen time="9:12" />
          {:else if d.key === 'insights'}<InsightsTabScreen />
          {:else if d.key === 'reports'}<AiReportsSheetScreen time="8:12" battery={0.85} />
          {:else}<JournalLogScreen />{/if}
        </div></Phone>{/if}
      </div>
    </div>
  </section>
  {#if i === 1}<MidCta title="Try Autonomic free for {pricing.trialDays} days." sub="The journal and every HRV reading stay free forever after. No card, no account." review={1} />{/if}
{/each}

<section class="v2-sec">
  <div class="v2-wrap">
    <div class="v2-center"><h2 class="v2-h2">Which one fits you?</h2><p class="v2-sub">Honestly, it depends on what you need.</p></div>
    <div class="v2-verdicts">
      <div class="v2-verdict us"><b>Autonomic fits if</b><ul>{#each r.fitsUs as f}<li>{@html CHECK}{f}</li>{/each}</ul></div>
      <div class="v2-verdict"><b>{r.name} may suit you better if</b><ul>{#each r.fitsThem as f}<li>{f}</li>{/each}</ul></div>
    </div>
  </div>
</section>

<Faq title="Autonomic vs {r.name}: questions" items={r.faq} />

<section class="v2-sec white">
  <div class="v2-wrap cp-src"><Sources items={r.sources} /></div>
</section>

<PageCta title="See for yourself, free for {pricing.trialDays} days." sub="Pro is {priceLabel(pricing.monthly)} a month or {priceLabel(pricing.yearly)} a year after that, and the journal is free forever." />

<style>
  .cp-vs { position: absolute; right: 16px; top: 16px; z-index: 2; display: flex; align-items: center; gap: 12px; padding: 10px 16px; border-radius: 999px; background: rgba(255,255,255,.94); box-shadow: 0 12px 34px -14px rgba(20,14,26,.5); }
  .cp-vs img { width: 54px; height: 54px; border-radius: 13px; display: block; }
  .cp-vs i { font-style: normal; font-weight: 800; font-size: 17px; color: var(--mute); }
  .cp-duo { display: flex; align-items: flex-end; justify-content: center; gap: 18px; margin-bottom: 44px !important; }
  .cp-duo figure { margin: 0; display: flex; flex-direction: column; align-items: center; gap: 10px; filter: drop-shadow(0 26px 36px rgba(20,14,26,.38)); }
  .cp-duo figcaption { padding: 5px 14px; border-radius: 999px; background: #1e2154; color: #fff; font-size: 13.5px; font-weight: 800; }
  .cp-duo figcaption.us { background: var(--red); }
  .cp-redrawn { position: absolute; left: 0; right: 0; bottom: 14px; margin: 0; text-align: center; font-size: 12px; font-weight: 600; color: var(--mute); }
  .cp-solid { background: var(--lilac); }
  .cp-onwhite .v2-cmp.card { box-shadow: 0 0 0 1px #e6dfe8, 0 30px 60px -48px rgba(42,34,49,.45); }
  .cp-table td :global(.v2-cite a), .cp-table td :global(.v2-cite) { color: var(--red); }
  .cp-fine { text-align: center; margin-top: 18px; }
  .cp-fine a { color: var(--red); font-weight: 700; }
  .cp-cost { display: grid; grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr); gap: 56px; align-items: center; }
  .cp-bars { display: flex; flex-direction: column; gap: 18px; padding: 28px; border-radius: 26px; background: var(--paper); }
  .cp-bar { display: grid; grid-template-columns: 1fr auto; grid-template-rows: auto 14px; gap: 8px 14px; align-items: end; }
  .cp-bar span { display: flex; flex-direction: column; }
  .cp-bar b { font-size: 16px; font-weight: 800; }
  .cp-bar small { font-size: 13px; color: var(--mute); }
  .cp-bar i { grid-column: 1 / -1; grid-row: 2; height: 14px; border-radius: 999px; background: #c9bfcd; }
  .cp-bar.us i { background: var(--red); }
  .cp-bar em { font-style: normal; font-weight: 800; font-size: 22px; letter-spacing: -.02em; }
  .cp-save { margin: 4px 0 0; font-size: 17px; font-weight: 800; color: var(--red); }
  .cp-strong { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; }
  .cp-strong > div { display: flex; flex-direction: column; gap: 8px; padding: 22px; border-radius: 22px; background: var(--paper); }
  .v2-sec:not(.white) .cp-strong > div { background: #fff; }
  .cp-strong b { font-size: 18px; font-weight: 800; letter-spacing: -.01em; }
  .cp-strong span { color: var(--mute); font-size: 15px; line-height: 1.55; }
  .cp-them { display: flex; align-items: flex-start; gap: 10px; margin: 18px 0 20px; padding: 12px 14px; border-radius: 14px; background: var(--paper); color: #554d5b; font-size: 15px; line-height: 1.45; }
  .v2-sec:not(.white) .cp-them { background: #fff; }
  .cp-them img { flex: none; width: 22px; height: 22px; border-radius: 6px; margin-top: 1px; }
  .v2-verdict > b { margin-bottom: 16px; }
  .cp-src :global(.v2-sources) { margin-top: 0; padding-top: 0; border-top: 0; }
  @media (min-width: 901px) { .cp-flip > :first-child { order: 2; } }
  @media (max-width: 900px) { .cp-cost { grid-template-columns: 1fr; gap: 28px; } }
  @media (max-width: 620px) { .cp-vs { right: 12px; top: 12px; padding: 8px 12px; gap: 8px; } .cp-vs img { width: 42px; height: 42px; border-radius: 10px; } .cp-duo { zoom: .74; gap: 12px; } .cp-redrawn { bottom: -30px; } }
</style>
