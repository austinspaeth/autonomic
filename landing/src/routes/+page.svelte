<script lang="ts">
  import { BRAND_POLYLINE, APP_MARK_PATH, pricing, priceLabel, yearlySavePct, appStoreUrl, playStoreUrl, appStoreLink, playStoreLink } from '$lib/site';
  import BrandMark from '$lib/BrandMark.svelte';
  import { demoReports as reports } from '$lib/demoPrompts';

  const monthly = priceLabel(pricing.monthly);
  const yearly = priceLabel(pricing.yearly);

  // The #pricing comparison, mirroring the app's own "What's free vs Pro" sheet
  // (mobile/src/features/Paywall.tsx — SHARED_ROWS / PRO_ROWS). Keep the two in
  // step: the page promises exactly what the paywall shows.
  const sharedRows: string[] = [
    'Daily journal: sleep, meds, symptoms, triggers, hydration',
    'Manual readings: BP, resting heart rate, episodes',
    'Daily autonomic score & outlook',
    'Apple Watch heart-rate monitor',
    'Backups & data export'
  ];
  const proRows: { label: string; free?: string; pro?: string }[] = [
    { label: 'Live HRV capture', free: '1 / day', pro: 'Unlimited' },
    { label: 'Progress charts', free: '14 days', pro: 'All views' },
    { label: 'Full historical metric analysis' },
    { label: 'POTS testing & episode tracking' },
    { label: 'AI insights & doctor reports' }
  ];
  const CHECK =
    '<svg class="pr-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>';

  // ── Apple Watch section ────────────────────────────────────────────────
  // The device face replicates the real watchOS app (mobile/targets/watch):
  // the same stages, copy, colours and glyphs. Keep the two in step — the
  // section is a claim about what the watch app actually does.

  // Glyphs are the app's own icons, path data ported from
  // mobile/src/components/Icon.tsx. The watch home renders heart / standing /
  // stairs (the standing figure also ships as the watch's `potsIcon` asset).
  const WA_ICONS: Record<string, { d: string[]; extra?: string; fill?: boolean }> = {
    heart: {
      d: ['M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z'],
      fill: true
    },
    standing: { d: ['m9 20 3-6 3 6', 'm6 9 6 2 6-2', 'M12 11v3'], extra: '<circle cx="12" cy="4" r="1.5" />' },
    stairs: {
      d: ['M11 6v4', 'M8 8l3-1 3 1.5', 'M11 10l-2.5 4', 'M11 10l3-1 1.5 4', 'M3 20h4v-3h4v-3h4v-3h4'],
      extra: '<circle cx="11" cy="4" r="1.6" />'
    },
    arrowUp: { d: ['M12 19V5', 'm5 12 7-7 7 7'] },
    chevronRight: { d: ['m9 18 6-6-6-6'] },
    chevronLeft: { d: ['m15 18-6-6 6-6'] },
    // Page affordances rather than app glyphs: the "tap here" pointer under the
    // device, and the restart arrow.
    pointer: { d: ['M9 9l5 12 1.8-5.2L21 14Z', 'M7.2 2.2 8 5.1', 'm5.1 7.2-2.9-.8', 'M14 4.1 12 6', 'm6 12-1.9 2'] },
    restart: { d: ['M3 12a9 9 0 1 0 3-6.7L3 8', 'M3 3v5h5'] },
    check: { d: ['M20 6 9 17l-5-5'], extra: '<circle cx="12" cy="12" r="10" />' }
  };
  const waIcon = (name: string, sw = 1.9) => {
    const ic = WA_ICONS[name];
    const paths = ic.d.map((d) => `<path d="${d}" />`).join('');
    return `<svg viewBox="0 0 24 24" fill="${ic.fill ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}${ic.extra ?? ''}</svg>`;
  };

  // The three modes, in the watch home screen's own order. `sub` is the
  // subtitle the watch itself shows; `blurb` is the page's longer read.
  // Tints are DS.accent / DS.blue / DS.purple from DesignSystem.swift.
  const waModes = [
    {
      face: 'hr-main',
      mode: 'hr',
      icon: 'heart',
      tint: '#e03127',
      soft: 'rgba(224,49,39,0.12)',
      title: 'HR Monitor',
      sub: 'Persistent heart rate',
      blurb: 'Always-on heart rate with a rolling 2-minute delta, and a buzz on your wrist when you spike. Free, forever.'
    },
    {
      face: 'test-intro',
      mode: 'test',
      icon: 'standing',
      tint: '#4aa3f0',
      soft: 'rgba(74,163,240,0.12)',
      title: 'POTS Test',
      sub: 'Lie and stand test',
      blurb: 'The guided lie-and-stand test: five minutes resting, ten standing, scored on your wrist.'
    },
    {
      face: 'ep-picker',
      mode: 'episode',
      icon: 'stairs',
      tint: '#9d6bf5',
      soft: 'rgba(157,107,245,0.12)',
      title: 'POTS Episode',
      sub: 'Stairs or other events',
      blurb: 'Catch a real-life flare as it happens: heart rate before, during, and one minute after.'
    }
  ];

  // The event picker (OrthostaticController.EventType) — ids and titles verbatim.
  const waEvents = [
    { id: 'stairs', title: 'Stairs' },
    { id: 'sitToStand', title: 'Sit to stand' },
    { id: 'layToStand', title: 'Lay to stand' }
  ];

  // The head of the phone's symptom registry (SYMPTOM_TYPES), which the watch
  // mirrors over applicationContext and lists in full.
  const waSymptoms = [
    'Adrenaline surge', 'Anxiety', 'Bloating', 'Blood pooling', 'Blurred vision',
    'Brain fog', 'Chest pain / tightness', 'Chills', 'Coat hanger pain', 'Cold hands / feet'
  ];

  // The watch demo's behaviour. The site ships with no framework runtime, so
  // this rides along as a plain inline script in
  // the prerendered HTML (emitted via {@html watchScript} at the foot of the
  // page). It runs the same state machines the watch does — StandTestController
  // (intro → resting → prompt → standing → complete) and OrthostaticController
  // (picker → intro → before → during → recovery → complete) — with each
  // stage's clock compressed into a few seconds of wall time. The countdown
  // still counts the app's real duration down, so the numbers on the face are
  // the app's, not the demo's.
  const watchScript = `<script>
(function () {
  'use strict';
  var section = document.getElementById('watch');
  var screenEl = document.getElementById('waScreen');
  if (!section || !screenEl) return;

  var faces = {};
  screenEl.querySelectorAll('.wa-face').forEach(function (f) { faces[f.getAttribute('data-wa-face')] = f; });
  var modeBtns = section.querySelectorAll('.wa-mode[data-wa-mode]');

  // real: the duration the app actually runs, and the number the ring counts
  // down (StandTestController.restingDuration / .standingDuration,
  // OrthostaticController.recoveryDuration). demo: how long that takes here.
  var STAGE = {
    'test-resting':  { real: 300, demo: 9000,  next: 'test-prompt' },
    'test-standing': { real: 600, demo: 13000, next: 'test-results' },
    'ep-recovery':   { real: 60,  demo: 7000,  next: 'ep-results' }
  };
  // OrthostaticController.EventType copy, verbatim.
  var EVENTS = {
    stairs:     { during: 'Climbing stairs', start: 'Start climbing',   done: 'Done climbing' },
    sitToStand: { during: 'Standing up',     start: 'Start getting up', done: 'I\\u2019m upright' },
    layToStand: { during: 'Standing up',     start: 'Start getting up', done: 'I\\u2019m upright' }
  };
  // DS.deltaColor: <20 green, 20-29 amber, >=30 accent. [text, fill, border]
  var GREEN = ['#3ec46d', 'rgba(62,196,109,0.12)', 'rgba(62,196,109,0.33)'];
  var AMBER = ['#e0a030', 'rgba(224,160,48,0.12)', 'rgba(224,160,48,0.33)'];
  var RED   = ['#e03127', 'rgba(224,49,39,0.12)',  'rgba(224,49,39,0.33)'];
  var NONE  = ['#8a8a92', 'rgba(138,138,146,0.12)', 'rgba(138,138,146,0.33)'];
  function deltaC(d) { return d >= 30 ? RED : d >= 20 ? AMBER : GREEN; }

  var RING = 326.73;                     // 2πr, r = 52
  var FAINT = 'rgba(255,255,255,0.3)';   // DS.faint - held-but-stale
  var DIM = '#8a8a92';                   // DS.dim

  var face = 'home', epPhase = 'before', epEvent = 'stairs';
  var t0 = 0, sim = {}, ticker = null, visible = true;

  function now() { return Date.now(); }
  function wob(n) { return (Math.random() - 0.5) * 2 * n; }
  function fmt(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function q(f, sel) { return faces[f] ? faces[f].querySelector(sel) : null; }

  // BeatingHeart: one contraction per cardiac cycle, bucketed to the nearest
  // 5 bpm so the animation only restarts on a real rate change, and clamped
  // the way the Swift does (halfCycle 0.16-0.9s).
  function setBeat(el, bpm) {
    var b = Math.round(bpm / 5) * 5;
    if (el.getAttribute('data-b') === String(b)) return;
    el.setAttribute('data-b', String(b));
    el.style.animationDuration = Math.max(0.32, Math.min(1.8, 60 / Math.max(30, b))) + 's';
  }

  function resetSim(name) {
    if (name === 'home') { sim = {}; return; }
    var kind = name.indexOf('test-') === 0 ? 'test' : name.indexOf('ep-') === 0 ? 'ep' : name.indexOf('hr-') === 0 ? 'hr' : '';
    if (!kind || sim.kind === kind) return;
    if (kind === 'test') sim = { kind: 'test', base: 64, hr: 64, peak: 0, delta: 0 };
    else if (kind === 'ep') sim = { kind: 'ep', base: 70, hr: 70 };
    else sim = { kind: 'hr', hr: 72, avg: 71, hrShown: 72 };
  }

  function applyEvent() {
    var e = EVENTS[epEvent] || EVENTS.stairs;
    var during = epPhase === 'during';
    var lbl = q('ep-measure', '[data-wa-ep-lbl]');
    var sub = q('ep-measure', '[data-wa-ep-sub]');
    var btn = q('ep-measure', '[data-wa-ep-btn]');
    if (lbl) lbl.textContent = during ? 'During' : 'Before';
    if (sub) sub.textContent = during ? e.during : 'Capturing resting HR';
    if (btn) btn.textContent = during ? e.done : e.start;
  }

  function setRes(f, key, text) { var n = q(f, '[data-wa-res="' + key + '"]'); if (n) n.textContent = text; }

  function fillTest() {
    var base = sim.base || 64;
    var peak = Math.max(sim.peak || base, base);
    var sust = Math.round(sim.delta || 0);
    setRes('test-results', 'rest', base + ' bpm');
    setRes('test-results', 'peak', Math.round(peak) + ' bpm');
    setRes('test-results', 'sustained', 'Δ ' + (sust >= 0 ? '+' : '') + sust + ' bpm');
    setRes('test-results', 'max', 'Δ +' + Math.round(peak - base) + ' bpm');
    // ResultsView tints the sustained-rise row by the same delta rule.
    var c = deltaC(sust);
    var row = q('test-results', '[data-wa-res-row="sustained"]');
    var val = q('test-results', '[data-wa-res="sustained"]');
    var key = row ? row.querySelector('.k') : null;
    if (row) row.style.background = c[1];
    if (val) val.style.color = c[0];
    if (key) key.style.color = c[0];
  }

  function fillEpisode() {
    var base = sim.base || 70;
    sim.rec = sim.hr;
    setRes('ep-results', 'epBefore', Math.round(sim.before || base) + ' bpm');
    setRes('ep-results', 'epAfter', Math.round(sim.after || base) + ' bpm');
    setRes('ep-results', 'epRecovery', Math.round(sim.rec || base) + ' bpm');
  }

  // A real sensor reports about once a second, so a readout must not re-roll on
  // every 150ms tick. Holds each value for a varied interval (default 1-2s) so
  // it never looks metronomic.
  function sampled(compute, lo, hi) {
    var tNow = now();
    if (!sim.nextHrAt || tNow >= sim.nextHrAt) {
      sim.hrShown = compute();
      lo = lo || 1000; hi = hi || 2000;
      sim.nextHrAt = tNow + lo + Math.random() * (hi - lo);
    }
    return sim.hrShown;
  }

  function epNext() {
    // OrthostaticController: the baseline is the MEAN HR over the before stage,
    // not the last sample; afterHr is the HR the moment the transition ends.
    if (epPhase === 'before') {
      sim.before = sim.base;
      epPhase = 'during';
      t0 = now();
      sim.nextHrAt = 0;   // resample at once so the climb starts on the tap
      applyEvent();
    } else { sim.after = sim.hr; go('ep-recovery'); }
  }

  function ensure() {
    var needs = visible && (face === 'test-resting' || face === 'test-standing' ||
      face === 'ep-measure' || face === 'ep-recovery' || face === 'hr-main');
    if (needs && !ticker) ticker = setInterval(step, 150);
    else if (!needs && ticker) { clearInterval(ticker); ticker = null; }
  }

  function go(name) {
    if (!faces[name]) return;
    resetSim(name);
    face = name;
    t0 = now();
    for (var k in faces) faces[k].classList.toggle('on', k === name);
    faces[name].scrollTop = 0;
    var mode = name.indexOf('test-') === 0 ? 'test' : name.indexOf('ep-') === 0 ? 'episode' : name.indexOf('hr-') === 0 ? 'hr' : '';
    modeBtns.forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-wa-mode') === mode); });
    // The workout session spans a whole flow, so the sensor's first reading is
    // only awaited once — swiping between the HR pages or moving resting →
    // standing must not send the readout back to a grey "00".
    if (name === 'test-resting' || name === 'ep-measure' || name === 'hr-main') {
      if (!sim.since) sim.since = now();
    }
    if (name === 'ep-measure') { epPhase = 'before'; applyEvent(); }
    if (name === 'test-results') fillTest();
    if (name === 'ep-results') fillEpisode();
    ensure();
    step();
  }

  function step() {
    var el = faces[face];
    if (!el) return;
    var ms = now() - t0;
    var st = STAGE[face];
    var t = st ? Math.min(1, ms / st.demo) : 0;
    // HrReadout: a grey "00" until the session's first reading lands.
    var live = !!sim.since && now() - sim.since > 1400;
    var hr = null, delta = null;

    if (face === 'test-resting') {
      hr = sim.base + wob(2);
    } else if (face === 'test-standing') {
      // An orthostatic rise lands within the first minute of standing, then holds.
      hr = sim.base + 34 * Math.min(1, t * 4) + wob(2.5);
      delta = hr - sim.base;
      if (live) { sim.peak = Math.max(sim.peak, hr); sim.delta = delta; }
    } else if (face === 'ep-measure') {
      if (epPhase === 'before') {
        hr = sampled(function () { return sim.base + wob(2); });
      } else {
        // Climbing. Samples land ~1s apart and each steps up a handful of bpm,
        // the way a real rise reads on the wrist. The rate is deliberately
        // gentler than the hold is long — otherwise a 2s hold against a fast
        // climb makes the number teleport by 30.
        hr = sampled(function () {
          return Math.min(sim.base + 48, sim.base + (ms / 1000) * 11) + wob(2);
        }, 800, 1200);
        // The controller only publishes a delta from the "during" stage onward
        // — there's no baseline to compare against until before is captured.
        delta = hr - sim.base;
      }
    } else if (face === 'ep-recovery') {
      var from = sim.after || sim.base + 48;
      hr = from - (from - (sim.base + 18)) * t + wob(2);
      delta = hr - sim.base;
    } else if (face === 'hr-main') {
      // Drift a couple of bpm per sample rather than teleporting — a resting
      // HR wanders, it doesn't jump.
      hr = sampled(function () {
        return Math.max(64, Math.min(82, (sim.hrShown || 72) + wob(2.5)));
      });
      delta = hr - sim.avg;
    }
    if (hr != null) sim.hr = hr;

    el.querySelectorAll('[data-wa-hr]').forEach(function (n) {
      n.textContent = live && hr != null ? String(Math.round(hr)) : '00';
      // RestingView reads out in DS.dim; every other face uses .primary.
      n.style.color = !live || hr == null ? FAINT : (n.getAttribute('data-wa-hr') === 'dim' ? DIM : '#fff');
    });
    el.querySelectorAll('.wa-heart').forEach(function (n) { setBeat(n, live && hr != null ? hr : 60); });

    var chip = el.querySelector('[data-wa-delta]');
    if (chip) {
      // BEFORE has no baseline yet. The app parks a dim "Δ 00" placeholder
      // there; on the page it reads as broken, so hide it until it means
      // something.
      var noBaseline = face === 'ep-measure' && epPhase === 'before';
      chip.style.display = noBaseline ? 'none' : '';
      var c = !live || delta == null ? NONE : deltaC(delta);
      chip.textContent = !live || delta == null ? 'Δ 00' : 'Δ ' + (delta >= 0 ? '+' : '') + Math.round(delta);
      chip.style.color = c[0];
      chip.style.background = c[1];
      chip.style.borderColor = c[2];
    }
    var tile = el.querySelector('[data-wa-delta-tile]');
    if (tile) {
      tile.textContent = !live || delta == null ? 'Δ 00' : 'Δ ' + (delta >= 0 ? '+' : '') + Math.round(delta);
      tile.style.color = !live || delta == null ? FAINT : deltaC(delta)[0];
    }
    var avg = el.querySelector('[data-wa-avg]');
    if (avg) {
      avg.textContent = live ? String(Math.round(sim.avg)) : '00';
      avg.style.color = live ? '#fff' : FAINT;
    }

    if (st) {
      var ring = el.querySelector('[data-wa-ring]');
      if (ring) ring.style.strokeDashoffset = String(RING * (1 - Math.max(0.004, t)));
      var cd = el.querySelector('[data-wa-count]');
      if (cd) cd.textContent = fmt(st.real * (1 - t));
      if (t >= 1) go(st.next);
    }
  }

  function logSymptom(el) {
    if (el.classList.contains('done')) return;
    var prev = el.textContent;
    el.classList.add('done');
    el.textContent = prev + ' ✓';
    setTimeout(function () { el.classList.remove('done'); el.textContent = prev; go('hr-main'); }, 700);
  }

  section.addEventListener('click', function (ev) {
    var el = ev.target.closest ? ev.target.closest('[data-wa-go],[data-wa-act],[data-wa-log]') : null;
    if (!el) return;
    var evt = el.getAttribute('data-wa-event');
    if (evt) epEvent = evt;
    var log = el.getAttribute('data-wa-log');
    if (log) { logSymptom(el); return; }
    if (el.getAttribute('data-wa-act') === 'ep-next') { epNext(); return; }
    var to = el.getAttribute('data-wa-go');
    if (to) go(to);
  });

  // Don't burn a timer on a watch nobody's looking at.
  if (window.IntersectionObserver) {
    new IntersectionObserver(function (es) { visible = es[0].isIntersecting; ensure(); }, { threshold: 0 }).observe(section);
  }
  go('home');
})();
<\/script>`;

  const softwareLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Autonomic',
    applicationCategory: 'HealthApplication',
    operatingSystem: 'iOS, Android',
    downloadUrl: [appStoreUrl, playStoreUrl],
    installUrl: [appStoreUrl, playStoreUrl],
    description:
      'A private, offline journal that scores daily autonomic readings, HRV, blood pressure, SpO2, resting heart rate and orthostatic tests, against medical thresholds to track recovery from POTS, dysautonomia and post-illness conditions.',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: pricing.currency,
      description: `Free to download; the journal is free forever. Autonomic Pro is ${monthly}/month or ${yearly}/year and unlocks unlimited HRV captures, full history, POTS testing and AI reports. Every install starts with ${pricing.trialDays} days of Pro.`
    },
    featureList:
      'HRV scoring, blood pressure tracking, orthostatic testing, sleep and symptom logging, trend analysis, clean-day streaks, AI insight reports, offline-first storage'
  };

  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'How much does Autonomic cost?', acceptedAnswer: { '@type': 'Answer', text: `Autonomic is free to download and the journal is free forever, with no account and no ads. Autonomic Pro is ${monthly} per month or ${yearly} per year and unlocks unlimited HRV captures, your full history, POTS testing and AI reports. Every install opens with ${pricing.trialDays} days of Pro so you can try it before paying. Your data stays private on your device and is never sold.` } },
      { '@type': 'Question', name: 'What is free and what needs Pro?', acceptedAnswer: { '@type': 'Answer', text: 'Free covers the daily journal (sleep, meds, symptoms, triggers, hydration), manual readings like blood pressure and resting heart rate, your daily autonomic score and outlook, the Apple Watch heart-rate monitor, backups and export, plus one live HRV capture a day and 14 days of progress charts. Pro adds unlimited live HRV capture, all progress views, full historical metric analysis, POTS testing and episode tracking, and AI insight and doctor reports.' } },
      { '@type': 'Question', name: 'Does it work offline?', acceptedAnswer: { '@type': 'Answer', text: 'Completely. Autonomic is a fully offline app for iOS and Android. All scoring, trends and reports are computed locally, so it works on a plane, in a clinic basement, or anywhere without signal.' } },
      { '@type': 'Question', name: 'Which conditions is it for?', acceptedAnswer: { '@type': 'Answer', text: 'It is built for people managing POTS, dysautonomia, long COVID and post-viral or post-illness autonomic recovery, where day-to-day HRV, heart rate and orthostatic patterns matter.' } },
      { '@type': 'Question', name: 'Do I need a wearable?', acceptedAnswer: { '@type': 'Answer', text: 'No. You can type readings from any source, a chest strap, a ring, a blood-pressure cuff, or a fingertip pulse oximeter. Autonomic scores whatever you log.' } },
      { '@type': 'Question', name: 'How do the AI insights work?', acceptedAnswer: { '@type': 'Answer', text: 'Autonomic assembles your logged data over a date range into a structured analysis prompt that you copy into Claude, Gemini or ChatGPT. The text is generated locally; nothing is sent automatically.' } }
    ]
  };

  // The AI-report picker. Each report is the REAL prompt the Autonomic app
  // builds, run over a fabricated week of sample data (see src/lib/demoPrompts.ts).
  // The prompt rides on the chip as a data-prompt attribute (Svelte escapes it);
  // the site script in app.html swaps it into the mock on click.

  // Accent the prompt's structural labels (UPPERCASE line-leading "LABEL:" and the
  // [date ...] stamps) for the statically-rendered default. app.html re-applies the
  // same highlighting on click. Kept in sync with the render() regex there.
  const escHtml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const highlight = (t: string) =>
    escHtml(t).replace(/^([A-Z][A-Z0-9 ()/&.'-]*?:)/gm, '<span class="c-key">$1</span>');
  // The preview leads with the report-specific part (FOCUS + this report's data),
  // dropping the shared persona/requirements header from view. Copy still grabs
  // the full prompt. Kept in sync with previewOf() in app.html.
  const previewOf = (t: string) => { const i = t.indexOf('FOCUS:'); return i >= 0 ? t.slice(i) : t; };
</script>

<svelte:head>
  <title>Autonomic for iOS &amp; Android | Private HRV, POTS &amp; Dysautonomia Recovery App</title>
  <meta
    name="description"
    content="Autonomic is a private, offline journal that scores your daily HRV, blood pressure, sleep and orthostatic readings against medical thresholds, so people recovering from POTS, dysautonomia and post-viral illness can see what's helping and what's hurting."
  />
  <link rel="canonical" href="https://autonomic.care/" />

  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://autonomic.care/" />
  <meta property="og:title" content="Autonomic for iOS &amp; Android | See your nervous system recover" />
  <meta property="og:description" content="Medically-scored daily readings, trend analysis, and AI-ready insight reports for autonomic recovery. Private, offline, on-device." />
  <meta property="og:image" content="https://autonomic.care/og.png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:type" content="image/png" />
  <meta property="og:image:alt" content="Autonomic: see your nervous system recover. A private journal that scores your daily HRV, blood pressure, sleep and orthostatic readings." />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="Autonomic for iOS &amp; Android | Private autonomic recovery app" />
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
      <h1 class="hero-h1">See your <span class="h1-keep">nervous system</span> recover.</h1>
      <p class="hero-lead">Autonomic turns your daily <strong>HRV, blood pressure, sleep and orthostatic</strong> readings into clear, medically-scored signals, so anyone recovering from <strong>POTS, dysautonomia</strong> or post-viral illness can finally see what helps and what hurts.</p>
      <div class="hero-cta">
        <span class="hero-cta-eyebrow"><i class="hero-cta-dot"></i>Available now on iPhone &amp; Android</span>
        <div class="hero-badges">
          <a class="hero-appstore" href={appStoreLink} data-dl-store="ios" aria-label="Download Autonomic on the App Store">
            <svg viewBox="0 0 120 40" role="img" aria-label="Download on the App Store" xmlns="http://www.w3.org/2000/svg">
              <rect x="0.5" y="0.5" width="119" height="39" rx="6.5" fill="#000" stroke="rgba(255,255,255,0.4)" />
              <path transform="translate(10,7.5) scale(0.05)" fill="#fff" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5c0 26.2 4.8 53.3 14.4 81.2 12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 20-27.8 44.7-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
              <text x="35" y="16" fill="#fff" font-family="-apple-system, Helvetica, Arial, sans-serif" font-size="7.5">Download on the</text>
              <text x="34" y="31" fill="#fff" font-family="-apple-system, Helvetica, Arial, sans-serif" font-size="16" font-weight="600" letter-spacing="-0.3">App Store</text>
            </svg>
          </a>
          <a class="hero-appstore" href={playStoreLink} data-dl-store="android" aria-label="Get Autonomic on Google Play">
            <svg viewBox="0 0 120 40" role="img" aria-label="Get it on Google Play" xmlns="http://www.w3.org/2000/svg">
              <rect x="0.5" y="0.5" width="119" height="39" rx="6.5" fill="#000" stroke="rgba(255,255,255,0.4)" />
              <g transform="translate(1.11,1.17) scale(0.94)" stroke-width="1.6" stroke-linejoin="round">
                <path fill="#00C3FF" stroke="#00C3FF" d="M10 8 21 19.5 10 19.5Z" />
                <path fill="#FF3A44" stroke="#FF3A44" d="M10 8 27 19.5 21 19.5Z" />
                <path fill="#00D66F" stroke="#00D66F" d="M10 19.5 21 19.5 10 31Z" />
                <path fill="#FFCE00" stroke="#FFCE00" d="M21 19.5 27 19.5 10 31Z" />
              </g>
              <text x="35" y="16" fill="#fff" font-family="-apple-system, Helvetica, Arial, sans-serif" font-size="7">GET IT ON</text>
              <text x="34" y="31" fill="#fff" font-family="-apple-system, Helvetica, Arial, sans-serif" font-size="14.5" textLength="78" lengthAdjust="spacingAndGlyphs" font-weight="600" letter-spacing="-0.2">Google Play</text>
            </svg>
          </a>
        </div>
        <p class="hero-cta-note"><b>Free to download.</b> Pro from {monthly}/mo.</p>
      </div>
      <ul class="hero-trust">
        <li>Free forever</li>
        <li>Works offline</li>
        <li>Nothing tracked</li>
      </ul>
    </div>

    <div class="hero-stage">
      <div class="orbit-chip chip-a"><span class="dot" style="background:var(--sky)"></span>RMSSD 34 <em>great</em></div>
      <div class="orbit-chip chip-b"><span class="dot" style="background:var(--green)"></span>Outlook +12 vs AM</div>
      <div class="orbit-chip chip-c"><span class="dot" style="background:var(--accent)"></span>2 clean days</div>

      <div class="phone phone-float">
        <div class="phone-screen">
          <!-- iOS status bar -->
          <div class="mk-statusbar">
            <span class="mk-time">8:00</span>
            <span class="mk-island"></span>
            <span class="mk-sysic">
              <svg class="mk-wifi" viewBox="0 0 16 12" aria-hidden="true"><path d="M8 10.6 5.9 8.4a3 3 0 0 1 4.2 0zM3.8 6.3a6 6 0 0 1 8.4 0l1.3-1.4a8 8 0 0 0-11 0zM1.6 4a9.2 9.2 0 0 1 12.8 0l1.3-1.4a11.1 11.1 0 0 0-15.4 0z" fill="currentColor"/></svg>
              <svg class="mk-batt" viewBox="0 0 27 12" aria-hidden="true"><rect x="0.5" y="0.5" width="22" height="11" rx="3.2" fill="none" stroke="currentColor" stroke-opacity="0.45"/><rect x="2" y="2" width="19" height="8" rx="2" fill="currentColor"/><path d="M24.2 4.2v3.6a2 2 0 0 0 0-3.6z" fill="currentColor" fill-opacity="0.45"/></svg>
            </span>
          </div>

          <!-- Date bar -->
          <div class="mk-datebar"><span class="mk-arw">‹</span><span class="mk-date">Sat, Aug 1</span><span class="mk-arw">›</span></div>

          <div class="mk-scroll">
            <!-- Autonomic Outlook -->
            <div class="mk-daycard">
              <div class="mk-head">
                <span class="mk-mode">Autonomic Outlook</span>
                <span class="mk-chip">Excellent</span>
              </div>
              <div class="mk-gauge">
                <svg viewBox="0 0 176 176" aria-hidden="true">
                  <path d="M35.67 140.33 A74 74 0 1 1 140.33 140.33" fill="none" stroke="#2b3a2c" stroke-width="15" stroke-linecap="round" />
                  <path d="M35.67 140.33 A74 74 0 1 1 152.6 118.3" fill="none" stroke="#6ee06e" stroke-width="15" stroke-linecap="round" />
                </svg>
                <div class="mk-gauge-in"><div class="mk-num">92</div><div class="mk-den">OUT OF 100</div></div>
              </div>
              <div class="mk-pow"><i>i</i> What powers this</div>
              <div class="mk-status">95% confidence</div>
              <div class="mk-guide">Strong baseline with reserves to spare. Good for your full protocol.</div>
            </div>

            <!-- Milestones -->
            <div class="mk-tile">
              <span class="mk-tile-ic" style="background:rgba(224,49,39,.16);color:#e03127">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/></svg>
              </span>
              <span class="mk-tile-body">
                <b>Milestones</b>
                <span class="mk-tile-sub">52 of 75 achieved</span>
                <span class="mk-bar"><i style="width:69%"></i></span>
              </span>
              <span class="mk-chev">›</span>
            </div>

            <!-- Clean day streak -->
            <div class="mk-tile">
              <span class="mk-tile-ic" style="background:rgba(245,158,11,.16);color:#f59e0b">
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 2.5l1.7 4.3 4.3 1.7-4.3 1.7L13 14.5l-1.7-4.3L7 8.5l4.3-1.7zM6.5 14l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9z"/></svg>
              </span>
              <span class="mk-tile-body">
                <b>2 <span class="mk-tile-mute">clean days</span> · Building</b>
                <span class="mk-tile-sub">Clean day. Streak continues.</span>
              </span>
              <span class="mk-chev">›</span>
            </div>

            <!-- Sleep -->
            <div class="mk-sec">
              <div class="mk-sec-h">Sleep</div>
              <div class="mk-sec-card">
                <div class="mk-head"><span class="mk-mode">Last night</span><span class="mk-chip mk-chip-good">Good</span></div>
                <div class="mk-big"><b>7.8</b><span>hrs asleep</span></div>
                <div class="mk-sub">11:24pm → 7:35am · HR 58–91 bpm</div>
                <div class="mk-stages"><i style="flex:22;background:#4f7cff"></i><i style="flex:19;background:#a06bff"></i><i style="flex:52;background:#3aa0d8"></i><i style="flex:7;background:#4a4a52"></i></div>
                <div class="mk-legend"><span><i style="background:#4f7cff"></i>Deep 1h 42m</span><span><i style="background:#a06bff"></i>REM 1h 29m</span><span><i style="background:#3aa0d8"></i>Core 4h 5m</span></div>
              </div>
            </div>

            <!-- Readings -->
            <div class="mk-sec">
              <div class="mk-sec-h">Readings</div>
              <div class="mk-sec-card mk-sec-list">
                <div class="mk-row"><span class="mk-ico">✚</span><span class="mk-rt">Morning HRV</span><span class="mk-rv"><i class="dot" style="background:#6ee06e"></i>63 SDNN</span><span class="mk-time-pill">8:28am</span></div>
                <div class="mk-row"><span class="mk-ico">♡</span><span class="mk-rt">Blood Pressure</span><span class="mk-rv"><i class="dot" style="background:#6ee06e"></i>112/72</span><span class="mk-time-pill">8:40am</span></div>
              </div>
            </div>
          </div>

          <!-- Real tab bar -->
          <div class="mk-tabbar">
            <span class="mk-tab mk-tab-brand"><svg viewBox="0 0 651.59 348.34" aria-hidden="true"><path d={APP_MARK_PATH} fill="currentColor" /></svg></span>
            <span class="mk-tab on">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M9 3.5h6v2H9z" fill="currentColor" stroke="none"/><path d="M9 11h6M9 15h4"/></svg>
              <b>Journal</b>
            </span>
            <span class="mk-tab">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.5 15v-3M12 15V9.5M15.5 15v-1.8"/></svg>
              <b>Progress</b>
            </span>
            <span class="mk-tab">
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3l1.5 3.9L17.4 8.4l-3.9 1.5L12 13.8l-1.5-3.9L6.6 8.4l3.9-1.5zM6.6 14.4l.8 2.1 2.1.8-2.1.8-.8 2.1-.8-2.1-2.1-.8 2.1-.8z"/></svg>
              <b>Insight</b>
            </span>
            <span class="mk-tab mk-tab-gear">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 13.5a7.7 7.7 0 0 0 0-3l1.8-1.4-1.8-3.1-2.2.8a7.6 7.6 0 0 0-2.6-1.5L14.2 3h-3.6l-.4 2.3A7.6 7.6 0 0 0 7.6 6.8l-2.2-.8-1.8 3.1L5.4 10.5a7.7 7.7 0 0 0 0 3l-1.8 1.4 1.8 3.1 2.2-.8a7.6 7.6 0 0 0 2.6 1.5l.4 2.3h3.6l.4-2.3a7.6 7.6 0 0 0 2.6-1.5l2.2.8 1.8-3.1z"/></svg>
            </span>
          </div>
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

<!-- ============ FOUNDER TRUST BAR ============ -->
<section class="trustbar" aria-label="From the founder">
  <div class="wrap trustbar-row">
    <img class="trustbar-avatar" src="/me.jpg" width="340" height="340" alt="Austin, founder of Autonomic" loading="lazy" />
    <p class="trustbar-text"><b>“I’ve used Autonomic for two years to manage my own long COVID.”</b> It’s how I found what actually helps, and got to a much better place than I’d been in for years.</p>
    <a class="trustbar-link" href="#journey">Read my story <span aria-hidden="true">→</span></a>
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
        <li><b>HRV, both ways</b>, quick baseline reads and paced training sessions with LF/HF power, RMSSD, pNN50 and baroreflex peak.</li>
        <li><b>Cardio &amp; vitals</b>, blood pressure spread and resting heart rate.</li>
        <li><b>Orthostatic tests</b>, lying-to-standing heart-rate jumps and one-minute recovery, scored for POTS patterns.</li>
        <li><b>Context that explains it</b>, sleep, activity, meds &amp; supplements, food, hydration, symptoms and digestion.</li>
      </ul>
    </div>
    <div class="feature-art">
      <div class="card-mock">
        <div class="cm-head"><span>Add reading</span><span class="cm-x">✕</span></div>
        <div class="cm-list">
          <div class="cm-item"><span class="cm-ic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" /><path d="M3.22 12H9.5l.6-1.3 1.9 4.6 2-7 1.5 3.7h5.27" /></svg></span><div><b>Baseline HRV</b><small>Quick read · RMSSD · pNN50</small></div></div>
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

<!-- ============ APPLE WATCH ============
     The device is a working replica of the watchOS app: every face below is a
     real screen from mobile/targets/watch (ContentView / StandTestViews /
     OrthostaticViews / HrMonitorView), with that screen's own copy, glyphs and
     colours. The inline script at the foot of the page drives the flows; with
     no JS the home screen renders and the rest stays hidden. -->
<section class="section watch" id="watch">
  <div class="watch-glow" aria-hidden="true"></div>
  <div class="wrap watch-grid">
    <div class="watch-copy">
      <span class="watch-pill"><i></i>Apple Watch companion</span>
      <h2 class="h2">POTS tools that never leave your wrist.</h2>
      <p class="lead">The moment the room tilts, the data’s already there. Run the stand test, catch an episode as it happens, or just keep an eye on your heart rate — no phone, no waiting, nothing to miss.</p>
      <div class="wa-modes">
        {#each waModes as m}
          <button type="button" class="wa-mode" data-wa-mode={m.mode} data-wa-go={m.face} style="--wa-tint:{m.tint};--wa-soft:{m.soft}">
            <span class="wa-mode-ic">{@html waIcon(m.icon)}</span>
            <span class="wa-mode-txt"><b>{m.title}</b><span>{m.blurb}</span></span>
            <span class="wa-mode-go">›</span>
          </button>
        {/each}
      </div>
    </div>

    <div class="watch-stage">
      <div class="wa-device">
        <div class="wa-case">
          <span class="wa-crown" aria-hidden="true"></span>
          <span class="wa-side" aria-hidden="true"></span>
          <div class="wa-screen" id="waScreen">
            <!-- HOME (ContentView.home) -->
            <div class="wa-face waf-home waf-root scrolls on" data-wa-face="home">
              <!-- The same pulse mark the watch tints in DS.accent (its `logo`
                   asset is this mark exported white, template-rendered). -->
              <BrandMark size={36} />
              <span class="waf-brand">Autonomic</span>
              {#each waModes as m}
                <button type="button" class="wa-row" data-wa-go={m.face}>
                  <span class="wa-row-ic" style="color:{m.tint};background:{m.soft}">{@html waIcon(m.icon)}</span>
                  <span class="wa-row-tx"><b>{m.title}</b><span>{m.sub}</span></span>
                  <span class="wa-row-go">›</span>
                </button>
              {/each}
            </div>

            <!-- POTS TEST · intro (StandTestViews.IntroView) -->
            <div class="wa-face waf-intro" data-wa-face="test-intro">
              <span class="wa-lbl">POTS Test</span>
              <span class="waf-intro-ic" style="color:#4aa3f0;background:rgba(74,163,240,0.1)">{@html waIcon('standing')}</span>
              <p>Lie down and rest quietly. We’ll tell you when to stand.</p>
              <button type="button" class="wa-btn" data-wa-go="test-resting">Start</button>
              <button type="button" class="wa-btn back" data-wa-go="home">Back</button>
            </div>

            <!-- POTS TEST · resting (RestingView) -->
            <div class="wa-face waf-ringface scrolls" data-wa-face="test-resting">
              <span class="wa-lbl" style="color:#4aa3f0">Resting</span>
              <span class="wa-sub">Lie still &amp; relax</span>
              <div class="waf-ring-wrap">
                <svg viewBox="0 0 120 120" aria-hidden="true">
                  <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="7" />
                  <circle data-wa-ring cx="60" cy="60" r="52" fill="none" stroke="#4aa3f0" stroke-width="7" stroke-linecap="round" stroke-dasharray="326.73" stroke-dashoffset="326.73" />
                </svg>
                <div class="waf-ring-in">
                  <span class="wa-num waf-count" data-wa-count>5:00</span>
                  <span class="waf-hr-line">
                    <span class="wa-heart" style="width:11px;height:11px">{@html waIcon('heart')}</span>
                    <span class="wa-num" data-wa-hr="dim" style="font-size:13px">00</span>
                    <span class="u">bpm</span>
                  </span>
                </div>
              </div>
              <span class="wa-spring"></span>
              <button type="button" class="wa-btn sec" data-wa-go="test-prompt">Skip to standing</button>
            </div>

            <!-- POTS TEST · stand prompt (StandPromptView) -->
            <div class="wa-face waf-prompt" data-wa-face="test-prompt">
              <span class="wa-spring"></span>
              <span class="waf-arrow">{@html waIcon('arrowUp', 2.4)}</span>
              <b>Stand up</b>
              <span class="waf-prompt-sub">Then hold still</span>
              <span class="wa-spring"></span>
              <button type="button" class="wa-btn" data-wa-go="test-standing">I’m standing</button>
            </div>

            <!-- POTS TEST · standing (StandingView) -->
            <div class="wa-face waf-ringface scrolls" data-wa-face="test-standing">
              <span class="wa-lbl" style="color:#e03127">Standing</span>
              <span class="wa-sub">Hold still, don’t move</span>
              <div class="waf-ring-wrap">
                <svg viewBox="0 0 120 120" aria-hidden="true">
                  <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="7" />
                  <circle data-wa-ring cx="60" cy="60" r="52" fill="none" stroke="#e03127" stroke-width="7" stroke-linecap="round" stroke-dasharray="326.73" stroke-dashoffset="326.73" />
                </svg>
                <div class="waf-ring-in">
                  <span class="waf-hr-line">
                    <span class="wa-num" data-wa-hr style="font-size:24px">00</span>
                    <span class="u">bpm</span>
                  </span>
                  <span class="wa-chip" data-wa-delta>Δ 00</span>
                  <span class="waf-left"><span data-wa-count>10:00</span> left</span>
                </div>
              </div>
              <span class="wa-spring"></span>
              <button type="button" class="wa-btn sec" data-wa-go="test-results">Finish now</button>
            </div>

            <!-- POTS TEST · results (ResultsView) -->
            <div class="wa-face waf-res scrolls" data-wa-face="test-results">
              <span class="waf-res-ic" style="color:#3ec46d">{@html waIcon('check', 2.2)}</span>
              <b class="t">Test complete</b>
              <div class="wa-res-row"><span class="k">Resting HR</span><span class="v wa-num" data-wa-res="rest">00 bpm</span></div>
              <div class="wa-res-row"><span class="k">Peak standing</span><span class="v wa-num" data-wa-res="peak">00 bpm</span></div>
              <div class="wa-res-row" data-wa-res-row="sustained"><span class="k">Sustained rise</span><span class="v wa-num" data-wa-res="sustained">Δ 00 bpm</span></div>
              <div class="wa-res-row"><span class="k">Max increase</span><span class="v wa-num" data-wa-res="max">Δ 00 bpm</span></div>
              <p class="waf-note">Check the Autonomic app for more details.</p>
              <p class="waf-disc">Wellness screening only. HR-based, does not measure blood pressure, and is not a diagnosis. Discuss with your doctor.</p>
              <button type="button" class="wa-btn" data-wa-go="home">Done</button>
            </div>

            <!-- EPISODE · event picker (EventPickerView) -->
            <div class="wa-face waf-home waf-pick scrolls" data-wa-face="ep-picker">
              <span class="wa-lbl" style="color:#9d6bf5">POTS Episode</span>
              {#each waEvents as e}
                <button type="button" class="wa-row" data-wa-go="ep-intro" data-wa-event={e.id}>
                  <span class="wa-row-tx"><b>{e.title}</b></span>
                  <span class="wa-row-go">›</span>
                </button>
              {/each}
              <button type="button" class="wa-btn back" data-wa-go="home">Back</button>
            </div>

            <!-- EPISODE · intro (OrthoIntroView) -->
            <div class="wa-face waf-intro" data-wa-face="ep-intro">
              <span class="wa-lbl" style="color:#9d6bf5">POTS Episode</span>
              <span class="waf-intro-ic" style="color:#9d6bf5;background:rgba(157,107,245,0.12)">{@html waIcon('stairs')}</span>
              <p>First we’ll capture your heart rate before the transition.</p>
              <button type="button" class="wa-btn" style="background:#9d6bf5" data-wa-go="ep-measure">Start</button>
              <button type="button" class="wa-btn back" data-wa-go="ep-picker">Back</button>
            </div>

            <!-- EPISODE · before / during (OrthoMeasureView) -->
            <div class="wa-face waf-measure" data-wa-face="ep-measure">
              <span class="wa-lbl" style="color:#9d6bf5" data-wa-ep-lbl>Before</span>
              <span class="wa-sub" data-wa-ep-sub>Capturing resting HR</span>
              <span class="wa-spring"></span>
              <span class="waf-measure-hr">
                <span class="wa-heart">{@html waIcon('heart')}</span>
                <span class="wa-num n" data-wa-hr>00</span>
                <span class="u">bpm</span>
              </span>
              <span class="wa-chip" data-wa-delta>Δ 00</span>
              <span class="wa-spring"></span>
              <button type="button" class="wa-btn" style="background:#9d6bf5" data-wa-act="ep-next" data-wa-ep-btn>Start climbing</button>
            </div>

            <!-- EPISODE · recovery (OrthoRecoveryView) -->
            <div class="wa-face waf-ringface scrolls" data-wa-face="ep-recovery">
              <span class="wa-lbl" style="color:#9d6bf5">After</span>
              <span class="wa-sub">Recovery</span>
              <div class="waf-ring-wrap">
                <svg viewBox="0 0 120 120" aria-hidden="true">
                  <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="7" />
                  <circle data-wa-ring cx="60" cy="60" r="52" fill="none" stroke="#9d6bf5" stroke-width="7" stroke-linecap="round" stroke-dasharray="326.73" stroke-dashoffset="326.73" />
                </svg>
                <div class="waf-ring-in">
                  <span class="waf-hr-line">
                    <span class="wa-num" data-wa-hr style="font-size:24px">00</span>
                    <span class="u">bpm</span>
                  </span>
                  <span class="wa-chip" data-wa-delta>Δ 00</span>
                  <span class="waf-left"><span data-wa-count>1:00</span> left</span>
                </div>
              </div>
              <span class="wa-spring"></span>
              <button type="button" class="wa-btn sec" data-wa-go="ep-results">End early</button>
            </div>

            <!-- EPISODE · results (OrthoResultsView) -->
            <div class="wa-face waf-res scrolls" data-wa-face="ep-results">
              <span class="waf-res-ic" style="color:#9d6bf5">{@html waIcon('check', 2.2)}</span>
              <b class="t">Event recorded</b>
              <div class="wa-res-row"><span class="k">Before HR</span><span class="v wa-num" data-wa-res="epBefore">00 bpm</span></div>
              <div class="wa-res-row"><span class="k">After HR</span><span class="v wa-num" data-wa-res="epAfter">00 bpm</span></div>
              <div class="wa-res-row"><span class="k">HR after 1 min</span><span class="v wa-num" data-wa-res="epRecovery">00 bpm</span></div>
              <p class="waf-note">Check the Autonomic app for more details.</p>
              <p class="waf-disc">Wellness screening only. HR-based, does not measure blood pressure, and is not a diagnosis. Discuss with your doctor.</p>
              <button type="button" class="wa-btn" style="background:#9d6bf5" data-wa-go="home">Done</button>
            </div>

            <!-- HR MONITOR · live page (HrMonitorView.hrPage) -->
            <div class="wa-face waf-hr-main" data-wa-face="hr-main">
              <span class="wa-lbl">Heart Rate</span>
              <span class="wa-spring"></span>
              <span class="wa-heart">{@html waIcon('heart')}</span>
              <span class="wa-num waf-big" data-wa-hr>00</span>
              <span class="waf-big-u">BPM</span>
              <span class="wa-spring"></span>
              <div class="waf-tiles">
                <div class="wa-tile"><div class="k">2 min avg</div><div class="v wa-num" data-wa-avg>00</div></div>
                <div class="wa-tile"><div class="k">Delta</div><div class="v wa-num" data-wa-delta-tile>Δ 00</div></div>
              </div>
              <button type="button" class="waf-swipe" data-wa-go="hr-controls" aria-label="Session controls">{@html waIcon('chevronRight', 2.2)}</button>
            </div>

            <!-- HR MONITOR · controls page (HrMonitorView.controlsPage) -->
            <div class="wa-face waf-syms scrolls" data-wa-face="hr-controls">
              <span class="wa-lbl" style="text-align:left">Session</span>
              <button type="button" class="wa-btn" data-wa-go="home">End session</button>
              <button type="button" class="wa-btn sec" style="font-size:13px;color:#fff;padding:10px" data-wa-go="hr-symptoms">Log symptom</button>
              <!-- On the watch this page is one swipe right of the readout; here
                   the chevron stands in for swiping back to it. -->
              <button type="button" class="waf-swipe left" data-wa-go="hr-main" aria-label="Back to heart rate">{@html waIcon('chevronLeft', 2.2)}</button>
            </div>

            <!-- HR MONITOR · symptom sheet (SymptomPicker) -->
            <div class="wa-face waf-syms scrolls" data-wa-face="hr-symptoms">
              <b>Log symptom</b>
              {#each waSymptoms as s}
                <button type="button" class="wa-sym" data-wa-log={s}>{s}</button>
              {/each}
            </div>
          </div>
        </div>
      </div>
      <div class="wa-under">
        <p class="wa-caption">
          <span class="wa-caption-ic">{@html waIcon('pointer', 1.8)}</span>Tap the watch to try it. It’s the real app, with the clocks sped up.
        </p>
        <!-- Resets the face and the simulated session (go('home') clears sim). -->
        <button type="button" class="wa-restart" data-wa-go="home">
          <span class="wa-restart-ic">{@html waIcon('restart', 2)}</span>Restart
        </button>
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
        <div class="ai-chips">
          {#each reports as r, i}
            <button type="button" class="ai-chip{i === 0 ? ' selected' : ''}" data-report={r.key} data-title={r.title} data-prompt={r.prompt}><span class="ai-chip-ic">{r.icon}</span>{r.label}<i class="ai-check">✓</i></button>
          {/each}
        </div>
        <div class="ai-llms">
          <span class="ai-llm">Claude</span>
          <span class="ai-llm">Gemini</span>
          <span class="ai-llm">ChatGPT</span>
        </div>
      </div>

      <div class="ai-prompt-cell">
      <div class="ai-prompt">
        <div class="aip-bar"><span class="aip-dot"></span><span class="aip-dot"></span><span class="aip-dot"></span><span class="aip-title">{reports[0].title}</span></div>
        <pre class="aip-body" data-copy={reports[0].prompt}>{@html highlight(previewOf(reports[0].prompt))}</pre>
        <div class="aip-foot"><span>Generated on-device · demo data</span><button class="aip-copy">Copy &amp; try it</button></div>
      </div>
      </div>
    </div>

    <p class="ai-try">Pick a report, copy the prompt, and paste it into ChatGPT or Claude to see the kind of read-out Autonomic gives you. It runs on realistic sample data, so you get a real feel for the reports before you ever log a thing.</p>

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

<!-- ============ PRICING: FREE vs PRO ============ -->
<section class="section pricing-sec" id="pricing">
  <div class="pr-glow" aria-hidden="true"></div>
  <div class="wrap">
    <div class="section-head center">
      <p class="eyebrow">Pricing</p>
      <h2 class="h2">The journal is free. Forever.</h2>
      <p class="lead">Log everything, score every day, keep your data, pay nothing. Pro is for when you want to go deeper: unlimited HRV, your whole history, POTS testing and AI reports.</p>
    </div>

    <div class="pr-plans">
      <article class="pr-plan">
        <p class="pr-tag">Free</p>
        <div class="pr-price"><span class="pr-amt">$0</span><span class="pr-per">/ forever</span></div>
        <p class="pr-sub">No account, no card, no ads. Not a trial that expires.</p>
        <ul class="pr-list">
          <li>The <b>full daily journal</b>, and every context log that feeds it</li>
          <li><b>Manual readings</b> and your daily Autonomic Outlook, scored</li>
          <li><b>One HRV reading</b> a day, with 14 days of charts</li>
          <li><b>Backups and one-tap export</b>, because it's your data</li>
        </ul>
        <a class="btn btn-ghost btn-lg pr-btn btn-download" data-dl-cta href="/#download"><span class="btn-dl-ic" aria-hidden="true"></span><span class="btn-dl-label">Download free</span></a>
      </article>

      <article class="pr-plan pr-plan-pro">
        <span class="pr-badge">{pricing.trialDays} days free on install</span>
        <p class="pr-tag">Pro</p>
        <div class="pr-price"><span class="pr-amt">{monthly}</span><span class="pr-per">/ month</span></div>
        <p class="pr-sub">or {yearly} a year, saving {yearlySavePct}%. Cancel anytime.</p>
        <ul class="pr-list pr-list-pro">
          <li><b>Unlimited HRV readings</b>, so you can catch how your nervous system shifts through the day, not just once each morning</li>
          <li><b>Your full history, visualized</b>, watch every metric move across weeks, months and years, so slow recovery becomes something you can actually see</li>
          <li><b>POTS testing</b>, run guided stand tests, record episodes as they hit, and monitor whether your POTS is easing over time</li>
          <li><b>AI insights</b>, turn your data into doctor-ready answers about what's helping and what's hurting</li>
        </ul>
        <a class="btn btn-primary btn-lg pr-btn" href={appStoreLink}>Start with {pricing.trialDays} days of Pro</a>
      </article>
    </div>

    <p class="pr-note">Every install opens with {pricing.trialDays} days of Pro, no card and no sign-up. When it ends, nothing is taken away from your journal, the deep-analysis tools simply lock until you upgrade.</p>

    <div class="pr-table">
      <div class="pr-rail" aria-hidden="true"></div>

      <div class="pr-cell pr-corner"></div>
      <div class="pr-cell pr-col-head">Free</div>
      <div class="pr-cell pr-col-head pr-col-pro">Pro</div>

      <p class="pr-group">In every plan</p>
      <div class="pr-cell pr-col-pro pr-group-cell"></div>
      {#each sharedRows as label, i}
        <div class="pr-cell pr-feat" class:pr-first={i === 0}>{label}</div>
        <div class="pr-cell pr-mark dim" class:pr-first={i === 0}><span class="pr-sr">Included</span>{@html CHECK}</div>
        <div class="pr-cell pr-mark on pr-col-pro" class:pr-first={i === 0}><span class="pr-sr">Included</span>{@html CHECK}</div>
      {/each}

      <p class="pr-group pr-group-2">Pro upgrades</p>
      <div class="pr-cell pr-col-pro pr-group-cell"></div>
      {#each proRows as r, i}
        <div class="pr-cell pr-feat" class:pr-first={i === 0}>{r.label}</div>
        <div class="pr-cell pr-mark dim" class:pr-first={i === 0}>
          {#if r.free}<span class="pr-val">{r.free}</span>{:else}<span class="pr-sr">Not included</span><i class="pr-dash" aria-hidden="true"></i>{/if}
        </div>
        <div class="pr-cell pr-mark on pr-col-pro" class:pr-first={i === 0}>
          {#if r.pro}<span class="pr-val">{r.pro}</span>{:else}<span class="pr-sr">Included</span>{@html CHECK}{/if}
        </div>
      {/each}
    </div>

    <p class="pr-foot">Your journal is always yours: private, on-device, exportable, whichever plan you're on.</p>
  </div>
</section>

<!-- ============ COMPARISON: AUTONOMIC vs WELLTORY ============ -->
<section class="section compare" id="compare">
  <div class="wrap">
    <div class="section-head center">
      <p class="eyebrow">Autonomic vs Welltory</p>
      <h2 class="h2">More of what matters, at less than half the price.</h2>
      <p class="lead">The same clinical grade HRV from your Apple Watch or a chest strap, without the tracking, the lock in, or the $120 a year bill. And a journal that stays free.</p>
    </div>

    <div class="cmp-table">
      <div class="cmp-cell cmp-corner"></div>
      <div class="cmp-cell cmp-head cmp-us">
        <span class="cmp-badge">Save $70 / year</span>
        <div class="cmp-brand">
          <BrandMark size={22} class="cmp-mark" />
          <b>Autonomic</b>
        </div>
        <div class="cmp-price"><span class="cmp-amt">{monthly}</span><span class="cmp-per">/mo</span></div>
        <div class="cmp-price-sub">or {yearly} / year</div>
      </div>
      <div class="cmp-cell cmp-head cmp-them">
        <div class="cmp-brand cmp-brand-them">
          <img class="cmp-logo-them" src="/welltory.png" width="512" height="512" alt="" loading="lazy" />
          <b>Welltory</b>
        </div>
        <div class="cmp-price"><span class="cmp-amt">$19.99</span><span class="cmp-per">/mo</span></div>
        <div class="cmp-price-sub">or $119.99 / year</div>
      </div>

      <div class="cmp-cell cmp-feat">Focus of the app</div>
      <div class="cmp-cell cmp-val cmp-us"><svg class="cmp-ic yes" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg><span>Long COVID &amp; autonomic recovery</span></div>
      <div class="cmp-cell cmp-val cmp-them"><svg class="cmp-ic dash" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14" /></svg><span>General wellness</span></div>

      <div class="cmp-cell cmp-feat">HRV from Apple Watch &amp; BLE straps</div>
      <div class="cmp-cell cmp-val cmp-us"><svg class="cmp-ic yes" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg><span>Fully supported</span></div>
      <div class="cmp-cell cmp-val cmp-them"><svg class="cmp-ic yes-dim" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg><span>Supported</span></div>

      <div class="cmp-cell cmp-feat">Your data stays on your device</div>
      <div class="cmp-cell cmp-val cmp-us"><svg class="cmp-ic yes" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg><span>We never see it</span></div>
      <div class="cmp-cell cmp-val cmp-them"><svg class="cmp-ic no" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg><span>Stored on their servers</span></div>

      <div class="cmp-cell cmp-feat">Zero tracking</div>
      <div class="cmp-cell cmp-val cmp-us"><svg class="cmp-ic yes" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg><span>None, ever</span></div>
      <div class="cmp-cell cmp-val cmp-them"><svg class="cmp-ic no" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg><span>Tracks your activity</span></div>

      <div class="cmp-cell cmp-feat">Use your own AI (Claude · Gemini · ChatGPT)</div>
      <div class="cmp-cell cmp-val cmp-us"><svg class="cmp-ic yes" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg><span>Your provider, your choice</span></div>
      <div class="cmp-cell cmp-val cmp-them"><svg class="cmp-ic no" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg><span>Locked to Welltory’s AI</span></div>

      <div class="cmp-cell cmp-feat cmp-feat-last">Export all your data</div>
      <div class="cmp-cell cmp-val cmp-us cmp-us-last"><svg class="cmp-ic yes" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg><span>Everything, anytime</span></div>
      <div class="cmp-cell cmp-val cmp-them cmp-them-last"><svg class="cmp-ic no" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg><span>Not available</span></div>
    </div>

    <p class="cmp-foot">Same readings. Your data, your AI, fully exportable, for less than half the price, on top of a journal that costs nothing at all. <a class="cmp-foot-link" href="#pricing">See what's free vs Pro →</a></p>
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
      <details><summary>How much does it cost, and is my data private?<span class="fq-i">+</span></summary><p>The app is free to download and your journal is free forever, with no account and no ads. Autonomic Pro is {monthly}/month or {yearly}/year and unlocks the deep-analysis tools. Every install opens with {pricing.trialDays} days of Pro, no card, so you can try all of it first. Your data is always private: stored on your device, never sold, never sent to a server.</p></details>
      <details><summary>What’s free, and what needs Pro?<span class="fq-i">+</span></summary><p>Free covers the daily journal, your manual readings, your daily Autonomic Outlook, the Apple Watch heart-rate monitor, backups and export, plus one live HRV capture a day and 14 days of charts. Pro adds unlimited HRV capture, your full history, POTS testing and episode tracking, and AI insight and doctor reports. There’s a full breakdown in <a href="#pricing">the pricing table</a>, and the same table lives inside the app.</p></details>
      <details><summary>Does it really work offline?<span class="fq-i">+</span></summary><p>Completely. It’s a fully offline app on both iOS and Android. Scoring, trends and reports are computed locally, so it works anywhere, no signal required.</p></details>
      <details><summary>Which conditions is it built for?<span class="fq-i">+</span></summary><p>POTS, dysautonomia, long COVID and post-viral or post-illness recovery, anywhere daily HRV, heart-rate and orthostatic patterns matter.</p></details>
      <details><summary>Is Autonomic available on Android?<span class="fq-i">+</span></summary><p>Yes. Autonomic is available now on both iPhone (App Store) and Android (Google Play). It’s the same app, the same price, and the same private, offline design on either platform.</p></details>
      <details><summary>Do I need a wearable or special hardware?<span class="fq-i">+</span></summary><p>No, you don’t. You can type readings in by hand from any source. That said, tools like a Polar H10 chest strap, an Apple Watch or a blood pressure cuff make Autonomic far more powerful, the more data you feed it, the better you understand how your body is doing.</p></details>
      <details><summary>How do the AI insights work?<span class="fq-i">+</span></summary><p>Autonomic builds a structured analysis prompt from your data over a date range. You copy it into Claude, Gemini or ChatGPT, the text is generated on-device, nothing is sent automatically.</p></details>
      <details><summary>Is this medical advice?<span class="fq-i">+</span></summary><p>No. Autonomic is a personal tracking and reflection tool. It helps you organize data and conversations, but it doesn’t diagnose or treat. Always work with your clinician.</p></details>
    </div>
  </div>
</section>

<!-- ============ DOWNLOAD + PRICING ============ -->
<section class="cta" id="download">
  <div class="cta-glow" aria-hidden="true"></div>
  <div class="wrap">
    <div class="section-head center" style="margin-bottom: 38px;">
      <BrandMark size={40} class="cta-mark" />
      <p class="eyebrow">Free to download</p>
      <h2 class="cta-h">Read your recovery clearly.</h2>
      <p class="cta-sub">Autonomic is available now on iPhone and Android, free to download, with {pricing.trialDays} days of Pro to start. Scan a code or tap a badge.</p>
    </div>

    <div class="dl-layout">
      <aside class="pricing">
        <p class="pricing-tag">Free to download</p>
        <div class="pricing-price"><span class="amt">$0</span><span class="per">/ forever</span></div>
        <p class="pricing-trial">Every install opens with <b>{pricing.trialDays} days of Pro</b></p>
        <ul class="pricing-list">
          <li>Your journal, your readings and your daily score, free forever</li>
          <li>Pro adds unlimited HRV, full history, POTS testing &amp; AI reports</li>
          <li>Pro is {monthly}/month or {yearly}/year, cancel anytime</li>
          <li>Private &amp; offline forever, no ads, no data sale</li>
          <li>The same app, same price, on iPhone and Android</li>
        </ul>
      </aside>

      <div class="dl-stores">
        <div class="dl-store">
          <a class="dl-store-badge" href={appStoreLink} data-dl-store="ios" aria-label="Download on the App Store">
            <svg viewBox="0 0 120 40" role="img" aria-label="Download on the App Store" xmlns="http://www.w3.org/2000/svg">
              <rect x="0.5" y="0.5" width="119" height="39" rx="6.5" fill="#000" stroke="rgba(255,255,255,0.4)" />
              <path transform="translate(10,7.5) scale(0.05)" fill="#fff" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5c0 26.2 4.8 53.3 14.4 81.2 12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 20-27.8 44.7-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
              <text x="35" y="16" fill="#fff" font-family="-apple-system, Helvetica, Arial, sans-serif" font-size="7.5">Download on the</text>
              <text x="34" y="31" fill="#fff" font-family="-apple-system, Helvetica, Arial, sans-serif" font-size="16" font-weight="600" letter-spacing="-0.3">App Store</text>
            </svg>
          </a>
          <div class="dl-store-qr"><img src="/qr-ios.svg" width="132" height="132" alt="QR code to download Autonomic on the App Store" /></div>
          <span class="dl-store-scan">Scan for iPhone</span>
        </div>
        <div class="dl-store">
          <a class="dl-store-badge" href={playStoreLink} data-dl-store="android" aria-label="Get it on Google Play">
            <svg viewBox="0 0 120 40" role="img" aria-label="Get it on Google Play" xmlns="http://www.w3.org/2000/svg">
              <rect x="0.5" y="0.5" width="119" height="39" rx="6.5" fill="#000" stroke="rgba(255,255,255,0.4)" />
              <g transform="translate(1.11,1.17) scale(0.94)" stroke-width="1.6" stroke-linejoin="round">
                <path fill="#00C3FF" stroke="#00C3FF" d="M10 8 21 19.5 10 19.5Z" />
                <path fill="#FF3A44" stroke="#FF3A44" d="M10 8 27 19.5 21 19.5Z" />
                <path fill="#00D66F" stroke="#00D66F" d="M10 19.5 21 19.5 10 31Z" />
                <path fill="#FFCE00" stroke="#FFCE00" d="M21 19.5 27 19.5 10 31Z" />
              </g>
              <text x="35" y="16" fill="#fff" font-family="-apple-system, Helvetica, Arial, sans-serif" font-size="7">GET IT ON</text>
              <text x="34" y="31" fill="#fff" font-family="-apple-system, Helvetica, Arial, sans-serif" font-size="14.5" textLength="78" lengthAdjust="spacingAndGlyphs" font-weight="600" letter-spacing="-0.2">Google Play</text>
            </svg>
          </a>
          <div class="dl-store-qr"><img src="/qr-android.svg" width="132" height="132" alt="QR code to download Autonomic on Google Play" /></div>
          <span class="dl-store-scan">Scan for Android</span>
        </div>
      </div>
    </div>
  </div>
</section>

<!-- ============ FOUNDER JOURNEY ============ -->
<section class="section journey" id="journey">
  <div class="wrap">
    <div class="section-head center">
      <p class="eyebrow">The story behind Autonomic</p>
      <h2 class="h2">I built this because I needed it.</h2>
    </div>

    <div class="journey-photo-wrap">
      <div class="journey-photo-glow" style="background-image:url(/journey-family.jpg)" aria-hidden="true"></div>
      <figure class="journey-photo">
        <img src="/journey-family.jpg" width="900" height="377" alt="Austin, founder of Autonomic, with his wife and six children in South Carolina" loading="lazy" />
      </figure>
    </div>

    <div class="journey-copy">
      <p>For more than four years, I’ve been living with long COVID. It started with blood pressure that spiked out of nowhere, a heart that raced the moment I stood up, brain fog that swallowed whole days, and a long list of symptoms that never quite fit together. I saw specialist after specialist in cardiology, neurology and beyond, and kept leaving with the same thing: no real answers.</p>

      <p>So I started tracking it myself: HRV, blood pressure, heart rate, sleep, what I ate, the days I crashed. Slowly, patterns surfaced. I found small things that made life more livable, and I got a little better. I’m not healed, and I won’t pretend otherwise. But over the two years I’ve used my own early version of Autonomic, I’ve been able to see what genuinely helps and reach a far better place than I’d been in for a long time.</p>

      <p>I’m not a doctor. I’m not an expert. I’m just someone on this road, in South Carolina, raising six kids, figuring out my own recovery one reading at a time. Autonomic is the tool I built to make sense of it. If it helps you spot your own patterns, find your own answers, and feel a little more in control of your journey too, then it’s done exactly what I hoped.</p>

      <div class="journey-sign">
        <img class="journey-avatar" src="/me.jpg" width="340" height="340" alt="" loading="lazy" />
        <div class="journey-sign-meta">
          <span class="journey-sign-name">Austin</span>
          <span class="journey-sign-role">Founder of Autonomic · long hauler · dad of six, South Carolina</span>
        </div>
      </div>
    </div>
  </div>
</section>

{@html watchScript}
