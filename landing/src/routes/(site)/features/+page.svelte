<script lang="ts">
  import { pricing, priceLabel } from '$lib/site';
  import { FEATURES } from '$lib/v2/features';
  import FeatureSeo from '$lib/v2/FeatureSeo.svelte';
  import PhotoBand from '$lib/v2/PhotoBand.svelte';
  import FeatureIcon from '$lib/v2/FeatureIcon.svelte';
  import Stores from '$lib/v2/Stores.svelte';
  import Phone from '$lib/v2/Phone.svelte';
  import DocArt from '$lib/v2/DocArt.svelte';
  import Plans from '$lib/v2/Plans.svelte';
  import DeviceCards from '$lib/v2/DeviceCards.svelte';
  import ReviewStrip from '$lib/v2/ReviewStrip.svelte';
  import ConditionCards from '$lib/v2/ConditionCards.svelte';
  import Faq from '$lib/v2/Faq.svelte';
  import PageCta from '$lib/v2/PageCta.svelte';
  import JournalScreen from '$lib/v2/screens/JournalScreen.svelte';
  import PacingSheetScreen from '$lib/v2/screens/PacingSheetScreen.svelte';
  import InsightsTabScreen from '$lib/v2/screens/InsightsTabScreen.svelte';
  import TrendScreen from '$lib/v2/screens/TrendScreen.svelte';
  import ProgressSimpleScreen from '$lib/v2/screens/ProgressSimpleScreen.svelte';
  import StandScreen from '$lib/v2/screens/StandScreen.svelte';
  import CycleScreen from '$lib/v2/screens/CycleScreen.svelte';

  const CHECK =
    '<svg class="v2-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>';

  // Names, links, icons and the Pro flag come from FEATURES (nav, footer);
  // Apple Watch lives outside that list, and crash warnings and Progress are
  // sections of Journal + HRV.
  const F = Object.fromEntries(FEATURES.map((f) => [f.slug, f]));
  const from = (slug: string) => ({ feature: F[slug].name, href: F[slug].href, icon: F[slug].icon, pro: !!F[slug].pro });

  // The three that sell the app, each drawn large with its own screen.
  const spotlight = [
    {
      ...from('hrv-readings'),
      visual: 'outlook',
      link: 'Explore Journal + HRV',
      q: 'Is today a good day?',
      a: 'Take a five-minute morning reading and Autonomic turns it, with your sleep and resting heart rate, into one score out of 100 and plain guidance for the day.',
      points: ['Your phone camera, an Apple Watch, a Garmin or a chest strap', 'Graded against your own normal, not a chart built for athletes', 'Unlimited readings, free forever']
    },
    {
      ...from('pacing-budget'),
      visual: 'pacing',
      link: 'Explore the pacing budget',
      q: 'How much can I do today?',
      a: 'A budget in hours and minutes, set each morning by your readings and learned from what your own body has handled before. It spends down as you move.',
      points: ['Steps, standing and heart rate counted for you', 'Alerts when today is running ahead of pace', 'Watches the day after a hard one, when the crash tends to land']
    },
    {
      ...from('insights'),
      visual: 'insights',
      link: 'Explore Insights',
      q: 'What is actually helping?',
      a: 'Everything you log, from supplements to bedtimes, is tested against your own readings. Only the links that hold up are shown, with the evidence one tap away.',
      points: ['Built for the long, messy journals real recovery makes', 'Shows a link, never a cause', 'Says so honestly when nothing holds up']
    }
  ];

  // The other answers, each topped with the screen that gives it.
  const more = [
    { q: 'Am I about to crash?', a: 'An early flag when your score slides, or when several of your own markers drift at once.', feature: 'Crash warnings', href: '/features/hrv-readings/#crash-warnings', icon: 'alert', pro: false, visual: 'trend' },
    { q: 'Am I actually getting better?', a: 'Week, month and year views that show the slow change you would never feel day to day.', feature: 'Progress', href: '/features/hrv-readings/#progress', icon: 'progress', pro: true, visual: 'progress' },
    { ...from('pots-stand-test'), q: 'Why does my heart race when I stand?', a: 'A guided lie-and-stand test, with your rise measured minute by minute and every result kept.', visual: 'stand' },
    { q: 'What is my heart doing right now?', a: 'Live heart rate on your wrist, a buzz when it spikes, and the stand test without your phone. Needs an iPhone.', feature: 'Apple Watch', href: '/features/apple-watch/', icon: 'watch', pro: false, visual: 'watch' },
    { ...from('cycle-tracking'), q: 'Why is it worse before my period?', a: 'Every reading, warning and symptom read against the same phase of your past cycles.', visual: 'cycle' },
    { ...from('doctor-reports'), q: 'Will my doctor believe me?', a: 'Weeks of readings, stand tests and symptoms turned into a clear summary for your appointment.', visual: 'doctor' }
  ];

  // Each card leads with the device's own mark.
  const devices = [
    { name: 'Phone camera', logos: ['camera'], body: 'A fingertip on the lens. No wearable needed.' },
    { name: 'Apple Watch', logos: ['apple-watch'], body: 'Readings, live heart rate and the stand test on your wrist.' },
    { name: 'Garmin', logos: ['garmin'], body: 'Take your reading on the watch, on iPhone or Android.' },
    { name: 'Chest strap', logos: ['polar', 'coospo'], body: 'Polar, Coospo or any Bluetooth heart rate strap, for the cleanest beats.' },
    { name: 'Apple Health and Health Connect', logos: ['health', 'hc'], body: 'Sleep, workouts, heart rate and steps arrive on their own.' }
  ];

  const also = [
    ['Sleep report', false, 'Stages, overnight heart rate and your nocturnal dip.'],
    ['Clean day streaks', false, 'Set a daily routine and see how often you keep it.'],
    ['Barometric pressure', true, 'Shown only if your own data links low-pressure days to harder ones.'],
    ['Home-screen widgets', false, 'Your score, metrics and checklist, plus pacing with Pro.'],
    ['Your own types', false, 'Activities, meds, symptoms and triggers that matter to you.'],
    ['Backups and full export', false, 'Everything you have logged, in one file. No account needed.']
  ] as const;

  const faq = [
    { q: 'Which Autonomic features are free?', a: 'The daily journal, manual readings, your daily Autonomic Outlook score, crash warnings, unlimited HRV readings on any device, POTS stand test and episode captures, cycle tracking, the Apple Watch heart rate monitor, backups and export, and the last 14 days of charts are all free, forever.' },
    { q: 'What does Autonomic Pro add?', a: `Pro adds the pacing budget, Insights, your full history across every metric, POTS test and episode results, how your cycle moves your numbers, and AI reports. It is ${priceLabel(pricing.monthly)} a month or ${priceLabel(pricing.yearly)} a year, and every install starts with ${pricing.trialDays} days of it, no card needed.` },
    { q: 'Do I need a wearable to use Autonomic?', a: 'No. Your phone camera takes the daily HRV reading with a fingertip on the lens, and everything else can be logged by hand. An Apple Watch, a Garmin watch or a chest strap makes the readings cleaner, and an Apple Watch or a chest strap runs the guided stand test.' },
    { q: 'Does Autonomic work on Android?', a: 'Yes, at the same price and with the same private design. On Android, HRV readings run in the app with the camera or a chest strap, the stand test runs with a chest strap, Garmin watches work, and sleep and workouts come from Health Connect. The Apple Watch app needs an iPhone.' },
    { q: 'Where is my data stored?', a: 'On your phone. There is no account, every score and insight is worked out on the device, and you can export everything whenever you like.' },
    { q: 'Is Autonomic a medical device?', a: 'No. It is a personal tracking tool that helps you organize your data and your conversations with your clinician. It does not diagnose or treat anything.' }
  ];
  const ld = [
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Autonomic features',
      itemListElement: [...spotlight, ...more].filter((f) => !f.href.includes('#')).map((f, i) => ({ '@type': 'ListItem', position: i + 1, name: f.feature, url: `https://autonomic.care${f.href}` }))
    }
  ];
</script>

<FeatureSeo
  name="Features"
  path="/features/"
  section={null}
  {faq}
  {ld}
  title="Features: HRV, Pacing Budget, POTS Stand Test & More | Autonomic"
  description="Everything Autonomic does for POTS, long COVID, ME/CFS and dysautonomia: HRV from any device, a pacing budget, a guided stand test, Insights and doctor reports."
/>

<section class="v2-phead">
  <div class="v2-wrap">
    <nav class="v2-crumb" aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><span>Features</span></nav>
    <h1>Everything Autonomic does for POTS and long COVID.</h1>
    <p class="v2-lead">Every feature in the app, built for life with POTS, long COVID, ME/CFS and dysautonomia. Each one answers a question you live with. Pick one to see how it works.</p>
  </div>
</section>


<section class="v2-sec white">
  <div class="v2-wrap">
    <div class="v2-center"><h2 class="v2-h2">Three answers people open the app for every day.</h2></div>
    <div class="v2-spot-list">
      {#each spotlight as s, i}
        <article class="v2-spot" class:rev={i % 2 === 1}>
          <a class="v2-spot-art" href={s.href} tabindex="-1" aria-hidden="true">
            <Phone w={272}><div class="v2-ph-full">
              {#if s.visual === 'outlook'}<JournalScreen />
              {:else if s.visual === 'pacing'}<PacingSheetScreen />
              {:else}<InsightsTabScreen />{/if}
            </div></Phone>
          </a>
          <div class="v2-spot-body">
            <small><span class="v2-tile sm"><FeatureIcon name={s.icon} size={24} /></span>{s.feature}{#if s.pro}<i class="v2-propill">PRO</i>{:else}<i class="v2-freepill">FREE</i>{/if}</small>
            <h3>{s.q}</h3>
            <p>{s.a}</p>
            <ul>{#each s.points as pt}<li>{@html CHECK}{pt}</li>{/each}</ul>
            <a class="v2-btn ghost" href={s.href}>{s.link} →</a>
          </div>
        </article>
      {/each}
    </div>
  </div>
</section>

<ReviewStrip app />

<section class="v2-sec">
  <div class="v2-wrap">
    <div class="v2-center"><h2 class="v2-h2">The questions that come with it.</h2><p class="v2-sub">Each card opens the part of the app that answers it.</p></div>
    <div class="v2-match-grid v2-more">
      {#each more as m}
        <a class="v2-match v2-more-card" href={m.href}>
          <div class="v2-match-art" aria-hidden="true">
            {#if m.visual === 'trend'}<Phone w={190}><TrendScreen /></Phone>
            {:else if m.visual === 'progress'}<Phone w={190}><ProgressSimpleScreen /></Phone>
            {:else if m.visual === 'stand'}<Phone w={190}><StandScreen /></Phone>
            {:else if m.visual === 'watch'}<img class="v2-match-watch" src="/features/watch-stand-test.webp" width="410" height="502" alt="" loading="lazy" />
            {:else if m.visual === 'cycle'}<Phone w={190}><CycleScreen /></Phone>
            {:else}<DocArt />{/if}
          </div>
          <div class="v2-match-body">
            <small><span class="v2-tile xs"><FeatureIcon name={m.icon} size={18} /></span>{m.feature}{#if m.pro}<i class="v2-propill">PRO</i>{/if}</small>
            <h4>{m.q}</h4>
            <p>{m.a}</p>
            <span class="v2-link">Explore {m.feature} →</span>
          </div>
        </a>
      {/each}
    </div>
    <div class="v2-match-dl"><span>Free on iPhone and Android, with {pricing.trialDays} days of Pro.</span><Stores /></div>
  </div>
</section>

<section class="v2-sec white">
  <div class="v2-wrap">
    <div class="v2-center"><h2 class="v2-h2">Six more ways it does the work for you.</h2><p class="v2-sub">Smaller tools that save effort on the days you have the least of it.</p></div>
    <ul class="v2-also">
      {#each also as a}<li><b>{a[0]}{#if a[1]}<i class="v2-propill">PRO</i>{/if}</b><span>{a[2]}</span></li>{/each}
    </ul>
  </div>
</section>

<section class="v2-sec">
  <div class="v2-wrap">
    <div class="v2-center"><h2 class="v2-h2">No new gadget required.</h2><p class="v2-sub">Some apps only work with a device you buy from them. Autonomic works with what you already own: start with your phone, add a watch or a strap later, and every reading lands in the same journal.</p></div>
    <DeviceCards {devices} />
  </div>
</section>

<section class="v2-sec white">
  <div class="v2-wrap">
    <div class="v2-center"><h2 class="v2-h2">The journal is free. Forever.</h2><p class="v2-sub">Every install opens with {pricing.trialDays} days of Pro. No card, no account.</p></div>
    <Plans />
    <p class="v2-center-link"><a class="v2-link" href="/pricing/">Compare every feature →</a></p>
  </div>
</section>

<section class="v2-sec">
  <div class="v2-wrap">
    <div class="v2-trust-card">
      <span class="v2-trust-lock" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /><circle cx="12" cy="15.5" r="1.3" /></svg></span>
      <h2 class="v2-h2 sm">Every feature runs on your phone.</h2>
      <p class="v2-sub">Your readings, symptoms, sleep and cycle stay on the device, and every score and insight is worked out there too. No account to make, and it is yours to export whenever you like.</p>
      <div class="v2-trust-chips"><span>No account</span><span>No ads</span><span>No tracking</span><span>Works offline</span><span>Export anytime</span></div>
      <a class="v2-link" href="/privacy-policy/">Read the privacy policy →</a>
    </div>
  </div>
</section>

<ConditionCards title="Built for" />
<PhotoBand src="/people/hero-recovery.webp" alt="A woman smiling on a sunny morning walk, coffee in hand" title="More good days, on purpose." body="Every feature here exists for one reason: to help you see what gives you better days, and have more of them." link="What recovery actually looks like" href="/insights/recovery/what-recovery-looks-like/" />

<Faq title="Questions about the features" items={faq} />
<PageCta title="Tomorrow morning, get your first answer." sub="{pricing.trialDays} days of Pro free. No card, no account." />
