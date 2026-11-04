<script lang="ts">
  import { pricing, priceLabel, yearlySavePct, competitor, visibleApp, appStoreUrl, playStoreUrl } from '$lib/site';
  import FeatureSeo from '$lib/v2/FeatureSeo.svelte';
  import Plans from '$lib/v2/Plans.svelte';
  import CompareTable from '$lib/v2/CompareTable.svelte';
  import ReviewStrip from '$lib/v2/ReviewStrip.svelte';
  import Faq from '$lib/v2/Faq.svelte';
  import PageCta from '$lib/v2/PageCta.svelte';

  const monthly = priceLabel(pricing.monthly);
  const yearly = priceLabel(pricing.yearly);
  const perMonth = priceLabel(pricing.yearly / 12);
  const pct = (them: number) => Math.round((1 - pricing.yearly / them) * 100);
  const saved = (them: number) => Math.round(them - pricing.yearly);
  const tick = (label: string) =>
    `<svg class="v2-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'}><path d="M20 6 9 17l-5-5" /></svg>`;
  const INCLUDED = tick('Included');
  const CHECK = tick('');

  // The four answers the home page names, and the plan that gives each one.
  const answers = [
    { q: 'Is today a good day?', a: 'Your morning reading, sleep and resting heart rate become a score out of 100 and plain guidance.', href: '/features/hrv-readings/', pro: false },
    { q: 'Am I about to crash?', a: 'An early warning when your score slides, or when your own markers drift from your normal.', href: '/features/hrv-readings/#crash-warnings', pro: false },
    { q: 'How much can I do?', a: 'A budget in hours and minutes, set by your readings, that spends down as you move.', href: '/features/pacing-budget/', pro: true },
    { q: 'What is actually helping?', a: 'What you take and do, tested against your own HRV, sleep and symptoms.', href: '/features/insights/', pro: true }
  ];

  // Free against Pro, as the app ships it (CLAUDE.md: "Capture is never
  // metered; Pro is what the app makes of the readings"). A cell is `true`
  // (included), `false` (not included) or a short qualifier.
  type Cell = boolean | string;
  const groups: { name: string; rows: { label: string; detail?: string; free: Cell; pro: Cell }[] }[] = [
    {
      name: 'Measure',
      rows: [
        { label: 'Live HRV readings', detail: 'Phone camera, Apple Watch, Garmin or a chest strap, as often as you like', free: 'Unlimited', pro: 'Unlimited' },
        { label: 'POTS stand test and episode capture', detail: 'Runs, syncs and saves on every plan, so a test is never lost', free: true, pro: true },
        { label: 'Apple Watch heart rate monitor', detail: 'Live heart rate with a rolling delta and spike alerts (iPhone)', free: true, pro: true }
      ]
    },
    {
      name: 'Track',
      rows: [
        { label: 'Daily journal', detail: 'Sleep, symptoms, triggers, meds, water, meals and digestion', free: true, pro: true },
        { label: 'Blood pressure and resting heart rate', free: true, pro: true },
        { label: 'Apple Health and Health Connect', detail: 'Sleep, workouts, heart rate and steps come in on their own', free: true, pro: true },
        { label: 'Cycle tracking and forecasts', free: true, pro: true },
        { label: 'Your own activities, meds, symptoms and triggers', free: true, pro: true }
      ]
    },
    {
      name: 'Answers',
      rows: [
        { label: 'Daily Autonomic Outlook', detail: 'A score out of 100 and plain guidance, every morning', free: true, pro: true },
        { label: 'Crash and strain warnings', free: true, pro: true },
        { label: 'Progress charts', free: 'Last 14 days', pro: 'Every range' },
        { label: 'Daily pacing budget', detail: 'With alerts, home screen widgets and your Apple Watch', free: false, pro: true },
        { label: 'Insights', detail: 'What lines up with your better days, including the weather', free: false, pro: true },
        { label: 'POTS stand test and episode results', free: false, pro: true },
        { label: 'How your cycle moves your numbers', free: false, pro: true },
        { label: 'Full history of every metric', free: false, pro: true },
        { label: 'AI reports for you and your doctor', free: false, pro: true }
      ]
    },
    {
      name: 'Your data',
      rows: [
        { label: 'Backups and full export', free: true, pro: true },
        { label: 'No account, no ads, no tracking', free: true, pro: true }
      ]
    }
  ];

  const faq = [
    { q: 'Is Autonomic really free?', a: `Yes. The journal is free forever, with no account and no ads, and that includes unlimited HRV readings, every POTS stand test and episode capture, your daily Autonomic Outlook, crash warnings, cycle tracking, backups and export. Autonomic Pro (${monthly} a month or ${yearly} a year) adds the deeper answers: the pacing budget, Insights, your full history, stand test results and AI reports.` },
    { q: 'Do I need a card to try Pro?', a: `No. Every install opens with ${pricing.trialDays} days of Pro on its own, with no card and no account. You only go through the App Store or Google Play if you decide to subscribe.` },
    { q: `What happens when the ${pricing.trialDays} days of Pro end?`, a: 'You move to the free plan and nothing is deleted. Your journal, readings and stand tests stay on your phone, the free features keep working, and the Pro views wait for you if you subscribe later.' },
    { q: 'How do I cancel?', a: 'Pro is a subscription through the App Store or Google Play, so you cancel it in your store’s subscription settings, like any other app. There is no Autonomic account to close, and Pro stays on until the end of the period you paid for.' },
    { q: 'Is it the same price on Android?', a: `Yes. Autonomic Pro is ${monthly} a month or ${yearly} a year on both iPhone and Android. Prices are shown in US dollars; your store shows the price in your own currency.` },
    { q: 'Monthly or yearly?', a: `Yearly works out to about ${perMonth} a month, ${yearlySavePct}% less than paying monthly for a year. Monthly is there if you would rather decide month by month.` },
    { q: `Why does it cost less than ${competitor.name} and ${visibleApp.name}?`, a: `Autonomic runs on your phone. There is no cloud of ours holding your health data and no band to sell you, so there is simply less to pay for. Against their published prices, Pro is ${pct(competitor.yearly)}% less than ${competitor.name} and ${pct(visibleApp.yearly)}% less than ${visibleApp.name} each year, before the cost of ${visibleApp.name}’s band.` }
  ];

  const ld = [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'Autonomic',
      applicationCategory: 'HealthApplication',
      operatingSystem: 'iOS, Android',
      url: 'https://autonomic.care/pricing/',
      downloadUrl: [appStoreUrl, playStoreUrl],
      offers: [
        { '@type': 'Offer', name: 'Free', price: '0', priceCurrency: pricing.currency, description: 'The journal, unlimited HRV readings, POTS stand test capture, the daily Autonomic Outlook, backups and export. Free forever.' },
        { '@type': 'Offer', name: 'Autonomic Pro, monthly', price: pricing.monthly.toFixed(2), priceCurrency: pricing.currency, description: `Pacing budget, Insights, full history, POTS results and AI reports. ${pricing.trialDays} days free on every install.` },
        { '@type': 'Offer', name: 'Autonomic Pro, yearly', price: pricing.yearly.toFixed(2), priceCurrency: pricing.currency, description: `Everything in Pro, billed yearly. ${pricing.trialDays} days free on every install.` }
      ]
    }
  ];
</script>

<FeatureSeo
  name="Pricing"
  path="/pricing/"
  section={null}
  {faq}
  {ld}
  title="Pricing: Free Journal Forever, Pro for {yearly} a Year | Autonomic"
  description="The Autonomic journal is free forever, with unlimited HRV readings. Pro is {monthly} a month or {yearly} a year, up to {pct(visibleApp.yearly)}% less than {competitor.name} and {visibleApp.name}."
/>

<section class="v2-phead">
  <div class="v2-wrap">
    <h1>Fair pricing for a long recovery.</h1>
    <p class="v2-lead">Your journal, unlimited HRV readings and every stand test are free forever. Pro adds the deeper answers for {monthly} a month or {yearly} a year, and every install opens with {pricing.trialDays} days of it. No card, no account.</p>
  </div>
</section>

<section class="v2-sec nopad-top" id="pricing">
  <div class="v2-wrap">
    <Plans />
    <a class="v2-savebar" href="#compare">
      <b>Up to {pct(visibleApp.yearly)}%<small>less</small></b>
      <span class="v2-savebar-t">than <span class="v2-savebar-app"><img src="/welltory.png" width="22" height="22" alt="" />{competitor.name}</span> and <span class="v2-savebar-app"><img src="/visible.png" width="22" height="22" alt="" />{visibleApp.name}</span>, for the features that matter with POTS, ME/CFS and long COVID.</span>
      <span class="v2-savebar-btn">See the comparison ↓</span>
    </a>
  </div>
</section>

<section class="v2-sec plum2">
  <div class="v2-wrap">
    <div class="v2-headrow end">
      <div><h2 class="v2-h2 on-dark">Two answers free, forever. All four with Pro.</h2></div>
      <p class="v2-sub on-dark narrow">The questions you live with, and the plan that answers each one.</p>
    </div>
    <div class="v2-four">
      {#each answers as x}
        <a href={x.href}><i class:pro={x.pro}>{x.pro ? 'PRO' : 'FREE'}</i><b>{x.q}</b><span>{x.a}</span></a>
      {/each}
    </div>
  </div>
</section>

<section class="v2-sec white">
  <div class="v2-wrap">
    <div class="v2-center"><h2 class="v2-h2">Everything in each plan.</h2><p class="v2-sub">Measuring is never metered. Pro is what the app makes of your readings over time.</p></div>
    <div class="v2-fp-wrap">
      <table class="v2-fp">
        <caption class="v2-sr">Autonomic Free and Pro compared, feature by feature</caption>
        <thead>
          <tr><th scope="col"><span class="v2-sr">Feature</span></th><th scope="col">Free<small>$0 forever</small></th><th scope="col" class="pro">Pro<small>{monthly}/mo or {yearly}/yr</small></th></tr>
        </thead>
        <tbody>
          {#each groups as g}
            <tr class="grp"><th colspan="3" scope="colgroup">{g.name}</th></tr>
            {#each g.rows as r}
              <tr>
                <th scope="row">{r.label}{#if r.detail}<small>{r.detail}</small>{/if}</th>
                {#each [r.free, r.pro] as c, i}
                  <td class:pro={i === 1}>
                    {#if c === true}{@html INCLUDED}{:else if c === false}<span class="no" role="img" aria-label="Not included"></span>{:else}{c}{/if}
                  </td>
                {/each}
              </tr>
            {/each}
          {/each}
        </tbody>
      </table>
    </div>
    <p class="v2-fine">Every install starts with {pricing.trialDays} days of Pro. When it ends you keep the free plan and everything you logged.</p>
  </div>
</section>

<section class="v2-sec lilac" id="compare">
  <div class="v2-wrap">
    <div class="v2-headrow end">
      <div><h2 class="v2-h2">More of what matters, for up to {pct(visibleApp.yearly)}% less.</h2></div>
      <p class="v2-sub narrow">Against the best known alternatives, at their own published prices. <a class="v2-inl" href="/compare/">Read the full comparisons →</a></p>
    </div>
    <div class="v2-g3 v2-cmp-sum">
      <div class="v2-savecard"><b>${saved(competitor.yearly)}</b><span>less a year than {competitor.name} ({pct(competitor.yearly)}% less)</span></div>
      <div class="v2-savecard"><b>${saved(visibleApp.yearly)}</b><span>less a year than {visibleApp.name}, before the cost of their band</span></div>
      <div class="v2-savecard"><b>$0</b><span>for the journal and every reading, on every plan</span></div>
    </div>
    <CompareTable />
  </div>
</section>

<section class="v2-sec">
  <div class="v2-wrap">
    <div class="v2-verdicts">
      <div class="v2-verdict us">
        <small>Autonomic fits if</small>
        <b>You want answers about your own body, kept on your own phone.</b>
        <ul>
          <li>{@html CHECK}You live with POTS, long COVID, ME/CFS or dysautonomia, and want an app built for it rather than for athletes.</li>
          <li>{@html CHECK}You want to measure with what you already own: your phone camera, an Apple Watch, a Garmin or a chest strap.</li>
          <li>{@html CHECK}You want pacing, a stand test and insights without buying a band.</li>
          <li>{@html CHECK}You want no account, and your health data on your phone rather than on someone’s server.</li>
        </ul>
      </div>
      <div class="v2-verdict">
        <small>Another app may suit you better if</small>
        <b>Honestly, we are not for everyone.</b>
        <ul>
          <li>You want a general wellness and stress app for days when you are already well. That is closer to what {competitor.name} is built for.</li>
          <li>You already own {visibleApp.name}’s band and its pacing works for you. Keep what works.</li>
          <li>You want your data synced to an account in the cloud. Autonomic deliberately has none, though you can export everything anytime.</li>
        </ul>
      </div>
    </div>
  </div>
</section>

<ReviewStrip />

<Faq title="Pricing questions" items={faq} />

<PageCta title="Start with {pricing.trialDays} days of Pro, free." sub="No card, no account. The journal stays free forever after." />
