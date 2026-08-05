<script lang="ts">
  /**
   * /press: the whole press kit as one shareable link.
   *
   * Source of truth is the `press-kit/` folder at the repo root; this page is
   * that copy, rendered. When those files change, change this page with them.
   *
   * The site runs `csr = false`, so there is no client-side Svelte here: the
   * FAQ uses native <details>, and the copy-to-clipboard buttons are a single
   * inline vanilla script injected with {@html} (same trick app.html uses for
   * JSON-LD). Everything still works with JS off except the copy buttons,
   * which degrade to plain selectable text.
   */
  import { site, appStoreUrl, playStoreUrl, pricing, priceLabel } from '$lib/site';

  const canonical = `${site.url}/press/`;
  const email = 'austin@autonomic.care';
  const title = 'Press Kit | Autonomic';
  const description =
    'Press kit for Autonomic: fact sheet, boilerplate, founder story, quotes, screenshots and brand assets. A private, offline app that scores HRV, blood pressure, sleep and orthostatic data for POTS, dysautonomia and long COVID.';

  const shots = [
    { file: '01-live-hrv', label: 'Live HRV capture', caption: 'A paced 4/6 breathing session reading beat-to-beat intervals live from a chest strap.' },
    { file: '02-autonomic-score', label: 'Daily Autonomic Score', caption: 'Every reading of the day rolled into one 0-100 score with a plain-language outlook.' },
    { file: '03-graded-reading', label: 'A graded reading', caption: 'Every metric scored against published thresholds, with the raw RR trace shown.' },
    { file: '04-analysis', label: 'Trends over time', caption: 'SDNN and RMSSD tracked across days, weeks, months and years, in grade zones.' },
    { file: '05-privacy', label: 'No account, no cloud', caption: 'What the app tells you on first run: nothing leaves the device unless you export it.' },
    { file: '06-watch-stand-test', label: 'POTS stand test (Apple Watch)', caption: 'The standing phase of a guided lie-and-stand test, showing a +31 bpm delta.' }
  ];

  const facts: [string, string][] = [
    ['What it is', 'A private, offline-first app that scores your daily HRV, blood pressure, sleep and orthostatic readings against published medical thresholds, built for people recovering from POTS, dysautonomia, long COVID and post-viral illness.'],
    ['Platforms', 'iOS + Apple Watch · Android (Health Connect). Both live as of July 2026.'],
    ['Price', `Free to use, with no account. Autonomic Pro is ${priceLabel(pricing.monthly)}/month or ${priceLabel(pricing.yearly)}/year. Every install opens with ${pricing.trialDays} days of full Pro access, no card and no account.`],
    ['Category', 'Health & Fitness'],
    ['Founder', 'Austin Spaeth, solo patient-founder. Long hauler of 4+ years, dad of six, South Carolina.'],
    ['Launched', 'July 2026'],
    ['Press contact', email]
  ];

  const quotes = [
    { on: 'On why it exists', text: 'I saw specialist after specialist in cardiology and neurology, and kept leaving with no real answers. So I started tracking everything myself: HRV, blood pressure, sleep, the days I crashed. Slowly the patterns showed up. Autonomic is the tool I built to make sense of my own recovery.' },
    { on: 'On the privacy architecture', text: "Other health apps promise not to sell your data. Autonomic can't. There's no account, no server, and no tracking, so the numbers never leave your phone. For people already anxious about who sees their health data, that's the whole point." },
    { on: 'On no false hope', text: "I'm not healed, and I won't pretend otherwise. The app doesn't promise recovery. It shows you honestly what's helping and what's hurting. That's what I needed, so that's what I built." },
    { on: 'On measurement rigor', text: "A noisy reading should tell you it's noisy, not invent a number. Every metric is graded against published thresholds, out in the open, so a good day and a warning sign don't look the same." },
    { on: 'On who it is for', text: "I'm not a doctor or an expert. I'm someone on this road: four years of long COVID, six kids, figuring out my recovery one reading at a time. I built the app I wished I'd had when I was getting no answers." },
    { on: 'On the business model', text: "It's one person and a subscription, no investor, no data to sell. That's exactly why the app has no reason to touch your data. It's free to use, and there's a hardship path for anyone who needs it." }
  ];

  const boilerplates = [
    { id: 'bp-one', label: 'One-line descriptor', text: "Autonomic is a private, offline app that turns a heart-rate chest strap, or just your phone's camera, into doctor-ready autonomic reports, with no account and no cloud." },
    { id: 'bp-25', label: '25 words', text: 'Autonomic is a private, offline-first app for people recovering from POTS, dysautonomia and long COVID. It scores real physiology against medical thresholds, with no account and no cloud.' },
    { id: 'bp-50', label: '50 words', text: "Autonomic is a private, offline-first recovery journal for POTS, dysautonomia, long COVID and post-viral illness. It captures lab-grade HRV from a chest strap, Apple Watch, or your phone's camera and scores every reading against published medical thresholds, all on-device. No account, no cloud, no tracking. Free to use; Autonomic Pro is $49.99/year." },
    { id: 'bp-100', label: '100 words (About Autonomic)', text: "Autonomic is a private, offline-first app that helps people recovering from POTS, dysautonomia, long COVID and post-viral illness see what's actually helping. It captures beat-to-beat HRV from a Bluetooth chest strap, an Apple Watch, or a finger over the phone's camera, then grades every reading (HRV, blood pressure, sleep, orthostatic stand tests) against published medical thresholds, rolling them into one daily score and a doctor-ready report. Everything runs on the device: there is no account, no cloud, and no backend, so the data can't be lost or sold. Built solo by a patient-founder. Free to use; Autonomic Pro is $49.99/year. autonomic.care" }
  ];

  const faqs = [
    { q: 'What is Autonomic, in one line?', a: 'A private, offline app that scores your daily HRV, blood pressure, sleep and orthostatic readings against published medical thresholds, for people recovering from POTS, dysautonomia and long COVID.' },
    { q: 'Who is it for?', a: 'People living with or recovering from POTS, dysautonomia, long COVID, ME/CFS and other post-viral or autonomic conditions, and anyone trying to see whether their recovery is actually trending the right way.' },
    { q: 'How is it private, exactly?', a: 'There is no account and no backend server. Everything is captured, processed and stored on the device. The app reads from and writes to Apple Health / Health Connect only when you ask it to. Because nothing is transmitted automatically, the developer has no ability to see, lose, or sell user data.' },
    { q: 'Is it a medical device? Does it diagnose anything?', a: 'No. Autonomic is a personal journal and education tool. It does not diagnose, treat, or prevent any disease, and it tells users to discuss any protocol or medication changes with their doctor.' },
    { q: 'How does it measure HRV without a lab?', a: "It captures beat-to-beat RR intervals from a Bluetooth chest strap, an Apple Watch, or the phone's camera (finger over the lens), then computes the standard time- and frequency-domain HRV metrics on-device, with artifact correction. Noisy readings are flagged and won't produce a fake score." },
    { q: 'What makes it different from Welltory, Visible, or a smartwatch?', a: 'Three things: it measures real beat-to-beat data instead of guessing from the wrist; it grades every number against published thresholds instead of a proprietary black-box score; and it has no cloud or hardware subscription, so it works with a strap you buy once and own.' },
    { q: 'What does it cost?', a: `Free to use, with no account. Autonomic Pro is ${priceLabel(pricing.monthly)}/month or ${priceLabel(pricing.yearly)}/year, and every install starts with ${pricing.trialDays} days of full access. There is a hardship path for anyone who can't afford it: email ${email} and Austin will send a free code, no questions asked.` },
    { q: 'Who built it?', a: 'One person. Austin Spaeth, a patient-founder who has lived with long COVID for four-plus years and built the app during his own recovery, after specialists left him without answers. He is a solo developer and a dad of six in South Carolina.' },
    { q: 'What platforms, and when did it launch?', a: 'iOS (with an Apple Watch app) and Android (via Health Connect). Both launched in July 2026.' },
    { q: 'Do you have user data or outcomes to share?', a: 'By design, no. The app collects nothing, so there is no user dataset. The absence of a dataset is itself the story.' },
    { q: 'Can I get a review copy or a walkthrough?', a: `Yes. The app is free to download on both stores, and Austin is happy to give a live walkthrough or answer questions. Contact: ${email}.` }
  ];

  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a }
    }))
  };

  // Copy-to-clipboard for the boilerplate blocks. Inline because csr = false.
  const copyScript = `
    document.querySelectorAll('[data-copy]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var el = document.getElementById(btn.getAttribute('data-copy'));
        if (!el) return;
        navigator.clipboard.writeText(el.innerText.trim()).then(function () {
          var old = btn.textContent;
          btn.textContent = 'Copied';
          btn.classList.add('is-copied');
          setTimeout(function () { btn.textContent = old; btn.classList.remove('is-copied'); }, 1600);
        });
      });
    });
  `;
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={description} />
  <link rel="canonical" href={canonical} />
  <meta property="og:type" content="website" />
  <meta property="og:url" content={canonical} />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:image" content={site.ogImage} />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content={site.ogImage} />
  {@html `<script type="application/ld+json">${JSON.stringify(faqLd)}<\/script>`}
</svelte:head>

<!-- ============ HERO ============ -->
<section class="pk-hero">
  <div class="wrap pk-wrap">
    <p class="eyebrow">Press kit</p>
    <h1 class="pk-h1">Everything you need to write about Autonomic.</h1>
    <p class="pk-lead">
      Autonomic is a private, offline-first app that scores your daily <strong>HRV, blood pressure,
      sleep and orthostatic readings</strong> against published medical thresholds, built for people
      recovering from <strong>POTS, dysautonomia and long COVID</strong>. Facts, copy, quotes and
      assets below are confirmed against the shipping app and free to use.
    </p>
    <div class="pk-actions">
      <a class="btn btn-primary" href="/press/autonomic-press-kit.zip" download>Download all assets (1.2 MB)</a>
      <a class="btn btn-ghost" href="mailto:{email}?subject=Press%20enquiry%20about%20Autonomic">Email {email}</a>
    </div>
    <ul class="pk-chips">
      <li>No account</li>
      <li>No cloud</li>
      <li>No tracking</li>
      <li>iOS + Android, live now</li>
    </ul>
  </div>
</section>

<!-- ============ FACT SHEET ============ -->
<section class="section" id="facts">
  <div class="wrap pk-wrap">
    <h2 class="h2">Fact sheet</h2>
    <dl class="pk-facts">
      {#each facts as [k, v]}
        <div class="pk-fact">
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      {/each}
      <div class="pk-fact">
        <dt>Links</dt>
        <dd>
          <a href={site.url}>autonomic.care</a> ·
          <a href={appStoreUrl}>App Store</a> ·
          <a href={playStoreUrl}>Google Play</a>
        </dd>
      </div>
    </dl>

    <h3 class="pk-h3">What it does</h3>
    <div class="article-prose">
      <ul>
        <li><strong>Lab-grade HRV, on your phone.</strong> Captures beat-to-beat RR intervals live from a Bluetooth chest strap, an Apple Watch, or your phone's camera. Computes SDNN, RMSSD, pNN50, PNS/SNS index, Baevsky stress index, VLF/LF/HF power, LF/HF and coherence, all on-device, with artifact correction. A noisy reading refuses to fake a score.</li>
        <li><strong>Every number graded, no black box.</strong> Each metric is scored great / good / ok / warning / crash against published research thresholds, rolled into one daily Autonomic Score and a plain-language outlook.</li>
        <li><strong>POTS testing on the wrist (iOS).</strong> A guided lie-and-stand test on Apple Watch, a haptic alert when heart rate climbs 30+ bpm over baseline, one-tap episode capture, and a live HR monitor for symptomatic moments.</li>
        <li><strong>A journal that measures.</strong> Water, meals and food triggers, meds and supplements, symptoms, activities, sleep, blood pressure, orthostatic tests and digestion, plus your own custom types.</li>
        <li><strong>Built for the appointment.</strong> Analysis across days, weeks and months, plus optional AI insights and a doctor-ready report.</li>
      </ul>
    </div>
  </div>
</section>

<!-- ============ SCREENSHOTS ============ -->
<section class="section alt" id="screenshots">
  <div class="wrap pk-wrap">
    <h2 class="h2">Screenshots</h2>
    <p class="lead">
      Clean, un-captioned captures at native device resolution, ready to drop straight into an
      article. Click any shot for the full-resolution PNG.
    </p>
    <div class="pk-shots">
      {#each shots as s}
        <figure class="pk-shot">
          <a href="/press/{s.file}.png" download>
            <img src="/press/{s.file}-preview.png" alt={s.label} loading="lazy" />
          </a>
          <figcaption>
            <b>{s.label}</b>
            <span>{s.caption}</span>
            <a class="pk-dl" href="/press/{s.file}.png" download>Download PNG</a>
          </figcaption>
        </figure>
      {/each}
    </div>
  </div>
</section>

<!-- ============ BOILERPLATE ============ -->
<section class="section" id="boilerplate">
  <div class="wrap pk-wrap">
    <h2 class="h2">Boilerplate</h2>
    <p class="lead">Four lengths. Take whichever fits your space; all are factually confirmed.</p>
    {#each boilerplates as b}
      <div class="pk-copyblock">
        <div class="pk-copyhead">
          <span class="pk-copylabel">{b.label}</span>
          <button class="pk-copybtn" type="button" data-copy={b.id}>Copy</button>
        </div>
        <p class="pk-copytext" id={b.id}>{b.text}</p>
      </div>
    {/each}
  </div>
</section>

<!-- ============ FOUNDER ============ -->
<section class="section alt" id="founder">
  <div class="wrap pk-wrap">
    <h2 class="h2">The founder</h2>
    <div class="pk-founder">
      <img class="pk-founder-photo" src="/press/founder-austin-spaeth.jpg" alt="Austin Spaeth, founder of Autonomic" width="340" height="340" loading="lazy" />
      <div class="pk-founder-meta">
        <p class="pk-founder-name">Austin Spaeth</p>
        <p class="pk-founder-role">Founder, Autonomic · patient-founder, long hauler of 4+ years, dad of six, South Carolina</p>
        <a class="pk-dl" href="/press/founder-austin-spaeth.jpg" download>Download photo</a>
      </div>
    </div>

    <h3 class="pk-h3">Short version</h3>
    <div class="article-prose">
      <p>
        Autonomic was built by Austin, a long-COVID patient of more than four years. After specialist
        visits in cardiology and neurology left him with no real answers, he started tracking his own
        physiology, HRV, blood pressure, sleep, the days he crashed, until the patterns surfaced and
        he found what genuinely helped. Autonomic is the app he built from that: a private, on-device
        recovery journal that measures instead of guesses. He is a solo founder, a long hauler, and a
        dad of six in South Carolina.
      </p>
    </div>

    <h3 class="pk-h3">In his words</h3>
    <div class="article-prose">
      <p>
        For more than four years, I've been living with long COVID. It started with blood pressure
        that spiked out of nowhere, a heart that raced the moment I stood up, brain fog that swallowed
        whole days, and a long list of symptoms that never quite fit together. I saw specialist after
        specialist in cardiology, neurology and beyond, and kept leaving with the same thing: no real
        answers.
      </p>
      <p>
        So I started tracking it myself, HRV, blood pressure, heart rate, sleep, what I ate, the days
        I crashed. Slowly, patterns surfaced. I found small things that made life more livable, and I
        got a little better. I'm not healed, and I won't pretend otherwise. But over the two years
        I've used my own early version of Autonomic, I've been able to see what genuinely helps and
        reach a far better place than I'd been in for a long time.
      </p>
      <p>
        I'm not a doctor. I'm not an expert. I'm just someone on this road, in South Carolina, raising
        six kids, figuring out my own recovery one reading at a time. Autonomic is the tool I built to
        make sense of it. If it helps you spot your own patterns, find your own answers, and feel a
        little more in control of your journey too, then it's done exactly what I hoped.
      </p>
    </div>
  </div>
</section>

<!-- ============ QUOTES ============ -->
<section class="section" id="quotes">
  <div class="wrap pk-wrap">
    <h2 class="h2">Quotes, ready to attribute</h2>
    <p class="lead">
      Attribute as <strong>Austin Spaeth, founder of Autonomic</strong>. Quote verbatim or ask for
      something specific.
    </p>
    <div class="pk-quotes">
      {#each quotes as q}
        <figure class="pk-quote">
          <p class="pk-quote-on">{q.on}</p>
          <blockquote>{q.text}</blockquote>
        </figure>
      {/each}
    </div>
  </div>
</section>

<!-- ============ PRIVACY ============ -->
<section class="section alt" id="privacy">
  <div class="wrap pk-wrap">
    <h2 class="h2">Privacy: the architecture, not a policy</h2>
    <p class="lead">
      The claim is literally true and worth checking. There is no server to send anything to.
    </p>
    <div class="pk-diagram">
      <img src="/press/data-flow-diagram.svg" alt="Data-flow diagram showing that all Autonomic data stays on the device, with no server involved" />
    </div>
    <div class="article-prose">
      <ul>
        <li><strong>100% offline-first:</strong> no account, no cloud, no tracking, no ads.</li>
        <li><strong>The app has no backend.</strong> Nothing is transmitted automatically. Everything is stored on the device; the user owns it and can export it anytime.</li>
        <li>Reads HRV, resting heart rate, sleep and blood pressure from Apple Health / Health Connect, and writes back only what the user explicitly logs.</li>
        <li>Because there is no server, <strong>the developer cannot see, lose, or sell user data. There is none to touch.</strong></li>
      </ul>
    </div>
  </div>
</section>

<!-- ============ FAQ ============ -->
<section class="section" id="faq">
  <div class="wrap pk-wrap">
    <h2 class="h2">Press FAQ</h2>
    <div class="faq pk-faq">
      {#each faqs as f}
        <details>
          <summary>{f.q}<span class="fq-i">+</span></summary>
          <p>{f.a}</p>
        </details>
      {/each}
    </div>
  </div>
</section>

<!-- ============ BRAND + CONTACT ============ -->
<section class="section alt" id="brand">
  <div class="wrap pk-wrap">
    <h2 class="h2">Brand assets</h2>
    <div class="pk-brand">
      <a class="pk-brandcard" href="/press/autonomic-logo.svg" download>
        <img src="/press/autonomic-logo.svg" alt="Autonomic logo" />
        <span>Logo (SVG)</span>
      </a>
      <a class="pk-brandcard" href="/press/autonomic-icon.png" download>
        <img class="pk-icon" src="/press/autonomic-icon.png" alt="Autonomic app icon" />
        <span>App icon (PNG)</span>
      </a>
      <a class="pk-brandcard" href="/press/data-flow-diagram.svg" download>
        <img src="/press/data-flow-diagram.svg" alt="Data-flow diagram" />
        <span>Data-flow diagram (SVG)</span>
      </a>
    </div>

    <div class="pk-contact">
      <h3 class="pk-h3">Contact</h3>
      <p class="lead">
        Austin answers press email himself, and is happy to give a live walkthrough.
        <a href="mailto:{email}?subject=Press%20enquiry%20about%20Autonomic">{email}</a>
      </p>
      <p class="pk-note">
        Autonomic is a personal journal and education tool, <strong>not a medical device</strong>. It
        does not diagnose, treat, or prevent any disease, and it never promises recovery.
      </p>
    </div>
  </div>
</section>

{@html `<script>${copyScript}<\/script>`}

<style>
  .pk-hero { position: relative; padding: 64px 0 56px; border-bottom: 1px solid var(--line); background: linear-gradient(180deg, rgba(224, 49, 39, 0.07), transparent 70%); }
  .pk-h1 { font-family: var(--display); font-weight: 600; font-size: clamp(34px, 5vw, 58px); line-height: 1.04; letter-spacing: -0.035em; margin: 0 0 20px; max-width: 18ch; }
  .pk-lead { font-size: clamp(16px, 1.7vw, 19px); color: var(--dim); max-width: 66ch; margin: 0 0 28px; line-height: 1.65; }
  .pk-lead strong { color: var(--text); font-weight: 600; }
  .pk-actions { display: flex; flex-wrap: wrap; gap: 12px; }
  .pk-chips { list-style: none; display: flex; flex-wrap: wrap; gap: 8px 10px; margin: 26px 0 0; padding: 0; }
  .pk-chips li { font-family: var(--mono); font-size: 11.5px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--dim); border: 1px solid var(--line-2); border-radius: 999px; padding: 6px 13px; }

  .pk-wrap { max-width: 900px; }
  .pk-h3 { font-family: var(--display); font-weight: 600; font-size: 22px; letter-spacing: -0.01em; margin: 44px 0 14px; }

  /* fact sheet */
  .pk-facts { margin: 26px 0 0; padding: 0; border-top: 1px solid var(--line); }
  .pk-fact { display: grid; grid-template-columns: 190px 1fr; gap: 20px; padding: 16px 0; border-bottom: 1px solid var(--line); }
  .pk-fact dt { font-family: var(--display); font-weight: 600; font-size: 15px; color: var(--text); }
  .pk-fact dd { margin: 0; font-size: 15.5px; line-height: 1.6; color: var(--dim); }
  .pk-fact dd a { color: var(--accent-2); text-decoration: underline; text-underline-offset: 2px; }
  @media (max-width: 640px) { .pk-fact { grid-template-columns: 1fr; gap: 4px; } }

  /* screenshots */
  .pk-shots { display: grid; grid-template-columns: repeat(3, 1fr); gap: 26px; margin-top: 30px; }
  @media (max-width: 860px) { .pk-shots { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 520px) { .pk-shots { grid-template-columns: 1fr; } }
  .pk-shot { margin: 0; }
  .pk-shot img { width: 100%; height: auto; border-radius: 14px; border: 1px solid var(--line-2); background: #000; }
  .pk-shot figcaption { margin-top: 12px; font-size: 13.5px; line-height: 1.5; color: var(--dim); }
  .pk-shot figcaption b { display: block; color: var(--text); font-weight: 600; font-size: 14.5px; margin-bottom: 3px; }
  .pk-dl { display: inline-block; margin-top: 8px; font-family: var(--mono); font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--accent-2); text-decoration: underline; text-underline-offset: 3px; }

  /* boilerplate */
  .pk-copyblock { border: 1px solid var(--line-2); border-radius: var(--r); background: var(--panel); padding: 18px 20px; margin-top: 16px; }
  .pk-copyhead { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
  .pk-copylabel { font-family: var(--mono); font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--dim-2); }
  .pk-copybtn { font-family: inherit; font-size: 12.5px; font-weight: 600; color: var(--dim); background: var(--panel-2); border: 1px solid var(--line-2); border-radius: 999px; padding: 6px 15px; cursor: pointer; transition: color 0.2s, border-color 0.2s; }
  .pk-copybtn:hover { color: var(--text); border-color: var(--dim-2); }
  .pk-copybtn.is-copied { color: var(--green); border-color: var(--green); }
  .pk-copytext { margin: 0; font-size: 16px; line-height: 1.65; color: var(--text); }

  /* founder */
  .pk-founder { display: flex; align-items: center; gap: 22px; margin-top: 26px; flex-wrap: wrap; }
  .pk-founder-photo { width: 108px; height: 108px; border-radius: 50%; object-fit: cover; border: 2px solid var(--accent-soft); flex: none; }
  .pk-founder-name { font-family: var(--display); font-weight: 600; font-size: 21px; margin: 0 0 4px; }
  .pk-founder-role { margin: 0 0 8px; font-size: 14.5px; color: var(--dim); max-width: 52ch; }

  /* quotes */
  .pk-quotes { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-top: 30px; }
  @media (max-width: 780px) { .pk-quotes { grid-template-columns: 1fr; } }
  .pk-quote { margin: 0; border: 1px solid var(--line); border-radius: var(--r-lg); background: var(--panel); padding: 22px; }
  .pk-quote-on { font-family: var(--mono); font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--accent-2); margin: 0 0 12px; }
  .pk-quote blockquote { margin: 0; padding: 0; border: none; font-style: normal; font-size: 16.5px; line-height: 1.6; color: var(--text); }

  /* privacy diagram */
  .pk-diagram { margin: 28px 0 8px; border: 1px solid var(--line-2); border-radius: var(--r-lg); background: #fff; padding: 22px; overflow-x: auto; }
  .pk-diagram img { width: 100%; max-width: 720px; height: auto; margin: 0 auto; }

  /* brand */
  .pk-brand { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin-top: 28px; }
  @media (max-width: 640px) { .pk-brand { grid-template-columns: 1fr; } }
  .pk-brandcard { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; min-height: 168px; padding: 22px; border: 1px solid var(--line-2); border-radius: var(--r-lg); background: var(--panel); transition: border-color 0.2s; }
  .pk-brandcard:hover { border-color: var(--accent); }
  .pk-brandcard img { max-width: 100%; max-height: 76px; width: auto; }
  .pk-brandcard .pk-icon { border-radius: 18px; }
  .pk-brandcard span { font-family: var(--mono); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--dim); }

  .pk-contact { margin-top: 48px; padding-top: 30px; border-top: 1px solid var(--line); }
  .pk-contact a { color: var(--accent-2); text-decoration: underline; text-underline-offset: 2px; }
  .pk-note { margin: 18px 0 0; font-size: 14px; line-height: 1.6; color: var(--dim-2); max-width: 70ch; }
  .pk-note strong { color: var(--dim); }
</style>
