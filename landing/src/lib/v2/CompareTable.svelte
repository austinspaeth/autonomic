<!-- Autonomic against Welltory, Visible and Bearable, on /pricing/ (the home page's
     savings bar links to it). Their prices come from site.ts (checked by
     hand), and every saving is derived, never typed. -->
<script lang="ts">
  import { pricing, priceLabel, competitor, visibleApp } from '$lib/site';
  const CHECK =
    '<svg class="v2-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>';
  export let caption = 'Autonomic compared with Welltory, Visible and Bearable';
  // Each cell is what that company publishes about itself; the full, sourced
  // version of every claim is on its /compare/<slug>/ page (compare.ts).
  const rows: [string, string, string, string, string][] = [
    ['Price per year', priceLabel(pricing.yearly), '$99.99 to $119.99', `${priceLabel(visibleApp.yearly)}, plus a $79.70 band`, '$34.99, often $18.99'],
    ['Built for', 'POTS, long COVID, ME/CFS and dysautonomia', 'Stress, energy and wellbeing', 'Pacing for chronic illness', 'Symptoms, mood and mental health'],
    ['Free HRV readings', 'Unlimited, every device', 'One a day', 'Phone camera check-in', 'Syncs heart rate from Apple Health'],
    ['Daily pacing budget', 'Hours and minutes, fitted to you', 'Energy battery', 'Needs their band', 'Not offered'],
    ['Guided POTS stand test', 'Watch, strap or by hand', 'Not listed', 'Not listed', 'Not listed'],
    ['Works with Apple Watch and Garmin', 'Yes, plus your phone camera and straps', 'Yes', 'No, their band only', 'Through Apple Health'],
    ['Where your data lives', 'On your phone, no account', 'Their cloud servers; location and contact info used to track you', 'Their database, linked to you', 'Its servers with an account; contact info and identifiers used to track you'],
    ['Use your own AI', 'Claude, Gemini or ChatGPT', 'Their AI coach, $99.99 a year extra', 'Not offered', 'Not offered']
  ];
  // A competitor cell that is an absence reads quieter than one that answers.
  const NIL = new Set(['Not offered', 'Not listed']);
  const apps = [
    { name: 'Autonomic', icon: '/apple-touch-icon.png' },
    { name: competitor.name, icon: '/welltory.png' },
    { name: visibleApp.name, icon: '/visible.png' },
    { name: 'Bearable', icon: '/bearable.png' }
  ];
</script>

<div class="v2-cmp-scroll">
  <table class="v2-cmp card stack multi">
    <caption class="v2-sr">{caption}</caption>
    <colgroup><col class="feat" />{#each apps as _}<col />{/each}</colgroup>
    <thead>
      <tr>
        <th><span class="v2-sr">Feature</span></th>
        {#each apps as a, i}
          <th scope="col" class:us={i === 0}><span class="v2-cmp-logo"><img src={a.icon} width="36" height="36" alt="" /></span><span class="v2-cmp-name">{a.name}</span></th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each rows as r, ri}
        <tr class:price={ri === 0}>
          <th scope="row">{r[0]}</th>
          <td class="us" data-label="Autonomic">{@html CHECK}{r[1]}</td>
          {#each r.slice(2) as c, ci}
            <td data-label={apps[ci + 1].name} class:nil={NIL.has(c)}>{c}</td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>
<p class="v2-fine">From each company’s own App Store listing, website and help pages, and dated independent reviews, checked November 2026. US prices. Full, sourced comparisons: <a href="/compare/visible/">vs Visible</a>, <a href="/compare/welltory/">vs Welltory</a>, <a href="/compare/bearable/">vs Bearable</a>.</p>
