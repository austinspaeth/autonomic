<script lang="ts">
  import { APP_MARK_PATH, pricing, priceLabel, appStoreUrl, playStoreUrl, rating, competitor, visibleApp, CONDITION_LINKS as C } from '$lib/site';
  import { REVIEWS } from '$lib/v2/features';
  import { EXPERIENCES, MATCHES, RESULTS_FALLBACK, STEPS, RANGES, FREE_ROWS, PRO_ROWS, HERO_CUES } from '$lib/v2/homeData';
  import { homeScript } from '$lib/v2/homeScript';
  import Stores from '$lib/v2/Stores.svelte';
  import Qr from '$lib/v2/Qr.svelte';
  import DownloadBox from '$lib/v2/DownloadBox.svelte';
  import Phone from '$lib/v2/Phone.svelte';
  import RmssdChart from '$lib/v2/RmssdChart.svelte';
  import StarRow from '$lib/v2/StarRow.svelte';
  import PacingScreen from '$lib/v2/screens/PacingScreen.svelte';
  import StandScreen from '$lib/v2/screens/StandScreen.svelte';
  import DocArt from '$lib/v2/DocArt.svelte';
  import TrendScreen from '$lib/v2/screens/TrendScreen.svelte';
  import InsightsScreen from '$lib/v2/screens/InsightsScreen.svelte';
  import SleepScreen from '$lib/v2/screens/SleepScreen.svelte';
  import CycleScreen from '$lib/v2/screens/CycleScreen.svelte';
  import PressureScreen from '$lib/v2/screens/PressureScreen.svelte';
  import ImportScreen from '$lib/v2/screens/ImportScreen.svelte';
  import ProtocolScreen from '$lib/v2/screens/ProtocolScreen.svelte';
  import OutlookSimpleScreen from '$lib/v2/screens/OutlookSimpleScreen.svelte';
  import ReadingSimpleScreen from '$lib/v2/screens/ReadingSimpleScreen.svelte';
  import ProgressSimpleScreen from '$lib/v2/screens/ProgressSimpleScreen.svelte';
  import JournalScreen from '$lib/v2/screens/JournalScreen.svelte';
  import PacingSheetScreen from '$lib/v2/screens/PacingSheetScreen.svelte';
  import InsightsTabScreen from '$lib/v2/screens/InsightsTabScreen.svelte';
  import StandResultScreen from '$lib/v2/screens/StandResultScreen.svelte';
  import ProgressScreen from '$lib/v2/screens/ProgressScreen.svelte';
  import SessionScreen from '$lib/v2/screens/SessionScreen.svelte';

  // "Am I about to crash?": the Journal on a sliding day. HRV and sleep in the
  // Compromised band, resting HR Moderate, and the downturn card's own headline.
  const SLIDING_FIGS = [
    { text: '21', unit: 'ms', color: '#f97316', label: 'HRV' },
    { text: '76', unit: 'bpm', color: '#eab308', label: 'Resting HR' },
    { text: '5h 40m', color: '#f97316', label: 'Sleep' },
  ];
  const SLIDING_NOTICE = { emoji: '⚠️', text: 'Autonomic score trending down 12 points over the last 3 days', chevron: true };
  const monthly = priceLabel(pricing.monthly);
  const yearly = priceLabel(pricing.yearly);
  const CHECK =
    '<svg class="v2-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>';

  const softwareLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Autonomic',
    applicationCategory: 'HealthApplication',
    operatingSystem: 'iOS, Android',
    downloadUrl: [appStoreUrl, playStoreUrl],
    installUrl: [appStoreUrl, playStoreUrl],
    description:
      'A private, offline journal that scores daily autonomic readings, HRV, blood pressure, resting heart rate, sleep and orthostatic tests, against medical thresholds to track recovery from POTS, dysautonomia and post-illness conditions.',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: pricing.currency,
      description: `Free to download; the journal is free forever. Autonomic Pro is ${monthly}/month or ${yearly}/year and unlocks your daily pacing budget, your full history, Insights, POTS results and AI reports. HRV capture is unlimited and free, as are POTS stand tests and episode captures. Every install starts with ${pricing.trialDays} days of Pro.`
    },
    featureList:
      'HRV scoring, chest-strap and fingertip-camera HRV capture, blood pressure tracking, orthostatic testing, sleep and symptom logging, trend analysis, clean-day streaks, AI insight reports, offline-first storage',
    // Google rejects an aggregateRating with no count and can flag the whole
    // block, so this only appears once `rating.reviews` is a real number from
    // App Store Connect. Until then the page shows the stars and says nothing
    // machine-readable about them.
    ...(rating.reviews
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: rating.stars,
            bestRating: 5,
            ratingCount: rating.reviews
          }
        }
      : {})
  };

  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'How much does Autonomic cost?', acceptedAnswer: { '@type': 'Answer', text: `Autonomic is free to download and the journal is free forever, with no account and no ads. Autonomic Pro is ${monthly} per month or ${yearly} per year and unlocks your daily pacing budget, your full history, Insights, POTS results and AI reports. Live HRV capture is unlimited on the free plan, and so are POTS stand tests and episode captures. Every install opens with ${pricing.trialDays} days of Pro so you can try it before paying. Your data stays private on your device and is never sold.` } },
      { '@type': 'Question', name: 'What is free and what needs Pro?', acceptedAnswer: { '@type': 'Answer', text: 'Free covers the daily journal (sleep, meds, symptoms, triggers, hydration), manual readings like blood pressure and resting heart rate, your daily autonomic score and outlook, unlimited chest-strap and fingertip-camera HRV capture with no daily cap, POTS stand tests and episode captures, the Apple Watch heart-rate monitor on iPhone, backups and export, plus 14 days of progress charts. Pro adds your daily pacing budget, all progress views, full historical metric analysis, on-device Insights, POTS test and episode results, and AI insight and doctor reports.' } },
      { '@type': 'Question', name: 'Does it work offline?', acceptedAnswer: { '@type': 'Answer', text: 'Completely. Autonomic is a fully offline app for iOS and Android. All scoring, trends and reports are computed locally, so it works on a plane, in a clinic basement, or anywhere without signal.' } },
      { '@type': 'Question', name: 'Which conditions is it for?', acceptedAnswer: { '@type': 'Answer', text: 'It is built for people managing POTS, dysautonomia, long COVID and post-viral or post-illness autonomic recovery, where day-to-day HRV, heart rate and orthostatic patterns matter.' } },
      { '@type': 'Question', name: 'Is Autonomic available on Android?', acceptedAnswer: { '@type': 'Answer', text: 'Yes, on both iPhone (App Store) and Android (Google Play), at the same price and with the same private, offline design. The Apple Watch companion app is iPhone-only; on Android the stand test, episode capture and HRV readings run in the app itself using a Bluetooth chest strap or the phone camera, and sleep and workouts come from Health Connect.' } },
      { '@type': 'Question', name: 'Do I need a wearable?', acceptedAnswer: { '@type': 'Answer', text: 'No. Autonomic can measure HRV with your phone alone, by resting a fingertip on the rear camera for three minutes. You can also take readings with an Apple Watch, a Garmin or a chest strap, and type in blood pressure or resting heart rate from any cuff or device. Autonomic scores whatever you log.' } },
      { '@type': 'Question', name: 'How do the AI insights work?', acceptedAnswer: { '@type': 'Answer', text: 'Autonomic assembles your logged data over a date range into a structured analysis prompt that you copy into Claude, Gemini or ChatGPT. The text is generated locally; nothing is sent automatically.' } }
    ]
  };
</script>

<svelte:head>
  <title>Autonomic: POTS App &amp; HRV Tracker for Long COVID and ME/CFS</title>
  <meta
    name="description"
    content="A private app for POTS, long COVID and ME/CFS: a five-minute HRV reading, a stand test and a pacing budget against your own normal. Free on iPhone and Android."
  />
  <link rel="canonical" href="https://autonomic.care/" />

  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://autonomic.care/" />
  <meta property="og:title" content="Autonomic: POTS App &amp; HRV Tracker for Long COVID and ME/CFS" />
  <meta property="og:description" content="A private app for POTS, long COVID and ME/CFS: a five-minute HRV reading, a stand test and a pacing budget against your own normal. Free on iPhone and Android." />
  <meta property="og:image" content="https://autonomic.care/og.png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:type" content="image/png" />
  <meta property="og:image:alt" content="Autonomic: see your nervous system recover. A private journal that scores your daily HRV, blood pressure, sleep and orthostatic readings." />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="Autonomic: POTS App &amp; HRV Tracker for Long COVID and ME/CFS" />
  <meta name="twitter:description" content="A private app for POTS, long COVID and ME/CFS: a five-minute HRV reading, a stand test and a pacing budget against your own normal. Free on iPhone and Android." />
  <meta name="twitter:image" content="https://autonomic.care/og.png" />
  <meta name="twitter:image:alt" content="Autonomic: private, offline autonomic recovery journal for POTS, dysautonomia and long COVID." />

  {@html `<script type="application/ld+json">${JSON.stringify(softwareLd)}<\/script>`}
  {@html `<script type="application/ld+json">${JSON.stringify(faqLd)}<\/script>`}
</svelte:head>

<span id="home"></span>
<section class="v2-hero">
  <div class="v2-wrap v2-hero-grid">
    <div>
      <h1>Answers for the questions you live with.</h1>
      <p class="v2-lead-q">Living with <a href={C.pots.href}>{C.pots.label}</a>, <a href={C.longCovid.href}>{C.longCovid.label}</a>, <a href={C.meCfs.href}>{C.meCfs.label}</a>, <a href={C.dysautonomia.href}>{C.dysautonomia.label}</a>, or another <a href={C.chronic.href}>{C.chronic.label}</a>?</p>
      <p class="v2-lead">Stop guessing what makes your days better or worse. Track your body's signals, uncover patterns in your symptoms, and see how your activity and recovery change over time.</p>
      <DownloadBox />
      <div class="v2-trust">
        <b><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7.5 2.8v5.4c0 4.6-3.1 8-7.5 9.8-4.4-1.8-7.5-5.2-7.5-9.8V5.8z" /><path d="m8.8 12 2.2 2.2 4.2-4.4" /></svg>Your health data stays on your phone.</b>
        <span>No account · No ads · No tracking<i class="v2-trust-sep">·</i><strong>Free journal, forever</strong></span>
      </div>
    </div>
    <div class="v2-hero-art">
      <div class="v2-photo"><video id="heroLoop" autoplay muted loop playsinline preload="metadata" poster="/features/hero-loop.webp" width="720" height="1280" aria-hidden="true"><source src="/features/hero-loop.webm" type="video/webm" /><source src="/features/hero-loop.mp4" type="video/mp4" /></video></div>
      <div class="v2-hero-bubble" id="heroBubble">
        <div class="hb-box">
          <div class="hb-glass"><p class="hb-text">{HERO_CUES[0].q}</p></div>
          <svg class="hb-edge" aria-hidden="true"><defs><filter id="hbBlur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14" /></filter><filter id="hbSoft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3" /></filter><mask id="hbOut" maskUnits="userSpaceOnUse"><rect class="hb-mask-r" fill="#fff" /><path class="hb-mask-p" fill="#000" /></mask><clipPath id="hbIn"><path class="hb-in-p" /></clipPath><linearGradient id="hbSpec" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".98" /><stop offset=".32" stop-color="#fff" stop-opacity=".32" /><stop offset=".68" stop-color="#fff" stop-opacity=".18" /><stop offset="1" stop-color="#fff" stop-opacity=".75" /></linearGradient></defs><g mask="url(#hbOut)"><path class="hb-shadow" filter="url(#hbBlur)" /></g><path class="hb-glow" clip-path="url(#hbIn)" filter="url(#hbSoft)" /><path class="hb-rim" /></svg>
        </div>
        <p class="hb-measure" aria-hidden="true"></p>
      </div>
      <div class="v2-hero-phone"><Phone w={236}>
        <div class="hs-layer real on" data-hero-screen><JournalScreen time="6:45" battery={1} /></div>
        <div class="hs-layer real" data-hero-screen><PacingSheetScreen time="8:48" battery={0.9} /></div>
        <div class="hs-layer real" data-hero-screen><InsightsTabScreen time="3:31" battery={0.5} /></div>
        <div class="hs-layer real" data-hero-screen><StandResultScreen time="4:47" battery={0.25} /></div>
        <div class="hs-layer real" data-hero-screen><ProgressScreen time="9:19" battery={0.1} /></div>
      </Phone></div>
    </div>
  </div>
</section>

<section class="v2-sec white" id="familiar">
  <div class="v2-wrap">
    <div class="v2-center">
      <h2 class="v2-h2">Sound familiar?</h2>
      <p class="v2-fam-lead">Tap the experiences that sound like your week.</p>
      <p class="v2-sub">See how Autonomic can help you make sense of them.</p>
    </div>
    <div class="v2-ident">
      {#each EXPERIENCES as e}
        <button type="button" class="v2-ident-btn" aria-pressed="false" data-exp={e.id}><i aria-hidden="true"></i><span>{e.text}</span></button>
      {/each}
    </div>
    <div class="v2-ident-out">
      <div aria-live="polite">
        <div class="v2-ident-t" id="fmTitle">Find your answers.</div>
        <div class="v2-ident-s" id="fmSub">Select what sounds familiar, and we’ll show you the Autonomic features that can help.</div>
        <div class="v2-ident-h" id="fmHint" hidden>Choose at least one experience above first.</div>
      </div>
      <button type="button" class="v2-btn" id="fmCta" aria-disabled="true">See how Autonomic helps</button>
    </div>

    <div class="v2-matches" id="matches" hidden>
      <div class="v2-matches-head" aria-live="polite"><h3 id="fmResultsT" tabindex="-1">{RESULTS_FALLBACK.heading}</h3><p id="fmResultsS">{RESULTS_FALLBACK.description}</p></div>
      <div class="v2-match-grid" id="fmGrid">
        {#each MATCHES as m}
          <article class="v2-match" data-match={m.id} hidden>
            <div class="v2-match-art">
              {#if m.visual === 'pacing'}<Phone w={190}><PacingScreen /></Phone>
              {:else if m.visual === 'insights'}<Phone w={190}><InsightsScreen /></Phone>
              {:else if m.visual === 'stand'}<Phone w={190}><StandScreen /></Phone>
              {:else if m.visual === 'outlook'}<Phone w={190}><OutlookSimpleScreen /></Phone>
              {:else if m.visual === 'reading'}<Phone w={190}><ReadingSimpleScreen /></Phone>
              {:else if m.visual === 'analysis'}<Phone w={190}><ProgressSimpleScreen /></Phone>
              {:else if m.visual === 'watch'}<img class="v2-match-watch" src="/features/watch-stand-test.webp" width="410" height="502" alt="An Apple Watch showing live heart rate during a stand test" loading="lazy" />
              {:else if m.visual === 'doctor'}<DocArt />
              {:else if m.visual === 'trend'}<Phone w={190}><TrendScreen /></Phone>
              {:else if m.visual === 'sleep'}<Phone w={190}><SleepScreen /></Phone>
              {:else if m.visual === 'cycle'}<Phone w={190}><CycleScreen /></Phone>
              {:else if m.visual === 'pressure'}<Phone w={190}><PressureScreen /></Phone>
              {:else if m.visual === 'import'}<Phone w={190}><ImportScreen /></Phone>
              {:else if m.visual === 'protocol'}<Phone w={190}><ProtocolScreen /></Phone>{/if}
            </div>
            <div class="v2-match-body">
              <small>{m.feature}{#if m.pro}<i class="v2-propill">PRO</i>{/if}</small>
              <h4>{m.title}</h4>
              <p>{m.body}</p>
              <p class="v2-match-why" data-match-why></p>
              <a class="v2-link" href={m.href}>{m.link} →</a>
            </div>
          </article>
        {/each}
      </div>
      <button type="button" class="v2-btn ghost v2-match-more" id="fmMore" hidden>Show other features</button>
      <div class="v2-match-dl"><span>Free to download, with {pricing.trialDays} days of Pro.</span><Stores /></div>
    </div>
  </div>
</section>

<section class="v2-sec plum2" id="value">
  <span id="scoring"></span>
  <div class="v2-wrap">
    <div class="v2-headrow end">
      <div><h2 class="v2-h2 on-dark">You get four answers you didn’t have before.</h2></div>
      <p class="v2-sub on-dark narrow">Built from your daily readings and activity, compared against your own baseline.</p>
    </div>
    <div class="v2-answers-wrap at-start" id="answersWrap">
    <div class="v2-answers">
      <a href="/features/hrv-readings/"><b>Is today a good day?</b><span>A score out of 100, built from your own readings.</span><div class="v2-answers-ph"><Phone w={224}><div class="v2-ph-full"><JournalScreen /></div></Phone></div></a>
      <a href="/features/pacing-budget/"><b>How much can I do?</b><span>A budget in hours that spends down as you move.</span><div class="v2-answers-ph"><Phone w={224}><div class="v2-ph-full"><PacingSheetScreen /></div></Phone></div></a>
      <a href="/features/hrv-readings/#crash-warnings"><b>Am I about to crash?</b><span>An early warning when your numbers start to slide.</span><div class="v2-answers-ph"><Phone w={224}><div class="v2-ph-full"><JournalScreen score={61} grade="Moderate" gradeRgb="234,179,8" delta={-12} confidence={90} guide="Reduced reserves. Keep the day easy and stay with the basics of your protocol. Lean on hydration, pacing, and rest, and hold back on anything demanding." figs={SLIDING_FIGS} notice={SLIDING_NOTICE} /></div></Phone></div></a>
      <a href="/features/insights/"><b>What is actually helping?</b><span>What lines up with your better days.</span><div class="v2-answers-ph"><Phone w={224}><div class="v2-ph-full"><InsightsTabScreen /></div></Phone></div></a>
    </div>
    </div>
    <div class="v2-answers-nav" id="answersNav">
      <button type="button" class="v2-answers-hint" id="answersHint">Swipe to explore →</button>
      <div class="v2-answers-dots" role="group" aria-label="Choose an answer">
        <button type="button" class="on" data-answer-dot="0" aria-label="Answer 1 of 4: Is today a good day?" aria-current="true"><i></i></button>
        <button type="button" data-answer-dot="1" aria-label="Answer 2 of 4: How much can I do?"><i></i></button>
        <button type="button" data-answer-dot="2" aria-label="Answer 3 of 4: Am I about to crash?"><i></i></button>
        <button type="button" data-answer-dot="3" aria-label="Answer 4 of 4: What is actually helping?"><i></i></button>
      </div>
    </div>
    <div class="v2-inlinecta"><b>Free on iPhone and Android.</b><Stores tone="glass" /></div>
  </div>
</section>

<section class="v2-sec" id="how">
  <span id="capture"></span>
  <div class="v2-wrap v2-split">
    <div>
      <h2 class="v2-h2">Five minutes in the morning. Answers all day.</h2>
      <p class="v2-sub">No new gadget required. Use your phone camera, an Apple Watch or a chest strap.</p>
      <div class="v2-steps" id="steps">
        {#each STEPS as s, i}
          <button type="button" class:on={i === 0} data-step={i}><i>{i + 1}</i><span><b>{s.title}</b><small>{s.body}</small></span></button>
        {/each}
      </div>
      <div class="v2-works"><span>Works with</span><a href="/features/hrv-readings/">Phone camera</a><a href="/features/apple-watch/">Apple Watch</a><a href="/features/hrv-readings/">Chest strap</a><a href="/features/hrv-readings/">Garmin</a></div>
    </div>
    <div class="v2-arch">
      <div data-step-view="0"><Phone w={260}><div class="v2-ph-full"><SessionScreen /></div></Phone></div>
      <div data-step-view="1" hidden><Phone w={260}><div class="v2-ph-full"><JournalScreen time="7:08" /></div></Phone></div>
      <div data-step-view="2" hidden><Phone w={260}><div class="v2-ph-full"><PacingSheetScreen time="8:48" battery={0.9} /></div></Phone></div>
    </div>
  </div>
</section>

<section class="v2-sec lilac" id="progress">
  <span id="analysis"></span><span id="milestones"></span>
  <div class="v2-wrap">
    <div class="v2-headrow end">
      <div><h2 class="v2-h2">Are you actually getting better? See how things change over time.</h2></div>
      <p class="v2-sub narrow">Recovery is slow and easy to miss day to day. Autonomic keeps every reading, so the long view and what moved it are always one tap away.</p>
    </div>
    <div class="v2-board">
      <div class="v2-board-top">
        <div>
          <div class="v2-board-head">
            <div><small>Morning RMSSD · sample journal</small><div class="v2-board-delta"><b id="rangeDelta">{RANGES[2].delta}</b><span id="rangeNote">{RANGES[2].note}</span></div></div>
            <div class="v2-seg app" id="ranges">{#each RANGES as r, i}<button type="button" class:on={i === 2} data-range={i}>{r.name}</button>{/each}</div>
          </div>
          {#each RANGES as r, i}<div class="v2-rchart-wrap" data-range-view={i} hidden={i !== 2}><RmssdChart id={String(i)} values={r.values} labels={r.labels} /></div>{/each}
          <div class="v2-rchart-key"><span><i class="ln"></i>RMSSD</span><span><i class="dash"></i>3-point average</span><span><i class="zn"></i>Grade breakpoints (ms)</span></div>
        </div>
        <aside class="v2-helped">
          <b>PATTERNS WORTH EXPLORING</b><small>Linked, not proven. Ranked by change in RMSSD.</small>
          <div><i>1</i><span>Electrolytes every morning</span><em class="g">+6 ms</em></div>
          <div><i>2</i><span>Legs up after lunch</span><em class="g">+4 ms</em></div>
          <div><i>3</i><span>In bed before 11pm</span><em class="g">+3 ms</em></div>
          <div><i>4</i><span>Coffee after 2pm</span><em class="r">−5 ms</em></div>
        </aside>
      </div>
      <div class="v2-board-stats">
        <div class="dark"><b>+16 pts</b><span>Better than day one</span><small>Your daily score, first fortnight to last</small></div>
        <div><b>9 days</b><span>Longest clean-day streak</span><small>Set in September</small></div>
        <div><b>2</b><span>Crash days this month</span><small>Down from 6 in August</small></div>
        <div><b>−5 bpm</b><span>Resting heart rate</span><small>Since you started</small></div>
      </div>
    </div>
  </div>
</section>

<section class="v2-sec">
  <div class="v2-wrap">
    <div class="v2-headrow">
      <div><h2 class="v2-h2">Rated {rating.label} by the people using it.</h2></div>
      <div class="v2-revscore card"><b>{rating.label}</b><span><StarRow /><small>{rating.store}</small></span></div>
    </div>
    <div class="v2-g3">
      {#each REVIEWS as r}
        <figure class="v2-review"><StarRow /><b>{r.title}</b><blockquote>{r.body}</blockquote><figcaption>App Store review</figcaption></figure>
      {/each}
    </div>
  </div>
</section>

<section class="v2-sec plum" id="journey">
  <div class="v2-wrap v2-founder">
    <img src="/journey-family.webp" width="480" height="360" alt="Austin, founder of Autonomic, with his wife and six children in South Carolina" loading="lazy" />
    <div>
      <blockquote>“I saw specialist after specialist, and kept leaving with no real answers. So I started tracking it myself. Autonomic is the tool I built to make sense of it.”</blockquote>
      <p class="v2-founder-by">Austin Spaeth · more than four years with long COVID · dad of six, South Carolina</p>
      <a class="v2-link on-dark" href="/story/">Read my story →</a>
    </div>
  </div>
</section>

<section class="v2-sec white" id="pricing">
  <div class="v2-wrap">
    <div class="v2-center"><h2 class="v2-h2">The journal is<br />free. Forever.</h2><p class="v2-sub">Every install opens with {pricing.trialDays} days of Pro. No card, no account.</p></div>
    <div class="v2-prices">
      <div class="v2-price">
        <b class="n">Free</b>
        <div class="amt"><b>$0</b><span>forever</span></div>
        <ul>{#each FREE_ROWS as r}<li>{@html CHECK}{r}</li>{/each}</ul>
        <a class="v2-btn ghost" data-dl-cta data-dl-plan="free" href="/#download"><span class="btn-dl-ic" aria-hidden="true"></span>Download free</a>
      </div>
      <div class="v2-price pro">
        <div class="n-row"><b class="n">Pro</b><i>{pricing.trialDays} days free</i></div>
        <div class="amt"><b>{monthly}</b><span>a month, or {yearly} a year</span></div>
        <ul>{#each PRO_ROWS as r}<li>{@html CHECK}{r}</li>{/each}</ul>
        <a class="v2-btn" data-dl-cta data-dl-plan="pro" href="/#download"><span class="btn-dl-ic" aria-hidden="true"></span>Start {pricing.trialDays} days free</a>
      </div>
    </div>
    <a class="v2-savebar" href="/pricing/#compare">
      <b>Up to {Math.round((1 - pricing.yearly / visibleApp.yearly) * 100)}%<small>less</small></b>
      <span class="v2-savebar-t">than <span class="v2-savebar-app"><img src="/welltory.png" width="22" height="22" alt="" />{competitor.name}</span> and <span class="v2-savebar-app"><img src="/visible.png" width="22" height="22" alt="" />{visibleApp.name}</span>, for the features that matter with POTS, ME/CFS and long COVID.</span>
      <span class="v2-savebar-btn">See how we compare →</span>
    </a>
  </div>
</section>

<span id="compare"></span><span id="ai"></span><span id="watch"></span><span id="cycle"></span><span id="pacing"></span>
<section class="v2-sec" id="privacy">
  <span id="everything"></span>
  <div class="v2-wrap">
    <div class="v2-trust-card">
      <span class="v2-trust-lock" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /><circle cx="12" cy="15.5" r="1.3" /></svg></span>
      <h2 class="v2-h2 sm">Your health data never leaves your phone.</h2>
      <p class="v2-sub">Your readings, symptoms, sleep and cycle are stored on your phone, and every score and insight is worked out there too. No account to make, no cloud of ours to send it to, and it is yours to export whenever you like.</p>
      <div class="v2-trust-chips"><span>No account</span><span>No ads</span><span>No tracking</span><span>Works offline</span><span>Export anytime</span></div>
      <a class="v2-link" href="/privacy-policy/">Read the privacy policy →</a>
    </div>
  </div>
</section>

<section class="v2-sec" id="faq">
  <span id="questions"></span>
  <div class="v2-wrap v2-narrow">
    <h2 class="v2-h2 sm">Good to know.</h2>
    <div class="faq">
      <details><summary>How much does it cost, and is my data private?<span class="fq-i">+</span></summary><p>The app is free to download and your journal is free forever, with no account and no ads. Autonomic Pro is {monthly}/month or {yearly}/year and unlocks the deep-analysis tools. Every install opens with {pricing.trialDays} days of Pro, no card, so you can try all of it first. Your data is always private: stored on your device, never sold, never sent to a server.</p></details>
      <details><summary>What’s free, and what needs Pro?<span class="fq-i">+</span></summary><p>Free covers the daily journal, your manual readings, your daily Autonomic Outlook, unlimited live HRV capture with no daily cap, POTS stand tests and episode captures, cycle tracking, the Apple Watch heart-rate monitor, backups and export, plus 14 days of charts. Pro adds your daily pacing budget, your full history, how your cycle moves your numbers, Insights, POTS test and episode results, and AI insight and doctor reports. There’s a full breakdown in <a href="#pricing">the pricing table</a>, and the same table lives inside the app.</p></details>
      <details><summary>Does it really work offline?<span class="fq-i">+</span></summary><p>Completely. It’s a fully offline app on both iOS and Android. Scoring, trends and reports are computed locally, so it works anywhere, no signal required.</p></details>
      <details><summary>Which conditions is it built for?<span class="fq-i">+</span></summary><p>POTS, dysautonomia, long COVID and post-viral or post-illness recovery, anywhere daily HRV, heart-rate and orthostatic patterns matter.</p></details>
      <details><summary>Is Autonomic available on Android?<span class="fq-i">+</span></summary><p>Yes. Autonomic is available now on both iPhone (App Store) and Android (Google Play), at the same price, with the same private, offline design. One honest difference: the Apple Watch companion app is iPhone-only. On Android the stand test, episode capture and HRV readings all run in the app itself, using a Bluetooth chest strap or your phone’s camera, and it reads your sleep and workouts from Health Connect the way the iPhone build reads Apple Health.</p></details>
      <details><summary>Do I need a wearable or special hardware?<span class="fq-i">+</span></summary><p>No. Autonomic can measure your HRV with nothing but your phone: rest a fingertip on the rear camera for three minutes and it reads your pulse directly. You can also type readings in by hand from any source. That said, a Polar H10 chest strap, an Apple Watch or a blood pressure cuff make it far more powerful, the more data you feed it, the better you understand how your body is doing.</p></details>
      <details><summary>How do the AI insights work?<span class="fq-i">+</span></summary><p>Autonomic builds a structured analysis prompt from your data over a date range. You copy it into Claude, Gemini or ChatGPT, the text is generated on-device, nothing is sent automatically.</p></details>
      <details><summary>Is this medical advice?<span class="fq-i">+</span></summary><p>No. Autonomic is a personal tracking and reflection tool. It helps you organize data and conversations, but it doesn’t diagnose or treat. Always work with your clinician.</p></details>
    </div>
  </div>
</section>


<section class="v2-sec soft" id="download">
  <div class="v2-wrap">
    <div class="v2-cta big">
      <div class="v2-cta-copy">
        <span class="v2-appicon"><svg viewBox="0 0 651.59 348.34" aria-hidden="true"><path d={APP_MARK_PATH} fill="#e03127" stroke="#e03127" stroke-width="9" /></svg></span>
        <h2>Tomorrow morning, get your first answer.</h2>
        <p>Free on iPhone and Android. Private by design.</p>
        <div class="v2-cta-row"><Stores tone="glass" /><div class="v2-cta-qr"><Qr /></div></div>
      </div>
      <div class="v2-cta-ph"><Phone w={260}><div class="v2-ph-full"><JournalScreen time="7:02" score={32} grade="Bad" gradeRgb="239,68,68" delta={-14} guide="System is stressed. Rest and gentle breathing. Look at what’s driving it: sleep, food, illness, or accumulated load." figs={[{ text: '17', unit: 'ms', color: '#ef4444', label: 'HRV' }, { text: '84', unit: 'bpm', color: '#f97316', label: 'Resting HR' }, { text: '4h 50m', color: '#ef4444', label: 'Sleep' }]} notice={{ emoji: '⚠️', text: 'Autonomic score trending down 14 points over the last 3 days', chevron: true }} /></div></Phone></div>
    </div>
  </div>
</section>

{@html homeScript}
