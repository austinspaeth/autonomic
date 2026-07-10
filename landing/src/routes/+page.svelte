<script lang="ts">
  import { BRAND_POLYLINE } from '$lib/site';

  // The site is prerendered with csr disabled, so no Svelte runtime hydrates.
  // The waitlist forms therefore ship as plain HTML with a native FlowForm POST
  // fallback, progressively enhanced by the inline script below (emitted via
  // {@html waitlistScript} at the end of the page). The script is embedded in
  // the prerendered HTML and runs with no framework JS on the client.
  //  - fetch(no-cors) posts to FlowForm without leaving the page
  //  - on success it swaps the form for the in-place confirmation
  //  - it fires a GA `waitlist_signup` event (location: hero | android)
  const waitlistScript = `<script>
(function () {
  var ENDPOINT = 'https://flowform.to/austin@discoverymark.com';
  function track(location) {
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'waitlist_signup', { location: location });
    }
  }
  function wire(form, location, onDone) {
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var button = form.querySelector('button[type="submit"]');
      var label = button ? button.textContent : '';
      if (button) { button.disabled = true; button.textContent = 'Joining…'; }
      fetch(ENDPOINT, { method: 'POST', mode: 'no-cors', body: new FormData(form) })
        .then(function () { form.reset(); track(location); onDone(); })
        .catch(function () {
          if (button) { button.disabled = false; button.textContent = label; }
          alert('Sorry, something went wrong. Please try again or email austin@discoverymark.com.');
        });
    });
  }
  wire(document.getElementById('heroForm'), 'hero', function () {
    var f = document.getElementById('heroForm');
    var s = document.getElementById('heroSuccess');
    if (f) f.style.display = 'none';
    if (s) s.style.display = 'flex';
  });
  wire(document.getElementById('wlForm'), 'android', function () {
    var s = document.getElementById('wlSuccess');
    if (s) s.classList.add('show');
  });
})();
<\/script>`;

  const softwareLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Autonomic',
    applicationCategory: 'HealthApplication',
    operatingSystem: 'iOS',
    description:
      'A private, offline journal that scores daily autonomic readings, HRV, blood pressure, SpO2, resting heart rate and orthostatic tests, against medical thresholds to track recovery from POTS, dysautonomia and post-illness conditions.',
    offers: {
      '@type': 'Offer',
      price: '50',
      priceCurrency: 'USD',
      description: '$50/year with a 7-day free trial'
    },
    featureList:
      'HRV scoring, blood pressure tracking, orthostatic testing, sleep and symptom logging, trend analysis, clean-day streaks, AI insight reports, offline-first storage'
  };

  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'How much does Autonomic cost?', acceptedAnswer: { '@type': 'Answer', text: 'Every plan starts with a 7-day free trial, then it is $50 per year for full access including AI reports and all future updates. Your data stays private on your device and is never sold. Join the waitlist to lock in founding-member pricing.' } },
      { '@type': 'Question', name: 'Does it work offline?', acceptedAnswer: { '@type': 'Answer', text: 'Completely. Autonomic is a fully offline iOS app. All scoring, trends and reports are computed locally, so it works on a plane, in a clinic basement, or anywhere without signal.' } },
      { '@type': 'Question', name: 'Which conditions is it for?', acceptedAnswer: { '@type': 'Answer', text: 'It is built for people managing POTS, dysautonomia, long COVID and post-viral or post-illness autonomic recovery, where day-to-day HRV, heart rate and orthostatic patterns matter.' } },
      { '@type': 'Question', name: 'Do I need a wearable?', acceptedAnswer: { '@type': 'Answer', text: 'No. You can type readings from any source, a chest strap, a ring, a blood-pressure cuff, or a fingertip pulse oximeter. Autonomic scores whatever you log.' } },
      { '@type': 'Question', name: 'How do the AI insights work?', acceptedAnswer: { '@type': 'Answer', text: 'Autonomic assembles your logged data over a date range into a structured analysis prompt that you copy into Claude, Gemini or ChatGPT. The text is generated locally; nothing is sent automatically.' } }
    ]
  };
</script>

<svelte:head>
  <title>Autonomic | Private HRV, POTS &amp; Dysautonomia Recovery Journal</title>
  <meta
    name="description"
    content="Autonomic is a private, offline journal that scores your daily HRV, blood pressure, sleep and orthostatic readings against medical thresholds, so people recovering from POTS, dysautonomia and post-viral illness can see what's helping and what's hurting."
  />
  <link rel="canonical" href="https://autonomic.care/" />

  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://autonomic.care/" />
  <meta property="og:title" content="Autonomic | See your nervous system recover" />
  <meta property="og:description" content="Medically-scored daily readings, trend analysis, and AI-ready insight reports for autonomic recovery. Private, offline, on-device." />
  <meta property="og:image" content="https://autonomic.care/og.png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:type" content="image/png" />
  <meta property="og:image:alt" content="Autonomic: see your nervous system recover. A private journal that scores your daily HRV, blood pressure, sleep and orthostatic readings." />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="Autonomic | Private autonomic recovery journal" />
  <meta name="twitter:description" content="Score your HRV, BP, sleep & orthostatic data. Spot trends. Generate doctor-ready and AI-ready reports. Offline and private." />
  <meta name="twitter:image" content="https://autonomic.care/og.png" />
  <meta name="twitter:image:alt" content="Autonomic: private, offline autonomic recovery journal for POTS, dysautonomia and long COVID." />

  {@html `<script type="application/ld+json">${JSON.stringify(softwareLd)}<\/script>`}
  {@html `<script type="application/ld+json">${JSON.stringify(faqLd)}<\/script>`}
</svelte:head>

<!-- ============ HERO ============ -->
<section class="hero" id="home">
  <div class="hero-glow" aria-hidden="true"></div>
  <svg class="hero-ecg" viewBox="0 0 1440 200" preserveAspectRatio="none" aria-hidden="true">
    <path class="ecg-path" d="M0 100 H380 l22 -46 22 92 26 -150 26 232 24 -128 18 28 H760 l22 -40 20 80 24 -120 22 150 20 -70 16 20 H1440" fill="none" stroke="currentColor" stroke-width="2" />
  </svg>

  <div class="wrap hero-grid">
    <div class="hero-copy">
      <p class="eyebrow">Private · Offline · On-device</p>
      <h1 class="hero-h1">See your nervous&nbsp;system recover.</h1>
      <p class="hero-lead">Autonomic turns your daily <strong>HRV, blood pressure, sleep and orthostatic</strong> readings into clear, medically-scored signals, so anyone recovering from <strong>POTS, dysautonomia</strong> or post-viral illness can finally see what helps and what hurts.</p>
      <form class="hero-waitlist" id="heroForm" action="https://flowform.to/austin@discoverymark.com" method="POST">
        <input type="hidden" name="_subject" value="Autonomic Waitlist Signup" />
        <input type="email" name="email" required placeholder="you@email.com" aria-label="Email address" />
        <button class="btn btn-primary btn-lg" type="submit">Join the waitlist</button>
      </form>
      <p class="hero-waitlist" role="status" id="heroSuccess" style="display: none; color: var(--green); font-weight: 600;">✓ You're on the list. Check your inbox for your early-access invite.</p>
      <p class="hero-microcopy"><b>7-day free trial</b> at launch, then $50/year. No card to join the list.</p>
      <ul class="hero-trust">
        <li>7-day free trial</li>
        <li>Works offline</li>
        <li>Data never leaves your device</li>
      </ul>
    </div>

    <div class="hero-stage">
      <div class="orbit-chip chip-a"><span class="dot" style="background:var(--sky)"></span>RMSSD 34 <em>great</em></div>
      <div class="orbit-chip chip-b"><span class="dot" style="background:var(--green)"></span>Outlook +12 vs AM</div>
      <div class="orbit-chip chip-c"><span class="dot" style="background:var(--accent)"></span>11-day clean streak</div>

      <div class="phone phone-float">
        <div class="phone-screen">
          <div class="mk-top">
            <div class="mk-brand"><svg viewBox="0 0 512 512" aria-hidden="true"><polyline points={BRAND_POLYLINE} fill="none" stroke="currentColor" stroke-width="44" stroke-linejoin="round" stroke-linecap="round" /></svg><b>Autonomic</b></div>
            <div class="mk-top-ic">☀&#xFE0E; ☰</div>
          </div>
          <div class="mk-datebar"><span>‹</span><span class="mk-date">Today</span><span>›</span></div>
          <div class="mk-daycard" style="background:rgba(22,163,74,.10)">
            <div class="mk-head">
              <span class="mk-mode">Autonomic Outlook</span>
              <span class="mk-chip" style="background:#16a34a">Excellent</span>
            </div>
            <div class="mk-gauge">
              <svg viewBox="0 0 176 176" aria-hidden="true">
                <path d="M35.67 140.33 A74 74 0 1 1 140.33 140.33" fill="none" stroke="#222226" stroke-width="12" stroke-linecap="round" />
                <path d="M35.67 140.33 A74 74 0 1 1 161.77 93.81" fill="none" stroke="#16a34a" stroke-width="19" stroke-linecap="round" opacity="0.16" />
                <path d="M35.67 140.33 A74 74 0 1 1 161.77 93.81" fill="none" stroke="#16a34a" stroke-width="12" stroke-linecap="round" />
              </svg>
              <div class="mk-gauge-in"><div class="mk-num">85</div><div class="mk-den">OUT OF 100</div></div>
            </div>
            <div class="mk-status">Excellent Autonomic Day · 95% confidence</div>
            <div class="mk-guide">Strong autonomic baseline. Good for the full protocol, including intervals and strength.</div>
          </div>
          <div class="mk-row"><span class="mk-ico">♡</span><span class="mk-rt">Resting Heart Rate</span><span class="mk-rv"><i class="dot" style="background:var(--green)"></i>64</span></div>
          <div class="mk-row"><span class="mk-ico">≈</span><span class="mk-rt">Breathing HRV</span><span class="mk-rv"><i class="dot" style="background:var(--sky)"></i>34 RMSSD</span></div>
          <div class="mk-tabbar"><span class="on">Journal</span><span>Analysis</span><span>Milestones</span><span>Insights</span></div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ============ CONDITIONS STRIP ============ -->
<section class="strip" aria-label="Who it is for">
  <div class="wrap strip-row">
    <span class="strip-label">Built for recovery from</span>
    <ul class="strip-tags">
      <li>POTS</li><li>Dysautonomia</li><li>Long COVID</li><li>Post-viral fatigue</li><li>MCAS patterns</li><li>Orthostatic intolerance</li>
    </ul>
  </div>
</section>

<!-- ============ HOW IT WORKS ============ -->
<section class="section" id="how">
  <div class="wrap">
    <div class="section-head">
      <p class="eyebrow">The loop</p>
      <h2 class="h2">Four steps, every day. The rest is automatic.</h2>
      <p class="lead">You log a few readings. Autonomic does the grading, the trends, and the “what changed”, quietly, on your device.</p>
    </div>
    <ol class="loop">
      <li class="loop-step">
        <span class="loop-n">01</span>
        <h3 class="loop-t">Log &amp; Capture</h3>
        <p>Capture live HRV, and log BP, orthostatic tests, sleep, meds, triggers and symptoms from a number of Bluetooth devices and Apple Health.</p>
      </li>
      <li class="loop-step">
        <span class="loop-n">02</span>
        <h3 class="loop-t">Processed &amp; Scored</h3>
        <p>Each reading is broken down into its key metrics, graded against medical thresholds, and rolled into one 0–100 Autonomic Outlook with a confidence level.</p>
      </li>
      <li class="loop-step">
        <span class="loop-n">03</span>
        <h3 class="loop-t">Milestones &amp; Trends</h3>
        <p>Milestones to keep you motivated. Sparklines, zone bands, heat maps and more reveal the patterns moving your recovery up or down.</p>
      </li>
      <li class="loop-step">
        <span class="loop-n">04</span>
        <h3 class="loop-t">Insights &amp; Action</h3>
        <p>Get structured prompts packed with your data to share with your AI provider (ChatGPT, Claude, etc) or doctor, so you can find what's working and what's not.</p>
      </li>
    </ol>
  </div>
</section>

<!-- ============ FEATURE: CAPTURE ============ -->
<section class="section alt" id="capture">
  <div class="wrap feature">
    <div class="feature-copy">
      <p class="eyebrow">Capture</p>
      <h2 class="h2">Everything that moves the needle, in one place.</h2>
      <p class="lead">A guided log built around real autonomic data, not a generic habit tracker. Add a reading and Autonomic knows exactly which fields and thresholds apply.</p>
      <ul class="ticks">
        <li><b>HRV, both ways</b>, quick unstructured reads and full breathing sessions with LF/HF power, RMSSD, pNN50 and baroreflex peak.</li>
        <li><b>Cardio &amp; vitals</b>, blood pressure spread and resting heart rate.</li>
        <li><b>Orthostatic tests</b>, lying-to-standing heart-rate jumps and one-minute recovery, scored for POTS patterns.</li>
        <li><b>Context that explains it</b>, sleep, activity, meds &amp; supplements, food, hydration, symptoms and digestion.</li>
      </ul>
    </div>
    <div class="feature-art">
      <div class="card-mock">
        <div class="cm-head"><span>Add reading</span><span class="cm-x">✕</span></div>
        <div class="cm-list">
          <div class="cm-item"><span class="cm-ic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" /><path d="M3.22 12H9.5l.6-1.3 1.9 4.6 2-7 1.5 3.7h5.27" /></svg></span><div><b>Unstructured HRV</b><small>Quick read · RMSSD · pNN50</small></div></div>
          <div class="cm-item"><span class="cm-ic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.8 19.6A2 2 0 1 0 14 16H2" /><path d="M17.5 8a2.5 2.5 0 1 1 2 4H2" /><path d="M9.8 4.4A2 2 0 1 1 11 8H2" /></svg></span><div><b>Breathing HRV</b><small>Coherence, power spectrum, RMSSD</small></div></div>
          <div class="cm-item"><span class="cm-ic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z" /></svg></span><div><b>Blood Pressure</b><small>Systolic / diastolic / pulse</small></div></div>
          <div class="cm-item"><span class="cm-ic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" /></svg></span><div><b>Resting Heart Rate</b><small>Resting HR · trend</small></div></div>
          <div class="cm-item"><span class="cm-ic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="4" r="1.5" /><path d="m9 20 3-6 3 6" /><path d="m6 9 6 2 6-2" /><path d="M12 11v3" /></svg></span><div><b>Orthostatic Event</b><small>Stand test · HR rise · recovery</small></div></div>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ============ FEATURE: SCORING ============ -->
<section class="section" id="scoring">
  <div class="wrap feature reverse">
    <div class="feature-copy">
      <p class="eyebrow">Scoring</p>
      <h2 class="h2">Every number, graded against medical thresholds.</h2>
      <p class="lead">No more guessing whether a reading is “good.” Each metric lands in a clinical zone, from great to crash, and combines into a single daily Outlook with a confidence score that reflects how much you logged.</p>
      <div class="zone-legend">
        <span class="zl"><i style="background:var(--sky)"></i>Great</span>
        <span class="zl"><i style="background:var(--green)"></i>Good</span>
        <span class="zl"><i style="background:var(--yellow)"></i>OK</span>
        <span class="zl"><i style="background:var(--orange)"></i>Bad</span>
        <span class="zl"><i style="background:var(--red)"></i>Crash</span>
      </div>
      <p class="muted-note">Tap the score and Autonomic breaks down exactly what helped, what hurt, and how to firm up tomorrow’s number.</p>
    </div>
    <div class="feature-art">
      <div class="explain-mock">
        <div class="em-hero">
          <span class="mk-chip" style="background:#16a34a">Excellent</span>
          <div class="em-label">Excellent Autonomic Day</div>
          <div class="em-num">85<small>/ 100</small></div>
          <div class="em-sub">Confidence 95%, the share of the full input set scored today.</div>
        </div>
        <div class="em-group">What helped</div>
        <div class="em-metric"><i class="dot" style="background:var(--sky)"></i><b>HRV (RMSSD)</b><span>Great · 25%</span></div>
        <div class="em-metric"><i class="dot" style="background:var(--green)"></i><b>Total power</b><span>Good · 15%</span></div>
        <div class="em-group">What hurt</div>
        <div class="em-metric"><i class="dot" style="background:var(--orange)"></i><b>VLF power</b><span>Bad · 10%</span></div>
      </div>
    </div>
  </div>
</section>

<!-- ============ FEATURE: ANALYZE ============ -->
<section class="section alt" id="analysis">
  <div class="wrap feature">
    <div class="feature-copy">
      <p class="eyebrow">Analyze</p>
      <h2 class="h2">See what’s helping or hurting, across days, weeks, months.</h2>
      <p class="lead">Switch from a single day to the long view. Zone-banded sparklines show each point in its medical context, with an average baseline so you always know if today beat your own norm.</p>
      <ul class="ticks">
        <li><b>Trend sparklines</b> with grade-zone fills and a current-zone tag.</li>
        <li><b>Heat maps</b> of clean days and recovery across the calendar.</li>
        <li><b>Correlations &amp; intervention impact</b>, which changes actually moved the needle.</li>
      </ul>
    </div>
    <div class="feature-art">
      <div class="card-mock chart-mock">
        <div class="ch-top"><b>Total power</b><span>4,055</span></div>
        <div class="ch-read"><span style="color:var(--green)">Jun 2: 3,451</span><span class="ch-zone" style="background:var(--green);color:#111">Good</span></div>
        <svg class="ch-svg" viewBox="0 0 320 110" preserveAspectRatio="none" aria-hidden="true">
          <line x1="30" y1="28" x2="310" y2="28" stroke="rgba(255,255,255,.08)" />
          <line x1="30" y1="58" x2="310" y2="58" stroke="rgba(255,255,255,.08)" />
          <line x1="30" y1="88" x2="310" y2="88" stroke="rgba(255,255,255,.08)" />
          <line x1="30" y1="48" x2="310" y2="48" stroke="var(--dim)" stroke-dasharray="2 3" opacity="0.6" />
          <defs>
            <linearGradient id="pw" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#38bdf8" /><stop offset="0.5" stop-color="#4ade80" /><stop offset="1" stop-color="#f97316" />
            </linearGradient>
          </defs>
          <path d="M30 86 C70 84 90 70 120 64 C150 58 170 40 210 38 C250 36 280 44 310 40" fill="none" stroke="url(#pw)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
          <circle cx="30" cy="86" r="3" fill="#f97316" /><circle cx="120" cy="64" r="3" fill="#4ade80" /><circle cx="210" cy="38" r="3" fill="#38bdf8" /><circle cx="310" cy="40" r="3.4" fill="#4ade80" />
        </svg>
        <div class="ch-x"><span>May 29</span><span>avg 3,180</span><span>Jun 2</span></div>
      </div>
    </div>
  </div>
</section>

<!-- ============ MARQUEE: AI INSIGHTS ============ -->
<section class="section ai" id="ai">
  <div class="ai-glow" aria-hidden="true"></div>
  <div class="wrap">
    <div class="section-head center">
      <p class="eyebrow">AI insights · doctor-ready</p>
      <h2 class="h2">Bring your own AI in for a deeper read.</h2>
      <p class="lead">Autonomic assembles your data into a rich, structured prompt, then hands it to the model you already trust. Trends, triggers, and a clear “here’s what to tell your doctor,” generated locally and copied in one tap.</p>
    </div>

    <div class="ai-grid">
      <div class="ai-reports">
        <span class="ai-card-tag">Pick a report</span>
        <div class="ai-chips" aria-hidden="true">
          <div class="ai-chip selected"><span class="ai-chip-ic">✦</span>Overall health summary<i class="ai-check">✓</i></div>
          <div class="ai-chip"><span class="ai-chip-ic">↗</span>Recovery trajectory</div>
          <div class="ai-chip"><span class="ai-chip-ic">⚠</span>Trigger analysis</div>
          <div class="ai-chip"><span class="ai-chip-ic">＋</span>What to tell your doctor</div>
          <div class="ai-chip"><span class="ai-chip-ic">☾</span>Sleep impact report</div>
          <div class="ai-chip"><span class="ai-chip-ic">♡</span>Cardiovascular analysis</div>
        </div>
        <div class="ai-llms">
          <span class="ai-llm">Claude</span>
          <span class="ai-llm">Gemini</span>
          <span class="ai-llm">ChatGPT</span>
        </div>
      </div>

      <div class="ai-prompt-cell">
      <div class="ai-prompt">
        <div class="aip-bar"><span class="aip-dot"></span><span class="aip-dot"></span><span class="aip-dot"></span><span class="aip-title">analysis-prompt · Jul 8, 2026</span></div>
        <pre class="aip-body"><span class="c-key">ROLE</span> You are a health analyst reviewing one day of
autonomic recovery data for someone managing POTS.

<span class="c-key">DATA</span> Jul 8, 2026 · 1 day
  HRV · AM     RMSSD 41 · 07:12 · lying, rested
  HRV · PM     RMSSD 29 · 22:40 · before bed
  Orthostatic  +31 bpm · 06:55
               note: "dizzy getting out of bed"
  Blood pres.  118/76 · 62 bpm · 07:20
  Sleep        7.8h · 1 interruption · HR 52–92
  Triggers     pizza (dinner)
  Meds         Quercetin · Pepcid AC · Allegra

<span class="c-key">ASK</span> Give me an overall health summary for this day.
Start with how my autonomic nervous system looked
overall, then explain the drop from my morning to my
evening HRV and whether the pizza or my sleep is the
likelier driver. Note whether the +31 bpm orthostatic
rise and 118/76 reading sit in a healthy range for POTS,
and</pre>
        <div class="aip-foot"><span>Generated on-device</span><button class="aip-copy">Copy prompt</button></div>
      </div>
      </div>
    </div>
  </div>
</section>

<!-- ============ MILESTONES ============ -->
<section class="section" id="milestones">
  <div class="wrap feature reverse">
    <div class="feature-copy">
      <p class="eyebrow">Momentum</p>
      <h2 class="h2">Watch recovery actually add up.</h2>
      <p class="lead">Recovery is slow and easy to miss. Autonomic tracks clean-day streaks and earns you milestones the moment your data crosses a real threshold, so progress beyond the daily number stays visible.</p>
      <ul class="ticks">
        <li><b>Clean-day streaks</b> with tiers that escalate as you hold the line.</li>
        <li><b>88 milestones</b> across HRV, power, POTS, sleep and consistency.</li>
        <li><b>First-ever moments</b> stamped with the value and date you hit them.</li>
      </ul>
    </div>
    <div class="feature-art">
      <div class="card-mock ms-mock">
        <div class="ms-track"><b>Milestone tracker</b><span>32 of 88 achieved</span><div class="ms-bar"><i style="width:36%"></i></div></div>
        <div class="ms-row done"><span class="ms-check">✓</span>First RMSSD 30+ (baseline recovery)<em>May 30</em></div>
        <div class="ms-row done"><span class="ms-check">✓</span>3 consecutive days RMSSD 30+<em>Jun 2</em></div>
        <div class="ms-row"><span class="ms-check off">○</span>First RMSSD 35+ (pre-illness)<em></em></div>
        <div class="ms-row"><span class="ms-check off">○</span>7-day clean streak<em></em></div>
      </div>
    </div>
  </div>
</section>

<!-- ============ PRIVACY ============ -->
<section class="section privacy" id="privacy">
  <div class="wrap privacy-box">
    <div class="lock" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10.5" width="16" height="10.5" rx="2.2" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" /><circle cx="12" cy="15.5" r="1.4" /></svg>
    </div>
    <p class="eyebrow">Privacy by architecture</p>
    <h2 class="h2">Your most sensitive data never leaves your phone.</h2>
    <p class="lead">No account. No cloud. No analytics. Autonomic stores everything in local storage on your device, computes every score and report offline, and gives you a one-tap JSON export you fully control. It can even back up automatically to your own iCloud, so your data stays with you, not us. Privacy isn’t a setting here, it’s how the app is built.</p>
    <div class="privacy-pills">
      <span>100% on-device</span><span>No sign-up</span><span>No tracking</span><span>iCloud backup</span><span>Export anytime</span>
    </div>
  </div>
</section>

<!-- ============ EVERYTHING ELSE GRID ============ -->
<section class="section alt" id="everything">
  <div class="wrap">
    <div class="section-head">
      <p class="eyebrow">Depth, on tap</p>
      <h2 class="h2">A clinician’s worth of detail, only when you want it.</h2>
      <p class="lead">The surface stays calm. Underneath sits the instrumentation serious recovery needs.</p>
    </div>
    <div class="grid-cards">
      <div class="gc"><span class="gc-ic">≈</span><h3>Breathing HRV deep-dive</h3><p>Coherence %, LF/HF/VLF power bar, RMSSD, pNN50 and baroreflex peak.</p></div>
      <div class="gc"><span class="gc-ic">⇡</span><h3>Orthostatic / POTS</h3><p>Side-by-side stand-test stats and extreme-event flags.</p></div>
      <div class="gc"><span class="gc-ic">◔</span><h3>BP spread bars</h3><p>Systolic and diastolic visualized against healthy ranges.</p></div>
      <div class="gc"><span class="gc-ic">☾</span><h3>Sleep impact</h3><p>How last night’s sleep bends today’s autonomic score.</p></div>
    </div>
  </div>
</section>

<!-- ============ FAQ ============ -->
<section class="section" id="faq">
  <div class="wrap faq-wrap">
    <div class="section-head">
      <p class="eyebrow">Questions</p>
      <h2 class="h2">Good to know.</h2>
    </div>
    <div class="faq">
      <details><summary>How much does it cost, and is my data private?<span class="fq-i">+</span></summary><p>Every plan starts with a 7-day free trial, then it’s a simple $50/year for everything, all reading types, scoring, analysis and AI reports, plus future updates. Your data is always private: stored on your device, never sold, never sent to a server. Waitlist members lock in founding-member pricing.</p></details>
      <details><summary>Does it really work offline?<span class="fq-i">+</span></summary><p>Completely. It’s a fully offline iOS app. Scoring, trends and reports are computed locally, so it works anywhere, no signal required.</p></details>
      <details><summary>Which conditions is it built for?<span class="fq-i">+</span></summary><p>POTS, dysautonomia, long COVID and post-viral or post-illness recovery, anywhere daily HRV, heart-rate and orthostatic patterns matter.</p></details>
      <details><summary>Is Autonomic available on Android?<span class="fq-i">+</span></summary><p>Not yet. Autonomic is iOS-only for now. An Android version is coming soon, join the waitlist and we’ll let you know the moment it lands.</p></details>
      <details><summary>Do I need a wearable or special hardware?<span class="fq-i">+</span></summary><p>No, you don’t. You can type readings in by hand from any source. That said, tools like a Polar H10 chest strap, an Apple Watch or a blood pressure cuff make Autonomic far more powerful, the more data you feed it, the better you understand how your body is doing.</p></details>
      <details><summary>How do the AI insights work?<span class="fq-i">+</span></summary><p>Autonomic builds a structured analysis prompt from your data over a date range. You copy it into Claude, Gemini or ChatGPT, the text is generated on-device, nothing is sent automatically.</p></details>
      <details><summary>Is this medical advice?<span class="fq-i">+</span></summary><p>No. Autonomic is a personal tracking and reflection tool. It helps you organize data and conversations, but it doesn’t diagnose or treat. Always work with your clinician.</p></details>
    </div>
  </div>
</section>

<!-- ============ WAITLIST + PRICING ============ -->
<section class="cta" id="waitlist">
  <div class="cta-glow" aria-hidden="true"></div>
  <div class="wrap">
    <div class="section-head center" style="margin-bottom: 38px;">
      <svg class="cta-mark" viewBox="0 0 512 512" aria-hidden="true" style="margin-bottom:22px"><polyline points={BRAND_POLYLINE} fill="none" stroke="currentColor" stroke-width="38" stroke-linejoin="round" stroke-linecap="round" /></svg>
      <p class="eyebrow">Join the waitlist</p>
      <h2 class="cta-h">Be first to read your recovery clearly.</h2>
      <p class="cta-sub">Autonomic is available now on the Apple App Store, with Android coming soon. Join the waitlist to be first to get the Android release and to lock in founding-member pricing.</p>
    </div>

    <div class="dl-ios">
      <div class="dl-ios-copy">
        <h3 class="dl-ios-h">Download for iOS now</h3>
        <p class="dl-ios-p">Autonomic is live on iPhone. Get it from the App Store today.</p>
      </div>
      <a class="dl-ios-badge" href="#" aria-label="Download on the App Store">
        <svg viewBox="0 0 120 40" role="img" aria-label="Download on the App Store" xmlns="http://www.w3.org/2000/svg">
          <rect x="0.5" y="0.5" width="119" height="39" rx="6.5" fill="#000" stroke="rgba(255,255,255,0.4)" />
          <path transform="translate(10,7.5) scale(0.05)" fill="#fff" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5c0 26.2 4.8 53.3 14.4 81.2 12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 20-27.8 44.7-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
          <text x="35" y="16" fill="#fff" font-family="-apple-system, Helvetica, Arial, sans-serif" font-size="7.5">Download on the</text>
          <text x="34" y="31" fill="#fff" font-family="-apple-system, Helvetica, Arial, sans-serif" font-size="16" font-weight="600" letter-spacing="-0.3">App Store</text>
        </svg>
      </a>
    </div>

    <div class="waitlist-grid">
      <div class="wl-form">
        <div class="wl-head">
          <svg class="wl-android" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#3DDC84" d="M6 11a6 6 0 0 1 12 0H6z" />
            <line x1="8" y1="4.4" x2="9.4" y2="6.5" stroke="#3DDC84" stroke-width="1.1" stroke-linecap="round" />
            <line x1="16" y1="4.4" x2="14.6" y2="6.5" stroke="#3DDC84" stroke-width="1.1" stroke-linecap="round" />
            <circle cx="9.6" cy="8.6" r="0.85" fill="#fff" />
            <circle cx="14.4" cy="8.6" r="0.85" fill="#fff" />
          </svg>
          <span>Android Waitlist</span>
        </div>
        <div class="wl-success" id="wlSuccess">
          <div class="wl-check" aria-hidden="true">✓</div>
          <h3 style="font-family: var(--display); font-size: 22px; margin: 0 0 8px;">You're on the list.</h3>
          <p style="color: var(--dim); margin: 0; font-size: 15px;">We'll email your early-access invite and founding-member link. Welcome aboard.</p>
        </div>
        <form id="wlForm" class="wl-fields" action="https://flowform.to/austin@discoverymark.com" method="POST">
          <input type="hidden" name="_subject" value="Autonomic Waitlist Signup" />
          <div class="wl-field">
            <label for="wl-email">Email</label>
            <input id="wl-email" type="email" name="email" required placeholder="you@email.com" />
          </div>
          <div class="wl-field">
            <label for="wl-name">Name <span style="color:var(--dim-2)">(optional)</span></label>
            <input id="wl-name" type="text" name="name" placeholder="First name" />
          </div>
          <div class="wl-field">
            <label for="wl-cond">What are you managing?</label>
            <select id="wl-cond" name="condition">
              <option value="">Select one…</option>
              <option>POTS</option>
              <option>Dysautonomia</option>
              <option>Long COVID</option>
              <option>Post-viral fatigue</option>
              <option>MCAS</option>
              <option>Other / prefer not to say</option>
            </select>
          </div>
          <div class="wl-field">
            <label for="wl-tracks">What do you track today? <span style="color:var(--dim-2)">(optional)</span></label>
            <input id="wl-tracks" type="text" name="tracks" placeholder="e.g. HRV ring, BP cuff, symptom notes" />
          </div>
          <button class="btn btn-primary btn-lg" type="submit">Join the Android waitlist</button>
          <p class="wl-note">No charge today · 7-day free trial at launch · Unsubscribe anytime</p>
        </form>
      </div>

      <aside class="pricing">
        <p class="pricing-tag">Founding-member pricing</p>
        <div class="pricing-price"><span class="amt">$50</span><span class="per">/ year</span></div>
        <p class="pricing-trial">Starts with a <b>7-day free trial</b></p>
        <ul class="pricing-list">
          <li>Full access, every reading type, score and report</li>
          <li>Unlimited AI insight &amp; doctor-ready reports</li>
          <li>All future updates included, no add-ons</li>
          <li>Private &amp; offline forever, no ads, no data sale</li>
          <li>Waitlist members lock in this launch price for life</li>
        </ul>
      </aside>
    </div>
  </div>
</section>

{@html waitlistScript}
