<script lang="ts">
  /**
   * /press: the whole press kit as one shareable link.
   *
   * Source of truth is the `press-kit/` folder at the repo root; this page is
   * that copy, rendered, and `static/press/autonomic-press-kit.zip` is built
   * from both. When one changes, change the other two with it.
   *
   * The site runs `csr = false`, so the FAQ uses native <details> and the
   * copy buttons are one inline vanilla script. With JS off the boilerplate is
   * still plain selectable text.
   */
  import { site, appStoreLink, playStoreLink, pricing, priceLabel, rating, competitor, visibleApp } from '$lib/site';
  import FeatureSeo from '$lib/v2/FeatureSeo.svelte';
  import ReviewStrip from '$lib/v2/ReviewStrip.svelte';
  import Faq from '$lib/v2/Faq.svelte';

  const email = 'austin@autonomic.care';
  const mail = `mailto:${email}?subject=Press%20enquiry%20about%20Autonomic`;
  const monthly = priceLabel(pricing.monthly);
  const yearly = priceLabel(pricing.yearly);
  const ZIP_MB = '2.2';
  const savePct = Math.round((1 - pricing.yearly / visibleApp.yearly) * 100);

  const facts: [string, string][] = [
    ['Name', 'Autonomic'],
    ['Tagline', 'Answers for the questions you live with.'],
    ['What it is', 'A private recovery journal for people living with POTS, long COVID, ME/CFS and dysautonomia. A five-minute morning reading becomes a daily score, a pacing budget and an early warning, and over weeks the app shows what lines up with better days. Health data stays on the phone.'],
    ['Platforms', 'iPhone with an Apple Watch app, and Android with Health Connect. Garmin watches through the Autonomic Connect IQ app. Both stores live since July 2026.'],
    ['Price', `The journal is free forever, with no account and no ads. Autonomic Pro is ${monthly} a month or ${yearly} a year. Every install opens with ${pricing.trialDays} days of Pro, with no card.`],
    ['Rating', `${rating.label} on the ${rating.store}`],
    ['Category', 'Health & Fitness'],
    ['Founder', 'Austin Spaeth, solo patient-founder. Long hauler of 4+ years, dad of six, South Carolina.'],
    ['Launched', 'July 2026'],
    ['Press contact', email]
  ];

  const features = [
    { n: 'Journal + HRV', d: 'A five-minute reading with the phone camera, an Apple Watch, a Garmin or a chest strap, plus sleep, symptoms, triggers, meds, water and digestion in a couple of taps.', href: '/features/hrv-readings/' },
    { n: 'Daily Autonomic Outlook', d: 'The morning reading, sleep and resting heart rate become a score out of 100 and plain guidance, graded against the person’s own baseline.', href: '/features/hrv-readings/' },
    { n: 'Pacing budget', d: 'A daily energy budget in hours and minutes that spends down with steps, time upright and heart rate, and is judged on the two days after, when crashes land.', href: '/features/pacing-budget/' },
    { n: 'Crash warnings', d: 'An early flag when the score slides for days, or when several markers drift from the person’s own normal at once.', href: '/features/hrv-readings/#crash-warnings' },
    { n: 'Insights', d: 'Everything logged is tested against HRV, sleep and symptoms, corrected for chance, and reported as linked, never proven.', href: '/features/insights/' },
    { n: 'POTS stand test', d: 'A guided lie-and-stand test on Apple Watch or a chest strap, plus one-tap capture of real-life episodes like stairs or getting up.', href: '/features/pots-stand-test/' },
    { n: 'Cycle-aware tracking', d: 'Readings and warnings are compared with the same phase of past cycles, so a predictable dip is not mistaken for a decline.', href: '/features/cycle-tracking/' },
    { n: 'AI reports', d: 'Weeks of data turned into a doctor summary or health report by the AI the person chooses. Nothing leaves the phone until they paste it.', href: '/features/doctor-reports/' },
    { n: 'Apple Watch and Garmin', d: 'Live heart rate with a buzz when it jumps 30 bpm, the stand test on the wrist, and today’s pacing budget at a glance.', href: '/features/apple-watch/' }
  ];

  // `real` marks a capture from the app itself; the others are drawn from the
  // app's own screens with sample data (see the home page's phone screens).
  const shots = [
    { file: '01-daily-outlook', label: 'Daily Autonomic Outlook', caption: 'A morning reading, sleep and resting heart rate rolled into one score out of 100, with plain guidance for the day.' },
    { file: '02-pacing-budget', label: 'Pacing budget', caption: 'Today’s budget in hours and minutes, what has been spent, and where it went.' },
    { file: '03-insights', label: 'Insights', caption: 'What changed since starting a supplement, and what lines up with better days, with the evidence one tap away.' },
    { file: '04-live-hrv-reading', label: 'Live HRV reading', caption: 'A paced breathing session reading beat-to-beat intervals live, with heart rate, SDNN and the raw trace.' },
    { file: '05-crash-warning', label: 'Crash warning', caption: 'The Journal on a sliding day: a lower score, plainer guidance, and a warning that the trend is heading down.' },
    { file: '06-pots-stand-test-result', label: 'POTS stand test result', caption: 'A guided lie-and-stand test: the sustained rise, the heart rate curve and the minute the person stood.' },
    { file: '07-stand-tests-over-time', label: 'Stand tests over time', caption: 'Every stand test kept and compared, so a sustained rise can be followed for months.' },
    { file: '08-hrv-over-time', label: 'HRV over time', caption: 'Morning HRV across weeks, graded, with baseline and training readings split.' },
    { file: '09-apple-watch-stand-test', label: 'Apple Watch stand test', caption: 'The standing phase of a stand test on the wrist, with the live rise from lying down.' }
  ];

  const boilerplates = [
    { id: 'bp-one', label: 'One line', text: 'Autonomic is a private recovery app for POTS, long COVID, ME/CFS and dysautonomia that turns a five-minute morning reading into answers: how today looks, how much you can do, and what is actually helping.' },
    { id: 'bp-privacy', label: 'One line, privacy-led', text: 'Autonomic is a health app with no account and no cloud for your health data: it scores your HRV, sleep and symptoms on your phone, and nothing you log leaves it unless you export it.' },
    { id: 'bp-25', label: '25 words', text: 'Autonomic is a private recovery app for POTS, long COVID and ME/CFS. It scores daily HRV against your own baseline and keeps health data on-device.' },
    { id: 'bp-50', label: '50 words', text: `Autonomic is a private recovery app for POTS, long COVID, ME/CFS and dysautonomia. A five-minute morning reading, from the phone camera, an Apple Watch, a Garmin or a chest strap, becomes a daily score, a pacing budget and an early warning. Health data stays on the phone. Free journal; Pro is ${yearly} a year.` },
    { id: 'bp-100', label: '100 words (About Autonomic)', text: `Autonomic is a private recovery app for people living with POTS, long COVID, ME/CFS and dysautonomia, built around the questions they live with: is today a good day, how much can I do, am I about to crash, and what is actually helping? A five-minute morning reading from the phone camera, an Apple Watch, a Garmin or a chest strap becomes a daily score, a pacing budget in hours and minutes, and an early warning when the numbers slide. Over weeks, Insights shows what lines up with better days. Health data stays on the phone, with no account. Built by a patient-founder. Free journal; Pro is ${yearly} a year. autonomic.care` }
  ];

  const quotes = [
    { on: 'On why it exists', text: 'I saw specialist after specialist in cardiology and neurology, and kept leaving with no real answers. So I started tracking everything myself: HRV, blood pressure, sleep, the days I crashed. Slowly the patterns showed up. Autonomic is the tool I built to make sense of my own recovery.' },
    { on: 'On the privacy architecture', text: 'Other health apps promise not to sell your data. Autonomic doesn’t have it to sell. There’s no account and no server holding your health data, so the numbers never leave your phone. For people already anxious about who sees their health data, that’s the whole point.' },
    { on: 'On no false hope', text: 'I’m not healed, and I won’t pretend otherwise. The app doesn’t promise recovery. It shows you honestly what’s helping and what’s hurting. That’s what I needed, so that’s what I built.' },
    { on: 'On measurement rigor', text: 'A noisy reading should tell you it’s noisy, not invent a number. Every metric is graded against published thresholds, out in the open, so a good day and a warning sign don’t look the same.' },
    { on: 'On who it is for', text: 'I’m not a doctor or an expert. I’m someone on this road: four years of long COVID, six kids, figuring out my recovery one reading at a time. I built the app I wished I’d had when I was getting no answers.' },
    { on: 'On the business model', text: 'It’s one person and a subscription, no investor, no data to sell. That’s exactly why the app has no reason to touch your data. It’s free to use, and there’s a hardship path for anyone who needs it.' }
  ];

  const angles = [
    {
      for: 'Patient and health press',
      hook: 'A long hauler built the tool he could not find.',
      points: [
        'A patient-founder with four years of long COVID, after specialist visits left him without answers.',
        'Built for chronic illness rather than athletes: a POTS stand test, a pacing budget judged on the two days after, cycle-aware baselines.',
        'Honest by design: insights are corrected for chance and say “linked, never proven”, and an empty report is a real answer.'
      ]
    },
    {
      for: 'Privacy and technology press',
      hook: 'A health app with no account and no cloud for health data.',
      points: [
        'Every reading, score and insight is computed and stored on the phone.',
        'The only automatic traffic is anonymous counts and error reports with no identifier: never a reading, a symptom or a name.',
        'In a market of cloud-first wellness apps, the architecture does the work a privacy policy usually promises.'
      ]
    }
  ];

  const faq = [
    { q: 'What is Autonomic, in one line?', a: 'A private recovery app for POTS, long COVID, ME/CFS and dysautonomia that turns a five-minute morning reading into answers: how today looks, how much you can do, and what is actually helping.' },
    { q: 'Who is it for?', a: 'People living with POTS, long COVID, ME/CFS, dysautonomia and the chronic illnesses that travel with them, and anyone trying to see whether their recovery is actually trending the right way.' },
    { q: 'How is it private, exactly?', a: 'There is no account and no cloud for health data. Readings are captured, scored and stored on the phone, and every insight is computed there. Data leaves only when the person exports it or pastes a report into an AI themselves. The app does send anonymous usage counts and error reports to a server, with no identifier and no health data in them, so we can tell whether it works. The privacy policy at autonomic.care describes exactly what is sent.' },
    { q: 'Is it a medical device? Does it diagnose anything?', a: 'No. Autonomic is a personal journal and education tool. It does not diagnose, treat, or prevent any disease, and it never tells anyone to start, stop or change a treatment.' },
    { q: 'How does it measure HRV without a lab?', a: 'It captures beat-to-beat intervals from a Bluetooth chest strap, an optical band like the Polar Verity Sense, an Apple Watch, a Garmin watch, or the phone’s camera with a fingertip over the lens. It computes the standard time- and frequency-domain HRV metrics on the phone, with artifact correction, and grades every reading against published thresholds and the person’s own baseline. A noisy reading is flagged, not turned into a confident number.' },
    { q: 'How is it different from Welltory, Visible or a smartwatch?', a: `It is built for chronic illness rather than fitness: a POTS stand test, a pacing budget judged on the two days after, cycle-aware baselines, and insights corrected for chance. It works with the phone camera, an Apple Watch, a Garmin or a strap rather than one brand of band, keeps health data on the phone, and costs ${yearly} a year, up to ${savePct}% less than ${competitor.name} or ${visibleApp.name}. The full comparison is at autonomic.care/pricing.` },
    { q: 'What does it cost?', a: `The journal is free forever, including unlimited HRV readings and every stand test. Autonomic Pro is ${monthly} a month or ${yearly} a year and adds the pacing budget, Insights, full history, stand test results and AI reports. Every install starts with ${pricing.trialDays} days of Pro. For anyone who can’t afford it, email ${email} and Austin will send a free code, no questions asked.` },
    { q: 'Who built it?', a: 'One person: Austin Spaeth, a patient-founder who has lived with long COVID for four-plus years and built the app during his own recovery, after specialists left him without answers. He is a solo developer and a dad of six in South Carolina.' },
    { q: 'What platforms, and when did it launch?', a: 'iPhone with an Apple Watch app, and Android with Health Connect, both launched in July 2026. Garmin watches work through the Autonomic Connect IQ app.' },
    { q: 'Do you have user data or outcomes to share?', a: 'No health data, by design: none of it ever leaves users’ phones, so there is no dataset of readings or outcomes to share. Anonymous counts tell us roughly how many people use the app, but they carry no identity and no health information.' },
    { q: 'Can I use the screenshots?', a: 'Yes. Every image on this page is free to use in coverage of Autonomic. Some screens use sample data.' },
    { q: 'Can I get a review copy or a walkthrough?', a: `Yes. The app is free to download on both stores, and Austin is happy to give a live walkthrough or answer questions at ${email}.` }
  ];

  // Copy-to-clipboard for the boilerplate blocks. Inline because csr = false.
  const copyScript = `<script>
(function () {
  document.querySelectorAll('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var el = document.getElementById(btn.getAttribute('data-copy'));
      if (!el || !navigator.clipboard) return;
      navigator.clipboard.writeText(el.innerText.trim()).then(function () {
        var old = btn.textContent;
        btn.textContent = 'Copied';
        btn.classList.add('is-copied');
        setTimeout(function () { btn.textContent = old; btn.classList.remove('is-copied'); }, 1600);
      });
    });
  });
})();
<\/script>`;
</script>

<FeatureSeo
  name="Press kit"
  path="/press/"
  section={null}
  {faq}
  title="Press Kit: Facts, Screenshots and Founder Story | Autonomic"
  description="The Autonomic press kit: fact sheet, screenshots, boilerplate, founder story, quotes and brand assets for the private app for POTS, long COVID and ME/CFS."
/>

<section class="v2-phead">
  <div class="v2-wrap">
    <h1>Everything you need to write about Autonomic.</h1>
    <p class="v2-lead">Autonomic is a private recovery app for people living with POTS, long COVID, ME/CFS and dysautonomia, built around one idea: <b>answers for the questions you live with.</b> Facts, images, copy and quotes below are confirmed against the shipping app and free to use.</p>
    <div class="v2-phead-cta">
      <a class="v2-btn" href="/press/autonomic-press-kit.zip" download>Download all assets ({ZIP_MB} MB)</a>
      <a class="v2-btn ghost" href={mail}>Email {email}</a>
    </div>
    <div class="v2-trust-chips"><span>No account</span><span>Health data stays on the phone</span><span>iPhone, Apple Watch and Android</span><span>Rated {rating.label} on the {rating.store}</span></div>
    <nav class="pk-jump" aria-label="On this page">
      <a href="#facts">Facts</a><a href="#screenshots">Screenshots</a><a href="#boilerplate">Boilerplate</a><a href="#founder">Founder</a><a href="#quotes">Quotes</a><a href="#angles">Story angles</a><a href="#privacy">Privacy</a><a href="#faq">FAQ</a><a href="#brand">Brand assets</a>
    </nav>
  </div>
</section>

<section class="v2-sec white" id="facts">
  <div class="v2-wrap">
    <div class="v2-headrow end">
      <div><h2 class="v2-h2">The short version.</h2></div>
      <p class="v2-sub narrow">Everything here matches the app on both stores today.</p>
    </div>
    <dl class="pk-facts">
      {#each facts as [k, v]}<div><dt>{k}</dt><dd>{v}</dd></div>{/each}
      <div><dt>Links</dt><dd><a href={site.url}>autonomic.care</a> · <a href={appStoreLink}>App Store</a> · <a href={playStoreLink}>Google Play</a> · <a href="/pricing/">Pricing</a></dd></div>
    </dl>
  </div>
</section>

<section class="v2-sec">
  <div class="v2-wrap">
    <div class="v2-center"><h2 class="v2-h2">Four answers from one morning reading.</h2><p class="v2-sub">Is today a good day? How much can I do? Am I about to crash? What is actually helping? Here is the part of the app behind each one.</p></div>
    <div class="v2-g3 pk-feats">
      {#each features as f}<a class="pk-feat" href={f.href}><b>{f.n}</b><span>{f.d}</span><em>Read more →</em></a>{/each}
    </div>
  </div>
</section>

<section class="v2-sec lilac" id="screenshots">
  <div class="v2-wrap">
    <div class="v2-headrow end">
      <div><h2 class="v2-h2">Clean images of the app, ready to drop in.</h2></div>
      <p class="v2-sub narrow">Un-captioned, at full phone resolution. Click any image for the full-size PNG.</p>
    </div>
    <div class="pk-shots">
      {#each shots as s}
        <figure class="pk-shot">
          <a class="pk-shot-img" href="/press/{s.file}.png" download><img src="/press/{s.file}-preview.jpg" alt="Autonomic app: {s.label}" loading="lazy" /></a>
          <figcaption><b>{s.label}</b><span>{s.caption}</span><a class="pk-dl" href="/press/{s.file}.png" download>Download PNG</a></figcaption>
        </figure>
      {/each}
    </div>
  </div>
</section>

<section class="v2-sec white" id="boilerplate">
  <div class="v2-wrap v2-narrow">
    <h2 class="v2-h2 sm">Pick the length that fits.</h2>
    {#each boilerplates as b}
      <div class="pk-copy">
        <div class="pk-copy-head"><span>{b.label}</span><button class="pk-copy-btn" type="button" data-copy={b.id}>Copy</button></div>
        <p id={b.id}>{b.text}</p>
      </div>
    {/each}
  </div>
</section>

<section class="v2-sec plum" id="founder">
  <div class="v2-wrap v2-founder">
    <img src="/journey-family.webp" width="480" height="360" alt="Austin Spaeth, founder of Autonomic, with his wife and six children in South Carolina" loading="lazy" />
    <div>
      <blockquote>“I saw specialist after specialist, and kept leaving with no real answers. So I started tracking it myself. Autonomic is the tool I built to make sense of it.”</blockquote>
      <p class="v2-founder-by">Austin Spaeth · more than four years with long COVID · dad of six, South Carolina</p>
      <div class="pk-founder-links"><a class="v2-link on-dark" href="/press/founder-austin-spaeth.jpg" download>Download headshot →</a><a class="v2-link on-dark" href="/story/">Read the full story →</a></div>
    </div>
  </div>
</section>

<section class="v2-sec">
  <div class="v2-wrap v2-explain">
    <div class="v2-explain-head">
      <h2 class="v2-h2 sm">In his words.</h2>
      <div class="v2-facts">
        <small>For a pitch or an about box</small>
        <p class="pk-short">Autonomic was built by Austin, a long-COVID patient of more than four years. After specialist visits in cardiology and neurology left him with no real answers, he started tracking his own physiology (HRV, blood pressure, sleep, the days he crashed) until the patterns surfaced and he found what genuinely helped. Autonomic is the app he built from that. He is a solo founder, a long hauler, and a dad of six in South Carolina.</p>
      </div>
    </div>
    <div class="v2-prose">
      <p>For more than four years, I’ve been living with long COVID. It started with blood pressure that spiked out of nowhere, a heart that raced the moment I stood up, brain fog that swallowed whole days, and a long list of symptoms that never quite fit together. I saw specialist after specialist in cardiology, neurology and beyond, and kept leaving with the same thing: no real answers.</p>
      <p>So I started tracking it myself: HRV, blood pressure, heart rate, sleep, what I ate, the days I crashed. Slowly, patterns surfaced. I found small things that made life more livable, and I got a little better. I’m not healed, and I won’t pretend otherwise. But over the two years I’ve used my own early version of Autonomic, I’ve been able to see what genuinely helps and reach a far better place than I’d been in for a long time.</p>
      <p>I’m not a doctor. I’m not an expert. I’m just someone on this road, in South Carolina, raising six kids, figuring out my own recovery one reading at a time. Autonomic is the tool I built to make sense of it. If it helps you spot your own patterns, find your own answers, and feel a little more in control of your journey too, then it’s done exactly what I hoped.</p>
    </div>
  </div>
</section>

<section class="v2-sec white" id="quotes">
  <div class="v2-wrap">
    <div class="v2-headrow end">
      <div><h2 class="v2-h2">Ready to attribute.</h2></div>
      <p class="v2-sub narrow">Attribute as <b>Austin Spaeth, founder of Autonomic</b>. Quote verbatim, or ask for something specific.</p>
    </div>
    <div class="pk-quotes">
      {#each quotes as q}<figure class="pk-quote"><small>{q.on}</small><blockquote>“{q.text}”</blockquote></figure>{/each}
    </div>
  </div>
</section>

<section class="v2-sec" id="angles">
  <div class="v2-wrap">
    <div class="v2-center"><h2 class="v2-h2">Two stories, one app.</h2><p class="v2-sub">Same product, different reporter. Austin is glad to talk through either.</p></div>
    <div class="v2-verdicts">
      {#each angles as a, i}
        <div class="v2-verdict" class:us={i === 0}>
          <small>{a.for}</small>
          <b>{a.hook}</b>
          <ul>{#each a.points as pt}<li>{pt}</li>{/each}</ul>
        </div>
      {/each}
    </div>
  </div>
</section>

<section class="v2-sec white" id="privacy">
  <div class="v2-wrap">
    <div class="v2-headrow end">
      <div><h2 class="v2-h2">The architecture, not a policy.</h2></div>
      <p class="v2-sub narrow">Worth checking, and true: there is no cloud of ours to hold anyone’s health data.</p>
    </div>
    <div class="pk-diagram"><img src="/press/data-flow-diagram.svg" width="920" height="610" alt="Data-flow diagram: heart-rate sources feed the phone, where readings are captured, scored and stored. No health data goes to any server; it leaves only in an export the user starts." loading="lazy" /></div>
    <div class="v2-ledger">
      <div class="v2-ledger-col stays">
        <b>Stays on the phone</b>
        <ul>
          <li>Every reading, symptom, note, cycle day and sleep record</li>
          <li>Every score, budget, warning and insight, computed there</li>
          <li>Apple Health and Health Connect data the person chooses to share</li>
        </ul>
      </div>
      <div class="v2-ledger-col sends">
        <b>Leaves the phone</b>
        <ul>
          <li><strong>An export or AI report,</strong> only when the person shares it</li>
          <li><strong>Anonymous counts and error reports,</strong> with no identifier and no health data in them</li>
        </ul>
      </div>
    </div>
    <a class="v2-link" href="/privacy-policy/">Read the privacy policy →</a>
  </div>
</section>

<ReviewStrip />

<Faq id="faq" title="Press FAQ" items={faq} />

<section class="v2-sec white" id="brand">
  <div class="v2-wrap">
    <div class="v2-headrow end">
      <div><h2 class="v2-h2">Logo, icon and diagram.</h2></div>
      <p class="v2-sub narrow">Please keep the icon on a dark background and the mark in its own red.</p>
    </div>
    <div class="pk-brand">
      <a class="pk-brandcard" href="/press/autonomic-logo.svg" download><span class="pk-brand-art"><img src="/press/autonomic-logo.svg" alt="Autonomic logo" /></span><b>Logo</b><small>SVG</small></a>
      <a class="pk-brandcard" href="/press/autonomic-icon.png" download><span class="pk-brand-art"><img class="pk-icon" src="/press/autonomic-icon.png" alt="Autonomic app icon" /></span><b>App icon</b><small>PNG</small></a>
      <a class="pk-brandcard" href="/press/data-flow-diagram.svg" download><span class="pk-brand-art"><img src="/press/data-flow-diagram.svg" alt="Data-flow diagram" /></span><b>Data-flow diagram</b><small>SVG</small></a>
      <a class="pk-brandcard" href="/press/founder-austin-spaeth.jpg" download><span class="pk-brand-art"><img class="pk-face" src="/press/founder-austin-spaeth.jpg" alt="Austin Spaeth" /></span><b>Founder headshot</b><small>JPG</small></a>
    </div>
  </div>
</section>

<section class="v2-sec soft">
  <div class="v2-wrap">
    <div class="v2-cta">
      <div class="v2-cta-copy">
        <h2>Austin answers press email himself.</h2>
        <p>Happy to give a live walkthrough, a review copy, or answer anything on this page.</p>
      </div>
      <a class="v2-btn" href={mail}>Email {email}</a>
    </div>
    <p class="v2-fine pk-note">Autonomic is a personal journal and education tool, not a medical device. It does not diagnose, treat, or prevent any disease, and it never promises recovery.</p>
  </div>
</section>

{@html copyScript}

<style>
  .v2-phead .v2-trust-chips { margin-top: 26px; }
  .pk-jump { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px 18px; margin-top: 26px; font-size: 14.5px; font-weight: 700; }
  .pk-jump a { color: var(--mute); border-bottom: 1px solid transparent; transition: color .15s, border-color .15s; }
  .pk-jump a:hover { color: var(--ink); border-bottom-color: color-mix(in srgb, currentColor 45%, transparent); }

  .pk-facts { margin: 0; background: var(--paper); border-radius: 28px; padding: 6px 28px; }
  .pk-facts > div { display: grid; grid-template-columns: 190px 1fr; gap: 20px; padding: 17px 0; border-bottom: 1px solid #e3dde2; }
  .pk-facts > div:last-child { border-bottom: 0; }
  .pk-facts dt { font-size: 16px; font-weight: 800; color: var(--ink); }
  .pk-facts dd { margin: 0; font-size: 16px; line-height: 1.6; color: var(--mute); }
  .pk-facts dd a { color: var(--red); font-weight: 700; }

  .pk-feat { --ring: #d3c8d6; display: flex; flex-direction: column; gap: 8px; background: #fff; border-radius: 24px; padding: 24px; color: var(--ink); box-shadow: 0 0 0 0 var(--ring); transition: box-shadow .32s cubic-bezier(.34,1.56,.64,1); }
  .pk-feat b { font-size: 20px; font-weight: 800; letter-spacing: -.02em; }
  .pk-feat span { flex: 1; color: var(--mute); font-size: 15px; line-height: 1.55; }
  .pk-feat em { font-style: normal; font-size: 14.5px; font-weight: 700; color: var(--red); }
  @media (hover: hover) { .pk-feat:hover { box-shadow: 0 0 0 3px var(--ring); } }
  .pk-feat:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--ring); }

  .pk-shots { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; }
  .pk-shot { margin: 0; background: #fff; border-radius: 26px; padding: 14px 14px 20px; display: flex; flex-direction: column; }
  .pk-shot-img { display: flex; align-items: center; justify-content: center; height: 440px; border-radius: 18px; background: #f4f0f4; overflow: hidden; }
  .pk-shot-img img { display: block; height: 400px; width: auto; max-width: 92%; object-fit: contain; border-radius: 16px; box-shadow: 0 20px 36px -22px rgba(20,14,26,.6); }
  .pk-shot figcaption { padding: 16px 8px 0; display: flex; flex-direction: column; gap: 4px; flex: 1; }
  .pk-shot figcaption b { font-size: 18px; font-weight: 800; letter-spacing: -.015em; }
  .pk-shot figcaption span { flex: 1; font-size: 14.5px; line-height: 1.5; color: var(--mute); }
  .pk-dl { margin-top: 10px; font-size: 14.5px; font-weight: 700; color: var(--red); align-self: flex-start; }

  .pk-copy { background: var(--paper); border-radius: 22px; padding: 20px 22px; margin-top: 14px; }
  .pk-copy-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
  .pk-copy-head span { font-size: 13px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: #8d8491; }
  .pk-copy p { margin: 0; font-size: 17px; line-height: 1.65; color: var(--ink); }
  .pk-copy-btn { --ring: #d3c8d6; border: 0; border-radius: 999px; background: #fff; padding: 8px 16px; font: 700 13.5px/1 var(--body); color: var(--ink); cursor: pointer; box-shadow: 0 0 0 0 var(--ring); transition: box-shadow .32s cubic-bezier(.34,1.56,.64,1), background .15s, color .15s; }
  @media (hover: hover) { .pk-copy-btn:hover { box-shadow: 0 0 0 3px var(--ring); } }
  .pk-copy-btn:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--ring); }
  :global(.pk-copy-btn.is-copied) { background: #eef8f1; color: #1f7a45; }

  .pk-founder-links { display: flex; flex-wrap: wrap; gap: 4px 24px; }
  .pk-short { margin: 4px 0 16px; font-size: 15.5px; line-height: 1.6; color: #3d3642; }

  .pk-quotes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
  .pk-quote { margin: 0; background: var(--paper); border-radius: 24px; padding: 26px; }
  .pk-quote small { display: block; font-size: 13.5px; font-weight: 700; color: var(--red); margin-bottom: 10px; }
  .pk-quote blockquote { margin: 0; font-size: 18px; font-weight: 700; line-height: 1.45; letter-spacing: -.01em; color: var(--ink); }

  #angles :global(.v2-verdict li) { display: block; position: relative; padding-left: 18px; }
  #angles :global(.v2-verdict li)::before { content: ''; position: absolute; left: 2px; top: .62em; width: 7px; height: 7px; border-radius: 50%; background: var(--red); margin: 0; }
  #angles :global(.v2-verdict.us li)::before { background: #ff8c7d; }

  .pk-diagram { background: var(--paper); border-radius: 28px; padding: 24px; margin-bottom: 18px; }
  .pk-diagram img { display: block; width: 100%; max-width: 920px; height: auto; margin: 0 auto; border-radius: 16px; }
  #privacy .v2-ledger { margin-top: 0; }

  .pk-brand { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
  .pk-brandcard { --ring: #d3c8d6; display: flex; flex-direction: column; gap: 2px; background: var(--paper); border-radius: 24px; padding: 14px 14px 18px; color: var(--ink); box-shadow: 0 0 0 0 var(--ring); transition: box-shadow .32s cubic-bezier(.34,1.56,.64,1); }
  @media (hover: hover) { .pk-brandcard:hover { box-shadow: 0 0 0 3px var(--ring); } }
  .pk-brandcard:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--ring); }
  .pk-brand-art { display: flex; align-items: center; justify-content: center; height: 150px; background: #fff; border-radius: 16px; margin-bottom: 12px; padding: 18px; }
  .pk-brand-art img { max-width: 100%; max-height: 100%; width: auto; }
  .pk-brand-art .pk-icon { height: 92px; border-radius: 22px; }
  .pk-brand-art .pk-face { height: 112px; width: 112px; border-radius: 50%; object-fit: cover; }
  .pk-brandcard b { font-size: 17px; font-weight: 800; padding: 0 6px; }
  .pk-brandcard small { font-size: 13.5px; font-weight: 600; color: var(--mute); padding: 0 6px; }

  .pk-note { text-align: center; margin-top: 22px; }

  @media (max-width: 1060px) {
    .pk-shots { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .pk-brand { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (max-width: 760px) {
    .pk-facts { padding: 4px 20px; }
    .pk-facts > div { grid-template-columns: 1fr; gap: 4px; }
    .pk-quotes { grid-template-columns: 1fr; }
  }
  @media (max-width: 620px) {
    .pk-diagram { padding: 8px; border-radius: 22px; }
    .pk-diagram img { border-radius: 14px; }
    .pk-shots { grid-template-columns: 1fr; }
    .pk-shot-img { height: 400px; }
    .pk-shot-img img { height: 360px; }
  }
</style>
