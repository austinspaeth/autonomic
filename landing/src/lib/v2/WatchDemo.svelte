<!-- The interactive watch demo, moved verbatim from the old home page. It runs
     on its own inline script (the site ships no framework runtime). -->
<script lang="ts">
  import { pricing } from '$lib/site';
  import BrandMark from '$lib/BrandMark.svelte';
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
    check: { d: ['M20 6 9 17l-5-5'], extra: '<circle cx="12" cy="12" r="10" />' },
    // The one glyph with no Icon.tsx twin: the watch's Pacing row draws the SF
    // Symbol `bolt.batteryblock`, redrawn here at the same weight.
    batteryBolt: {
      d: ['M7.5 6V3.8h3V6', 'M13.5 6V3.8h3V6', 'm12.9 9.2-3.1 4.5h4.4l-3.1 4.5'],
      extra: '<rect x="3" y="6" width="18" height="15" rx="3" />'
    }
  };
  const waIcon = (name: string, sw = 1.9) => {
    const ic = WA_ICONS[name];
    const paths = ic.d.map((d) => `<path d="${d}" />`).join('');
    return `<svg viewBox="0 0 24 24" fill="${ic.fill ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}${ic.extra ?? ''}</svg>`;
  };

  // The four modes, in the watch home screen's own order. `sub` is the
  // subtitle the watch itself shows; `blurb` is the page's longer read.
  // Tints are DS.gold / DS.accent / DS.blue / DS.purple from DesignSystem.swift.
  // Pacing leads, as on the watch: it is a thing you CHECK, and its subtitle
  // is today's figure (PacingFrame.homeSubtitle), kept live by the script.
  const waModes = [
    {
      face: 'pace-main',
      mode: 'pacing',
      icon: 'batteryBolt',
      tint: '#f2c740',
      soft: 'rgba(242,199,64,0.12)',
      title: 'Pacing',
      sub: '1h 35m left today',
      blurb: 'Today’s budget at a glance: what’s left, what’s spent, and where an even day would be by now. Part of Pro.'
    },
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

  // Pacing (PacingView). A day running AHEAD of pace but not over: the same
  // 4h 40m budget as the #pacing section, gold fill past the white marker.
  // It is a day, not a session, so it survives Back and only Restart resets
  // it. While the face is open the afternoon plays sped up: a minute or two
  // of spend lands every couple of seconds and the marker creeps, and spend
  // stops short of the budget, since over is a different state with its own
  // red ember that this demo is deliberately not showing.
  var PACE_BUDGET = 280;
  function paceStart() { return { spent: 185, above: 38, pace: 0.45, nextAt: 0 }; }
  var pace = paceStart();
  // budget/format.ts hm(): "45m", "3h", "1h 05m".
  function hm(min) {
    var m = Math.max(0, Math.round(min));
    if (m < 60) return m + 'm';
    var h = Math.floor(m / 60), r = m % 60;
    return r ? h + 'h ' + ('0' + r).slice(-2) + 'm' : h + 'h';
  }
  function renderPace() {
    var left = hm(PACE_BUDGET - pace.spent);
    section.querySelectorAll('[data-wa-pace-home]').forEach(function (n) { n.textContent = left + ' left today'; });
    var set = function (sel, v) { var n = q('pace-main', sel); if (n) n.textContent = v; };
    set('[data-wa-pace-fig]', left);
    set('[data-wa-pace-spent]', hm(pace.spent));
    set('[data-wa-pace-above]', hm(pace.above));
    var fill = q('pace-main', '.fill'), mark = q('pace-main', '.mark'), caret = q('pace-main', '.caret');
    if (fill) fill.style.width = (100 * pace.spent / PACE_BUDGET).toFixed(2) + '%';
    if (mark) mark.style.left = (100 * pace.pace).toFixed(2) + '%';
    if (caret) caret.style.left = (100 * pace.pace).toFixed(2) + '%';
  }
  function stepPace() {
    if (now() < pace.nextAt) return;
    if (pace.nextAt && pace.spent < 250) {
      pace.spent = Math.min(250, pace.spent + 1 + (Math.random() < 0.45 ? 1 : 0));
      if (Math.random() < 0.35) pace.above += 1;
      pace.pace = Math.min(0.66, pace.pace + 0.004);
    }
    pace.nextAt = now() + 1800 + Math.random() * 900;
    renderPace();
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
      face === 'ep-measure' || face === 'ep-recovery' || face === 'hr-main' || face === 'pace-main');
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
    if (name === 'pace-main') {
      // The bar travels to its length as the face opens, the way the strip's
      // does in the app, rather than appearing already drawn.
      var fill = q('pace-main', '.fill');
      if (fill) { fill.style.transition = 'none'; fill.style.width = '0%'; void fill.offsetWidth; fill.style.transition = ''; }
      pace.nextAt = 0;
    }
    var mode = name.indexOf('test-') === 0 ? 'test' : name.indexOf('ep-') === 0 ? 'episode' : name.indexOf('hr-') === 0 ? 'hr' : name.indexOf('pace-') === 0 ? 'pacing' : '';
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
    if (face === 'pace-main') { stepPace(); return; }
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
    if (el.classList.contains('wa-restart')) { pace = paceStart(); renderPace(); }
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
</script>

<div class="v2-dark-tokens">
<section class="section watch" id="watch">
  <div class="watch-glow" aria-hidden="true"></div>
  <div class="wrap watch-grid">
    <div class="watch-copy">
      <span class="watch-pill"><i></i>Apple Watch &amp; Garmin companion app</span>
      <h2 class="h2">POTS tools that never leave your wrist.</h2>
      <p class="lead">The moment the room tilts, the data’s already there. Check what’s left of today’s budget, run the stand test, catch an episode as it happens, or just keep an eye on your heart rate. No phone, no waiting, nothing to miss.</p>
      <!-- Said up front, not discovered after install. The watch app is iOS-only;
           Android gets the same stand test and episode capture in the phone app,
           reading from a strap or the camera. -->
      <p class="watch-note"><b>iPhone + Apple Watch.</b> On Android the same stand test and episode capture run in the app itself, using a Bluetooth chest strap or your phone’s camera.</p>
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
                  <span class="wa-row-tx"><b>{m.title}</b><span data-wa-pace-home={m.mode === 'pacing' ? '' : undefined}>{m.sub}</span></span>
                  <span class="wa-row-go">›</span>
                </button>
              {/each}
            </div>

            <!-- PACING (PacingView). An ahead-of-pace frame as widgets.ts
                 pacingFrame() resolves it: figure left, "left, running ahead",
                 CAUTION_GOLD fill past the pace marker, then Spent beside the
                 minutes HR sat above the user's line, gold because the day
                 is ahead. Values here are the no-JS still; the script keeps
                 them moving. -->
            <div class="wa-face waf-pace" data-wa-face="pace-main">
              <span class="wa-lbl">Pacing</span>
              <div class="waf-pace-body">
                <span class="wa-num waf-pace-fig" data-wa-pace-fig>1h 35m</span>
                <span class="waf-pace-sub">left, running ahead</span>
                <div class="waf-pace-bar" aria-hidden="true">
                  <i class="track"></i>
                  <i class="fill" style="width:66.07%"></i>
                  <i class="mark" style="left:45%"></i>
                  <i class="caret" style="left:45%"></i>
                </div>
                <div class="waf-tiles">
                  <div class="wa-tile"><div class="k">Spent</div><div class="v wa-num" style="color:#f2f2f5" data-wa-pace-spent>3h 05m</div></div>
                  <div class="wa-tile"><div class="k">HR above 94</div><div class="v wa-num" style="color:#eab308" data-wa-pace-above>38m</div></div>
                </div>
              </div>
              <button type="button" class="wa-btn back" data-wa-go="home">Back</button>
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
</div>

{@html watchScript}
