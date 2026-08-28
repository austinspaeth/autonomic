/* alerts.js — the dashboard noticing something happened.
 *
 * The page auto-refreshes every 5 minutes while it is visible, on every view
 * (app.js), and this is what makes that worth doing: the difference between one
 * ping report and the next is announced rather than silently redrawn. Five
 * events, in ascending order of how much they matter:
 *
 *   visitors    someone opened the app         soft blip, half a second of
 *                                               house-coloured glitter
 *   readings    an install saved a reading      soft tap, a card + a toast + a
 *               TODAY (any reading, not the      notification naming the
 *               first)                           sensor. No canvas.
 *   activations an install saved its FIRST      soft chime, a card + a toast +
 *               HRV reading                     a notification naming the
 *                                               sensor. No canvas.
 *   downloads   a first run the counter had     two-note chime, TEN SECONDS of
 *               never seen (a new install)      SILVER glitter falling from the
 *                                               top, a card + a toast + a
 *                                               notification naming the store
 *   sales       a subscribe ping                fanfare, FIFTEEN SECONDS of
 *                                               GOLD glitter from both edges, a
 *                                               card + a toast + a notification
 *                                               naming the store that paid
 *
 * **The metal is the news, and the duration is the ranking.** Gold for money,
 * silver for a new install, house colours for somebody coming back — told apart
 * across a room with the sound off. An earlier version of this file reserved
 * the canvas for arrivals and gave usage nothing, on the argument that a
 * celebration for the event the dashboard hopes to see all day would run
 * permanently and leave a sale's confetti meaning nothing. That argument was
 * about duration, not about the canvas: half a second is over before it reads
 * as an interruption, where a sale holds the screen for fifteen. An activation
 * is the one event that still gets no canvas at all — it lands in the same
 * refresh as the download that caused it often enough that its own puff would
 * only ever be read as part of that one, and the reading counter beside it is
 * the same event one rung quieter: the app being USED, which is the thing this
 * dashboard hopes to see all day and therefore the last thing that may hold the
 * screen. Both are told, neither is celebrated.
 *
 * Everything here is fed by the PING COUNTER, which is the only source on this
 * page that changes on its own. Store downloads and the sales ledger are hand
 * imported, so a burst of "new sales" from a CSV paste would be an alert about
 * your own typing, not about the business.
 *
 * Two halves, deliberately separated:
 *
 *   `snapshot` / `diff` are PURE — no DOM, no audio, no clock — and are what
 *   `tests/alerts.test.mjs` pins. Everything under "effects" is the shell.
 *
 * The rules the pure half obeys:
 *
 * - **A download is a first run, not an open.** An open ping whose cohort key
 *   IS the day it arrived on is an install the counter had never heard from
 *   before. That is the closest thing to a live download this dashboard has;
 *   the store's own download number arrives a day late in a CSV.
 * - **The platform comes off the ping's own cohort key**, so a card can say
 *   which store without a second source. A ping from a build that predates the
 *   platform marker reads as `U` and is reported as "unknown store" rather
 *   than being folded into either one — the same rule the App usage view runs.
 * - **A delta is never negative.** The report is a sliding 400-day window, so
 *   the oldest day drops out of it as the calendar turns and a count can fall
 *   without anything having gone wrong. A drop is not an event: it clamps to
 *   zero, and the new snapshot becomes the baseline either way.
 * - **Two snapshots are compared DAY BY DAY, not total against total**, which
 *   is what makes the point above survive an absence rather than only a
 *   refresh. See the note on `diff`.
 * - **The baseline is remembered across sessions**, so what arrived while the
 *   dashboard was closed is announced when you open it — which was the whole
 *   point of a dashboard that celebrates. A browser that has never held a
 *   baseline still seeds in silence, and so does one whose baseline is older
 *   than `MAX_CATCHUP_MS`; otherwise a first sign-in would open with a fanfare
 *   for a month of history, which is the rule this replaces and not one it
 *   throws away.
 */
(function () {
  'use strict';

  /* Cards and copy speak store names; the report speaks letters. */
  var STORE = { I: 'iOS', A: 'Android', U: 'unknown store' };

  /* The second letter a READING ping carries — activations and daily readings
     both do: which sensor took it. Lower case because it reads inside a
     sentence ("1 chest strap"), unlike a store name. */
  var SENSOR = { W: 'Apple Watch', B: 'chest strap', F: 'phone camera', G: 'Garmin watch' };

  function storeName(letter) { return STORE[letter] || STORE.U; }
  function letterOf(p) { return (p === 'I' || p === 'A') ? p : 'U'; }
  function sensorOf(m) { return SENSOR[m] ? m : '?'; }
  function sensorName(letter) { return SENSOR[letter] || 'unknown sensor'; }

  /* --------------------------------------------------------------- pure */

  /**
   * Fold a PINGS report into the three running totals we alert on.
   *
   *   { opens, downloads, sales, activations, readings,
   *     downloadsBy: {I,A,U}, salesBy: {I,A,U},
   *     activationsBy: {W,G,B,F,?}, readingsBy: {W,G,B,F,?} }
   *
   * `activationsBy` is keyed by SENSOR rather than by store, because that is
   * the fact the activation route carries that nothing else does — which store
   * an install came from is already on its download card.
   *
   * These are counts of PINGS, not of people — summing daily actives into one
   * number would count the same install once per day it opened the app, which
   * is the rule the App usage view is built around. Here that does not matter
   * and the distinction is still worth keeping in mind: this is an event
   * counter whose only job is to be compared with its own previous value.
   */
  function snapshot(report) {
    var out = {
      opens: 0, downloads: 0, sales: 0, activations: 0, readings: 0,
      downloadsBy: {}, salesBy: {}, activationsBy: {}, readingsBy: {}, days: {},
    };

    function day(d) {
      return out.days[d] || (out.days[d] = {
        opens: 0, downloads: 0, sales: 0, activations: 0, readings: 0,
        downloadsBy: {}, salesBy: {}, activationsBy: {}, readingsBy: {},
      });
    }

    ((report && report.open) || []).forEach(function (row) {
      if (!row || !row.day) return;
      var bucket = day(row.day);
      ((row.cohorts) || []).forEach(function (x) {
        if (!x || !x.cohort) return;
        var n = Number(x.count) || 0;
        if (!(n > 0)) return;
        out.opens += n;
        bucket.opens += n;
        // Born today == first run == the install we are calling a download.
        if (x.cohort === row.day) {
          var p = letterOf(x.platform);
          out.downloads += n;
          out.downloadsBy[p] = (out.downloadsBy[p] || 0) + n;
          bucket.downloads += n;
          bucket.downloadsBy[p] = (bucket.downloadsBy[p] || 0) + n;
        }
      });
    });

    ((report && report.sub) || []).forEach(function (row) {
      if (!row || !row.day) return;
      var bucket = day(row.day);
      ((row.cohorts) || []).forEach(function (x) {
        if (!x || !x.cohort) return;
        var n = Number(x.count) || 0;
        if (!(n > 0)) return;
        var p = letterOf(x.platform);
        out.sales += n;
        out.salesBy[p] = (out.salesBy[p] || 0) + n;
        bucket.sales += n;
        bucket.salesBy[p] = (bucket.salesBy[p] || 0) + n;
      });
    });

    /* Activation fires once per install, ever, so unlike the open rows above
       these really do count people — no de-duplication is being skipped here. */
    ((report && report.act) || []).forEach(function (row) {
      if (!row || !row.day) return;
      var bucket = day(row.day);
      ((row.cohorts) || []).forEach(function (x) {
        if (!x || !x.cohort) return;
        var n = Number(x.count) || 0;
        if (!(n > 0)) return;
        var m = sensorOf(x.method);
        out.activations += n;
        out.activationsBy[m] = (out.activationsBy[m] || 0) + n;
        bucket.activations += n;
        bucket.activationsBy[m] = (bucket.activationsBy[m] || 0) + n;
      });
    });

    /* The daily reading counter. Unlike activation this fires again tomorrow,
       so a row counts install-DAYS rather than people — which is exactly the
       news it is for: somebody who already has the app used it today. Its
       sensor letter names that install's FIRST reading of the day, since the
       counter is capped at one per install per Eastern day. */
    ((report && report.hrv) || []).forEach(function (row) {
      if (!row || !row.day) return;
      var bucket = day(row.day);
      ((row.cohorts) || []).forEach(function (x) {
        if (!x || !x.cohort) return;
        var n = Number(x.count) || 0;
        if (!(n > 0)) return;
        var sensor = sensorOf(x.method);
        out.readings += n;
        out.readingsBy[sensor] = (out.readingsBy[sensor] || 0) + n;
        bucket.readings += n;
        bucket.readingsBy[sensor] = (bucket.readingsBy[sensor] || 0) + n;
      });
    });

    return out;
  }

  function gain(prevBy, nextBy) {
    var out = {};
    Object.keys(nextBy || {}).forEach(function (k) {
      var d = (nextBy[k] || 0) - ((prevBy && prevBy[k]) || 0);
      if (d > 0) out[k] = d;
    });
    return out;
  }

  function rise(a, b) { return Math.max(0, (b || 0) - (a || 0)); }

  function addInto(into, from) {
    Object.keys(from || {}).forEach(function (k) {
      if (from[k] > 0) into[k] = (into[k] || 0) + from[k];
    });
  }

  /**
   * What changed between two snapshots. Rises only — see the sliding-window
   * note at the top.
   *
   * DAY BY DAY, not total against total, and the difference is the whole reason
   * a remembered baseline works at all. The report is a sliding 400-day window:
   * come back after two days away and it has dropped two old days off the back
   * as it gained two new ones at the front. Compared as totals, a flat week
   * nets to roughly nothing and the fortnight you missed announces itself as
   * silence. Compared per day, the two new days are two new days and the two
   * that left are simply not there to be a fall.
   *
   * A day the baseline never saw counts whole, which is exactly what "since you
   * last looked" means. Everything else is unchanged: a day whose count went
   * DOWN contributes zero rather than a negative, so a re-stamped or corrected
   * row can never read as an event.
   *
   * The totals path is kept for a baseline written before this shipped — a
   * snapshot in localStorage from the previous version has no `days`.
   *
   * A COUNTER THE BASELINE NEVER KNEW IS SKIPPED ENTIRELY. A stored snapshot
   * written before the activation counter existed has no `activations` field,
   * so every day in it would read as a rise from zero and the first refresh
   * after the deploy would announce a year of first readings as news. A
   * baseline is a claim about what you have already been told; silence about a
   * counter it never knew is the honest reading of it, and the snapshot it is
   * replaced with knows about it from then on. The reading counter is newer
   * still and gets its own gate for the same reason — one flag cannot answer
   * for two counters that shipped on different days.
   */
  function diff(prev, next) {
    var p = prev || snapshot(null);
    var n = next || snapshot(null);
    var actKnown = typeof p.activations === 'number';
    var readKnown = typeof p.readings === 'number';
    var d;

    if (p.days && n.days) {
      d = { visitors: 0, downloads: 0, sales: 0, activations: 0, readings: 0,
            downloadsBy: {}, salesBy: {}, activationsBy: {}, readingsBy: {} };
      Object.keys(n.days).forEach(function (key) {
        var a = p.days[key] || { opens: 0, downloads: 0, sales: 0, activations: 0, readings: 0,
                                 downloadsBy: {}, salesBy: {}, activationsBy: {}, readingsBy: {} };
        var b = n.days[key];
        d.visitors += rise(a.opens, b.opens);
        d.downloads += rise(a.downloads, b.downloads);
        d.sales += rise(a.sales, b.sales);
        addInto(d.downloadsBy, gain(a.downloadsBy, b.downloadsBy));
        addInto(d.salesBy, gain(a.salesBy, b.salesBy));
        if (readKnown) {
          d.readings += rise(a.readings, b.readings);
          addInto(d.readingsBy, gain(a.readingsBy, b.readingsBy));
        }
        if (!actKnown) return;
        d.activations += rise(a.activations, b.activations);
        addInto(d.activationsBy, gain(a.activationsBy, b.activationsBy));
      });
    } else {
      d = {
        visitors: rise(p.opens, n.opens),
        downloads: rise(p.downloads, n.downloads),
        sales: rise(p.sales, n.sales),
        activations: actKnown ? rise(p.activations, n.activations) : 0,
        readings: readKnown ? rise(p.readings, n.readings) : 0,
        downloadsBy: gain(p.downloadsBy, n.downloadsBy),
        salesBy: gain(p.salesBy, n.salesBy),
        activationsBy: actKnown ? gain(p.activationsBy, n.activationsBy) : {},
        readingsBy: readKnown ? gain(p.readingsBy, n.readingsBy) : {}
      };
    }

    d.any = d.visitors > 0 || d.downloads > 0 || d.sales > 0 || d.activations > 0 || d.readings > 0;
    return d;
  }

  /** "2 on iOS · 1 on Android", in a fixed order so it never shuffles. */
  function storeLine(by) {
    return ['I', 'A', 'U'].filter(function (k) { return (by || {})[k] > 0; })
      .map(function (k) { return by[k] + ' on ' + storeName(k); })
      .join(' · ');
  }

  /** "1 chest strap · 1 phone camera", in the order the app offers them. */
  function sensorLine(by) {
    return ['W', 'G', 'B', 'F', '?'].filter(function (k) { return (by || {})[k] > 0; })
      .map(function (k) { return by[k] + ' ' + sensorName(k); })
      .join(' · ');
  }

  function plural(n, one, many) { return n === 1 ? one : (many || (one + 's')); }

  /* ------------------------------------------------------------ settings */

  var BASE_KEY = 'autonomic.master.alertBase';
  var MUTE_KEY = 'autonomic.master.alertsMuted';

  /* How far back a remembered baseline is allowed to reach.

     A baseline is a claim about what you have already been told. Past a month
     it stops being one: the sliding window itself is only 400 days, the missing
     stretch is no longer "since you last looked" in any useful sense, and
     announcing three hundred downloads in one go is a number, not news. Past
     this, the stored snapshot seeds silently exactly as a first-ever sign-in
     does. */
  var MAX_CATCHUP_MS = 30 * 24 * 3600 * 1000;

  /**
   * The baseline, remembered across sessions.
   *
   * This is the one rule the original module got right for the wrong span of
   * time. "The first report of a session is a baseline, not news" was there to
   * stop a sign-in opening with a fanfare for a month of history — but it also
   * meant that everything which arrived while the dashboard was CLOSED was
   * silently absorbed into the new baseline and never mentioned. The page you
   * open in the morning had no way to tell you about the sale that came in
   * overnight; it just quietly drew a bigger number.
   *
   * So the baseline is stored, and the first report of a session is compared
   * against the last one the previous session saw. A browser that has never
   * held one still seeds silently — that is the case the original rule was
   * written for, and it is unchanged.
   *
   * It lives in localStorage rather than in the synced store on purpose: "what
   * this browser has already told me" is a property of this browser. Two
   * devices should each get the news once, and neither should swallow it for
   * the other.
   */
  var storedRead = false;

  function loadBase() {
    storedRead = true;
    try {
      var raw = window.localStorage.getItem(BASE_KEY);
      if (!raw) return null;
      var p = JSON.parse(raw);
      if (!p || !p.snap || typeof p.snap.opens !== 'number') return null;
      if (!p.at || (Date.now() - p.at) > MAX_CATCHUP_MS) return null;
      return p.snap;
    } catch (e) { return null; }
  }

  function saveBase(snap) {
    try {
      window.localStorage.setItem(BASE_KEY, JSON.stringify({ at: Date.now(), snap: snap }));
    } catch (e) { /* private mode, or the quota is full — the session baseline still works */ }
  }
  var muted = false;
  try { muted = window.localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { /* private mode */ }

  function setMuted(v) {
    muted = !!v;
    try { window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) { /* ignore */ }
    syncButton();
  }

  function reducedMotion() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch (e) { return false; }
  }

  /* --------------------------------------------------------------- sound
   *
   * Synthesized, not sampled. The dashboard is inlined into one self-contained
   * document with nothing to resolve at runtime (see MASTER_DASHBOARD.md), so
   * an <audio src> is out and a base64 fanfare would be a hundred kilobytes of
   * the page. A handful of oscillators costs nothing and can be retuned in a
   * diff you can read.
   *
   * A browser will not let a page make noise before it has been touched, so the
   * context is created on the first real interaction — signing in is one — and
   * resumed on every use, because it can be suspended again at any point.
   */

  var actx = null;

  function audio() {
    if (muted) return null;
    try {
      if (!actx) {
        var C = window.AudioContext || window.webkitAudioContext;
        if (!C) return null;
        actx = new C();
      }
      if (actx.state === 'suspended') actx.resume();
      return actx;
    } catch (e) { return null; }
  }

  /**
   * One note, as an object rather than a positional tuple — a fanfare is a
   * dozen of these and `[783.99, 0.3, 0.18, 'sawtooth', 0.09]` is unreadable
   * five notes in.
   *
   *   f     frequency, Hz            v   peak gain
   *   at    offset from the downbeat  d   how long it takes to decay away
   *   type  oscillator shape          lp  lowpass corner, when it needs one
   *   to    frequency to glide to     dt  detune, cents (shimmer on a chord)
   *
   * The envelope is exponential in both directions: a linear ramp to zero
   * reads as a click, and a linear attack reads as a fade-in rather than a
   * strike.
   */
  function note(ctx, at, n, out) {
    var osc = ctx.createOscillator();
    var amp = ctx.createGain();
    var dur = n.d;
    osc.type = n.type || 'sine';
    osc.frequency.setValueAtTime(n.f, at);
    if (n.to) osc.frequency.exponentialRampToValueAtTime(n.to, at + dur * 0.5);
    if (n.dt) osc.detune.setValueAtTime(n.dt, at);
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.exponentialRampToValueAtTime(n.v, at + (n.a || 0.008));
    amp.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(amp);
    /* A raw sawtooth is a buzz. A brass instrument is a sawtooth with the top
       taken off, which is all a lowpass is doing here. */
    if (n.lp) {
      var f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(n.lp, at);
      amp.connect(f); f.connect(out);
    } else {
      amp.connect(out);
    }
    osc.start(at);
    osc.stop(at + dur + 0.06);
  }

  /* The three signatures. They are meant to be told apart across a room and
     with your back to the screen, so they differ in SHAPE and not only in
     pitch: two notes, three notes, or a fanfare with a held chord under it.
     They also climb in weight in the order the events matter.

     The visitor blip is the one that fires most often and it still has to be
     audible — the first version was one sine at 0.055 gain, which is a sound
     you have to already know is coming to hear at all. It is now a struck
     two-note interval (C6 up a fifth to G6, an octave of body underneath),
     short enough to stay out of the way at three times a refresh. */
  var VISITOR = [
    { f: 1046.50, at: 0,     d: 0.13, type: 'triangle', v: 0.20 },   // C6
    { f: 1567.98, at: 0.075, d: 0.26, type: 'triangle', v: 0.15 },   // G6
    { f: 523.25,  at: 0,     d: 0.12, type: 'sine',     v: 0.10 }    // C5, body
  ];

  /* An activation is a small good thing: two notes settling rather than
     rising, softer than a download and unmistakably not it. It is the app
     starting to work for somebody who already had it, which is worth hearing
     and is not an arrival. */
  var ACTIVATION = [
    { f: 783.99,  at: 0,     d: 0.15, type: 'triangle', v: 0.17 },   // G5
    { f: 1046.50, at: 0.085, d: 0.42, type: 'triangle', v: 0.16 },   // C6, rings
    { f: 392.00,  at: 0.085, d: 0.34, type: 'sine',     v: 0.09 }    // G4, body
  ];

  /* A reading is the quietest thing here that still gets said out loud: one
     struck note with a short body under it, softer than the activation above
     and unmistakably not it. It is somebody using the app they already have,
     which is the event this dashboard hopes to see all day — anything with a
     rise or a ring in it would wear out by lunchtime. */
  var READING = [
    { f: 880.00,  at: 0,    d: 0.16, type: 'triangle', v: 0.13 },   // A5
    { f: 440.00,  at: 0,    d: 0.13, type: 'sine',     v: 0.07 }    // A4, body
  ];

  /* A download ARRIVES, so it is three notes rising to a note that rings, with
     a low sine under the landing to give it weight. */
  var DOWNLOAD = [
    { f: 587.33,  at: 0,    d: 0.16, type: 'triangle', v: 0.20 },    // D5
    { f: 880.00,  at: 0.08, d: 0.18, type: 'triangle', v: 0.20 },    // A5
    { f: 1174.66, at: 0.16, d: 0.70, type: 'triangle', v: 0.19 },    // D6, rings
    { f: 1760.00, at: 0.16, d: 0.55, type: 'sine',     v: 0.07 },    // A6 sparkle
    { f: 293.66,  at: 0.16, d: 0.50, type: 'sine',     v: 0.14 }     // D4, weight
  ];

  /* The fanfare: a repeated-note pickup into a C major arpeggio and a held
     chord, brass-shaped, with the bass an octave and two below it. This is the
     only sound on the page allowed to take two seconds. */
  var SALE = [
    { f: 392.00,  at: 0.00, d: 0.13, type: 'sawtooth', v: 0.16, lp: 2600 },  // G4
    { f: 392.00,  at: 0.14, d: 0.12, type: 'sawtooth', v: 0.15, lp: 2600 },  // G4
    { f: 523.25,  at: 0.27, d: 0.17, type: 'sawtooth', v: 0.17, lp: 2800 },  // C5
    { f: 659.25,  at: 0.44, d: 0.15, type: 'sawtooth', v: 0.17, lp: 3000 },  // E5
    { f: 783.99,  at: 0.58, d: 0.17, type: 'sawtooth', v: 0.18, lp: 3200 },  // G5
    // the arrival: C6 over the triad, two voices a few cents apart so it moves
    { f: 1046.50, at: 0.76, d: 1.20, type: 'sawtooth', v: 0.17, lp: 3400 },
    { f: 1046.50, at: 0.76, d: 1.20, type: 'sawtooth', v: 0.09, lp: 3400, dt: 9 },
    { f: 783.99,  at: 0.76, d: 1.20, type: 'sawtooth', v: 0.11, lp: 3000 },
    { f: 659.25,  at: 0.76, d: 1.20, type: 'sawtooth', v: 0.10, lp: 3000 },
    { f: 261.63,  at: 0.76, d: 1.20, type: 'sawtooth', v: 0.11, lp: 1100 },  // C4
    { f: 130.81,  at: 0.76, d: 1.00, type: 'sine',     v: 0.16 }             // C3
  ];

  /* How loud the whole page is allowed to be. These cues have to carry across
     a room from a laptop speaker, and the first version summed into the
     destination at 0.75 — comfortably below the level any other tab plays at,
     which is why they read as "no sounds" rather than as quiet ones. */
  var MASTER_GAIN = 2.6;

  function play(score) {
    var ctx = audio();
    if (!ctx) return;
    /* One gain stage for the whole cue: the fanfare stacks five voices on its
       last chord, and summing them straight into the destination is how a
       celebration turns into a crackle.
       Past unity that crackle is a certainty rather than a risk, so the sum
       goes through a compressor on its way out. That is what buys the headroom
       to be loud: peaks are held down and the body of the cue comes up, where
       simply raising the gain would clip the chord and leave the quiet notes
       exactly as inaudible as they were. */
    var out = ctx.createGain();
    out.gain.setValueAtTime(MASTER_GAIN, ctx.currentTime);

    var comp = null;
    try {
      comp = ctx.createDynamicsCompressor();
      comp.threshold.setValueAtTime(-20, ctx.currentTime);
      comp.knee.setValueAtTime(24, ctx.currentTime);
      comp.ratio.setValueAtTime(8, ctx.currentTime);
      comp.attack.setValueAtTime(0.004, ctx.currentTime);
      comp.release.setValueAtTime(0.22, ctx.currentTime);
    } catch (e) { comp = null; }

    if (comp) { out.connect(comp); comp.connect(ctx.destination); }
    else { out.gain.setValueAtTime(1, ctx.currentTime); out.connect(ctx.destination); }

    var now = ctx.currentTime + 0.02;
    score.forEach(function (n) { note(ctx, now + n.at, n, out); });
  }

  /* ------------------------------------------------------------ glitter
   *
   * One canvas, one RAF loop, and no loop at all while the screen is empty —
   * an idle animation frame every 16ms for the whole session is exactly the
   * kind of thing that turns a dashboard left open into a warm laptop.
   *
   * **Each event has its own metal, and the metal IS the news.** Told apart
   * across a room and with the sound off:
   *
   *   sale      GOLD    15 seconds, bursting from both edges
   *   download  SILVER  10 seconds, falling from the top
   *   visitor   COLOUR   0.5 seconds, a single puff
   *
   * The half-second colour puff is a deliberate reversal of the older rule
   * here, which was that the canvas belonged to arrivals only and that any
   * celebration of ordinary usage would run more or less permanently. That
   * argument was about DURATION, and it still holds: what makes the puff safe
   * is that it is over before it registers as an interruption, where a sale
   * runs for fifteen seconds. The three durations are the ranking, so a glance
   * at the screen tells you which of the three happened without reading a word.
   *
   * Glitter rather than paper: the shards are small, they catch a highlight
   * along one edge, and each one twinkles on its own phase. A metallic palette
   * drawn as flat rectangles reads as grey confetti, not as silver.
   */

  var PALETTES = {
    /* Gold, from deep amber up to a near-white specular. The lightest two are
       rare on purpose — they are the glint, and a glint every third shard is
       just a pale palette. */
    sale: ['#8a5a00', '#b8860b', '#d4a017', '#e8c252', '#f5d97a', '#fff6d5', '#ffffff'],
    /* Silver, same shape: cold greys under two near-whites. */
    download: ['#6b7280', '#8b94a3', '#adb5bd', '#ced4da', '#e9ecef', '#f8f9fa', '#ffffff'],
    /* The house colours, for the puff that says somebody came back. */
    visit: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#9085e9', '#ffffff']
  };

  /* How long the canvas keeps emitting, per event. Duration is the ranking. */
  var DURATION = { sale: 15000, download: 10000, visit: 500 };
  /* How often a wave leaves the emitter, and how big a wave is. A sale runs
     three times as long as the puff at a third of the density per wave, or
     fifteen seconds of it would be a wall rather than glitter. */
  var WAVE_MS = { sale: 620, download: 400, visit: 250 };
  var WAVE_N  = { sale: 26,  download: 46,  visit: 34 };

  var canvas = null, cctx = null, bits = [], raf = 0;

  /* The pure half of this file is unit-tested in a `window`-only sandbox with
     no document at all, and `announce` is reachable from there. Both effects
     therefore check for a DOM rather than assuming one — a missing canvas is
     already a no-op, and this makes a missing DOCUMENT one too. */
  function hasDom() { return typeof document !== 'undefined' && !!document; }

  function surface() {
    if (canvas) return canvas;
    if (!hasDom()) return null;
    var el = document.getElementById('confetti');
    if (!el) return null;
    /* A 2D context is not guaranteed — jsdom hands back null without the canvas
       package, and a locked-down browser can too. Everything downstream draws
       through `cctx`, so the celebration is skipped rather than thrown. */
    try { cctx = el.getContext('2d'); } catch (e) { cctx = null; }
    if (!cctx) return null;
    canvas = el;
    return canvas;
  }

  function sizeCanvas() {
    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /**
   * One shard.
   *
   * `twinkle` is the per-shard phase offset that stops the field pulsing in
   * unison — the single thing that separates glitter from a swarm of coloured
   * rectangles. `flip` is how fast it tumbles edge-on, which is what makes a
   * shard vanish to a line and come back.
   */
  function piece(pal, x, y, vx, vy) {
    var w = 3 + Math.random() * 5;
    return {
      x: x, y: y, vx: vx, vy: vy,
      w: w, h: w * (0.5 + Math.random() * 0.7),
      rot: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 0.5,
      flip: 0.10 + Math.random() * 0.22,
      phase: Math.random() * Math.PI * 2,
      color: pal[(Math.random() * pal.length) | 0],
      life: 0, max: 260 + Math.random() * 220
    };
  }

  /** Falling from the top edge — the download celebration. */
  function rain(pal, n) {
    var w = window.innerWidth;
    for (var i = 0; i < n; i++) {
      bits.push(piece(pal, Math.random() * w, -20 - Math.random() * 120,
        (Math.random() - 0.5) * 1.4, 2 + Math.random() * 2.6));
    }
  }

  /** Shot from both edges toward the middle — the sale celebration. */
  function burst(pal, n) {
    var w = window.innerWidth, h = window.innerHeight;
    for (var i = 0; i < n; i++) {
      bits.push(piece(pal, w * (0.15 + Math.random() * 0.7), -10,
        (Math.random() - 0.5) * 7, 4 + Math.random() * 5));
      bits.push(piece(pal, w * (0.15 + Math.random() * 0.7), h + 10,
        (Math.random() - 0.5) * 7, -(9 + Math.random() * 5)));
    }
  }

  /** A single puff across the top — the half-second visitor cue. */
  function puff(pal, n) {
    var w = window.innerWidth;
    for (var i = 0; i < n; i++) {
      bits.push(piece(pal, Math.random() * w, -12 - Math.random() * 40,
        (Math.random() - 0.5) * 2.2, 3 + Math.random() * 3.4));
    }
  }

  function step() {
    var h = window.innerHeight;
    cctx.clearRect(0, 0, window.innerWidth, h);
    bits = bits.filter(function (b) {
      b.life += 1;
      b.vy += 0.16;              // gravity
      b.vx *= 0.992;             // drag, so a burst fans out and settles
      b.x += b.vx;
      b.y += b.vy;
      b.rot += b.spin;
      if (b.y > h + 40 || b.life > b.max) return false;

      /* Tumble: the shard is drawn at its true width scaled by how edge-on it
         currently is, so it narrows to a line and opens out again. `catchLight`
         peaks at the same moment the face is square to the viewer, which is
         when a real flake would flash. */
      var face = Math.cos(b.life * b.flip + b.phase);
      var open = Math.abs(face);
      var catchLight = open * open;
      var fade = b.life > b.max - 90 ? Math.max(0, (b.max - b.life) / 90) : 1;

      cctx.save();
      cctx.translate(b.x, b.y);
      cctx.rotate(b.rot);
      cctx.globalAlpha = fade * (0.45 + 0.55 * open);
      cctx.fillStyle = b.color;
      cctx.fillRect(-b.w / 2 * open, -b.h / 2, Math.max(0.6, b.w * open), b.h);
      /* The specular edge. Cheap, and it is the whole reason the palette above
         reads as metal rather than as beige and grey. */
      if (catchLight > 0.55) {
        cctx.globalAlpha = fade * (catchLight - 0.55) * 2.0;
        cctx.fillStyle = '#ffffff';
        cctx.fillRect(-b.w / 2 * open, -b.h / 2, Math.max(0.6, b.w * open), Math.max(0.6, b.h * 0.3));
      }
      cctx.restore();
      return true;
    });
    if (bits.length) raf = window.requestAnimationFrame(step);
    else { raf = 0; cctx.clearRect(0, 0, window.innerWidth, h); }
  }

  /**
   * Celebrate `kind`.
   *
   * Every event is a DURATION rather than a wave count, so five sales in one
   * refresh is still fifteen seconds rather than seventy-five — the news is
   * "someone paid", and the number of them is on the card. The count only
   * survives as a small density bonus, capped, so three downloads at once look
   * heavier than one without lasting any longer.
   *
   * A running celebration is not restarted by a quieter one: a download landing
   * inside a sale's fifteen seconds tops the sale up rather than cutting it
   * back to ten. `until` is therefore only ever pushed outward.
   */
  var waveTimer = 0;
  var until = 0;
  var activeKind = null;

  var RANK = { visit: 0, download: 1, sale: 2 };

  function celebrate(kind, count) {
    if (reducedMotion()) return;
    if (!surface()) return;
    sizeCanvas();

    var pal = PALETTES[kind] || PALETTES.visit;
    var now = Date.now();
    var ends = now + (DURATION[kind] || DURATION.visit);

    /* The louder event owns the palette and the emitter for as long as it runs;
       a quieter one arriving underneath it only extends the clock. */
    if (!activeKind || RANK[kind] >= RANK[activeKind] || ends > until) {
      if (!activeKind || RANK[kind] >= RANK[activeKind]) activeKind = kind;
      if (ends > until) until = ends;
    }

    var boost = Math.min(2.2, 1 + (Math.max(1, Math.round(count) || 1) - 1) * 0.25);

    var shoot = function () {
      var k = activeKind || kind;
      var p = PALETTES[k] || pal;
      var n = Math.round((WAVE_N[k] || WAVE_N.visit) * boost);
      if (k === 'sale') burst(p, n);
      else if (k === 'download') rain(p, n);
      else puff(p, n);
      if (!raf) raf = window.requestAnimationFrame(step);
      if (Date.now() >= until) {
        window.clearInterval(waveTimer);
        waveTimer = 0;
        activeKind = null;
      }
    };

    shoot();
    /* The puff is one wave by definition — half a second is not long enough for
       a second one to read as anything but the first. */
    if (until > Date.now() + 60) {
      window.clearInterval(waveTimer);
      waveTimer = window.setInterval(shoot, WAVE_MS[activeKind || kind] || WAVE_MS.visit);
    }
  }

  /* ---------------------------------------------------------------- cards
   *
   * Bottom right, newest at the bottom, and they STAY until they are dismissed.
   * Deliberately not the toast, in two ways: the toast is one line that
   * replaces itself, where two downloads inside ten minutes should read as two
   * things happening; and the toast disappears on a timer, where the whole
   * point of this stack is to still be there when you come back to the laptop.
   *
   * What that costs is bounded rather than unbounded. The stack scrolls once it
   * is taller than the viewport allows, it clears in one press, and past
   * `MAX_CARDS` the oldest is dropped — a dashboard left open over a weekend
   * should not hold nine hundred DOM nodes to tell you the same thing.
   */

  var MAX_CARDS = 40;

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function cardEls() {
    var stack = document.getElementById('alertStack');
    return stack ? [].slice.call(stack.querySelectorAll('.alert-card')) : [];
  }

  function remove(el) {
    el.classList.remove('on');
    window.setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
      syncClear();
    }, 260);
  }

  /** The "Clear all" control only exists while there is more than one to clear. */
  function syncClear() {
    var btn = document.getElementById('alertClear');
    if (!btn) return;
    btn.classList.toggle('hidden', cardEls().length < 2);
  }

  function clearAll() { cardEls().forEach(remove); }

  /* One glyph per kind, so a card is identified before it is read — the left
     edge carries the same distinction in colour (styles.css). */
  var MARK = { sale: '💸', download: '📲', activation: '💓', reading: '🫀' };

  function card(kind, title, line) {
    if (!hasDom()) return;
    var stack = document.getElementById('alertStack');
    if (!stack) return;
    var el = document.createElement('div');
    el.className = 'alert-card ' + kind;
    el.innerHTML =
      '<div class="alert-mark" aria-hidden="true">' + MARK[kind] + '</div>' +
      '<div class="alert-body"><b>' + esc(title) + '</b>' +
      (line ? '<span>' + esc(line) + '</span>' : '') + '</div>' +
      '<button class="alert-x" aria-label="Dismiss">×</button>';
    stack.appendChild(el);
    // One frame later, so the transition has a state to leave from.
    window.requestAnimationFrame(function () { el.classList.add('on'); });
    el.addEventListener('click', function () { remove(el); });

    var all = cardEls();
    while (all.length > MAX_CARDS) { var old = all.shift(); if (old.parentNode) old.parentNode.removeChild(old); }
    syncClear();
    // Newest card visible once the stack is long enough to scroll.
    stack.scrollTop = stack.scrollHeight;
  }

  /* -------------------------------------------------------------- announce */

  /* ---------------------------------------------------------- other rooms
   *
   * The card is the record and it stays until it is pressed. Two more channels
   * carry the same sentence to somewhere the card is not:
   *
   *   the TOAST, because the card stack lives in one corner and a dashboard on
   *   a phone is mostly not that corner. It is the same line, said once,
   *   wherever you are on the page.
   *
   *   a NOTIFICATION, for the window you are not currently looking at. `pwa.js`
   *   owns the rules and refuses unless permission was granted and the document
   *   has lost focus, so this can be called unconditionally.
   *
   * Both are best-effort. Neither may throw into the middle of a celebration:
   * the toast lives in app.js, which is a later script, and the notification
   * lives behind a permission that can be revoked between one refresh and the
   * next.
   */

  function say(line) {
    try {
      if (window.Dashboard && window.Dashboard.toast) window.Dashboard.toast(line);
    } catch (e) { /* never block the rest of the announcement */ }
  }

  function push(title, body, tag) {
    try {
      if (window.Pwa && window.Pwa.notify) window.Pwa.notify({ title: title, body: body, tag: tag });
    } catch (e) { /* ditto */ }
  }

  /**
   * Say what changed. Only ONE sound plays per refresh, the loudest thing that
   * happened: a fanfare and a chime and a blip fired together is a noise, not
   * three pieces of news. Cards do stack, because they are read rather than
   * heard.
   */
  function announce(d) {
    if (d.sales > 0) {
      var saleTitle = d.sales + ' new ' + plural(d.sales, 'sale') + '!';
      card('sale', saleTitle, storeLine(d.salesBy));
      say(saleTitle + ' ' + storeLine(d.salesBy));
      push('💸 ' + saleTitle, storeLine(d.salesBy), 'autonomic-sale');
      play(SALE);
      celebrate('sale', d.sales);
    }
    if (d.downloads > 0) {
      var dlTitle = d.downloads + ' new ' + plural(d.downloads, 'download') + '!';
      card('download', dlTitle, storeLine(d.downloadsBy));
      /* One toast per refresh: a sale already said the louder half, and two
         toasts in a row replace each other so fast the first is unreadable. */
      if (!d.sales) say(dlTitle + ' ' + storeLine(d.downloadsBy));
      push('📲 ' + dlTitle, storeLine(d.downloadsBy), 'autonomic-download');
      if (!d.sales) play(DOWNLOAD);
      // Sales already put waves in the air; downloads landing in the same
      // refresh extend them rather than starting a competing pattern.
      celebrate(d.sales ? 'sale' : 'download', d.downloads + d.sales);
    }
    /* An activation gets every channel a download gets EXCEPT the canvas. It
       is somebody using the app they already have, which is the thing this
       dashboard hopes to see all day — confetti for it would be confetti
       permanently, and then a sale's confetti would mean nothing. The sound
       yields to a louder event in the same refresh, the same rule the toast
       below already follows. */
    if (d.activations > 0) {
      var actTitle = d.activations + ' first ' + plural(d.activations, 'reading') + '!';
      card('activation', actTitle, sensorLine(d.activationsBy));
      if (!d.sales && !d.downloads) {
        say(actTitle + ' ' + sensorLine(d.activationsBy));
        play(ACTIVATION);
      }
      push('💓 ' + actTitle, sensorLine(d.activationsBy), 'autonomic-activation');
    }
    /* Readings get the same three channels and the same missing fourth. This is
       the app being USED — not an arrival, not a first — so it is the last thing
       allowed to make a noise and the first to yield when anything above it
       happened in the same refresh. No exclamation mark either: a sentence that
       shouts every time somebody takes their morning reading stops being read.
       An activation in the same refresh is the SAME reading counted twice (a
       first reading is also a reading of that day), so the count is stated but
       the sound and the toast defer to it. */
    if (d.readings > 0) {
      var readTitle = d.readings + ' ' + plural(d.readings, 'reading') + ' today';
      card('reading', readTitle, sensorLine(d.readingsBy));
      if (!d.sales && !d.downloads && !d.activations) {
        say(readTitle + (sensorLine(d.readingsBy) ? ' · ' + sensorLine(d.readingsBy) : ''));
        play(READING);
      }
      push('🫀 ' + readTitle, sensorLine(d.readingsBy), 'autonomic-reading');
    }
    /* Visitors stay a sound and nothing else, in every channel. It is the event
       that fires most often and the least worth a line of text — a toast for it
       would be on screen more or less permanently, and a notification for it
       would be the fastest way to have notifications turned back off. */
    if (!d.sales && !d.downloads && !d.activations && !d.readings && d.visitors > 0) {
      play(VISITOR);
      /* Half a second of house-coloured glitter. Short enough that it reads as
         a flicker rather than an interruption, which is the whole licence for
         celebrating ordinary usage at all — see the note above `PALETTES`. */
      celebrate('visit', d.visitors);
    }
  }

  /* ---------------------------------------------------------------- shell */

  var base = null;

  /**
   * Hand the module a freshly fetched PINGS report. Returns the diff it
   * announced, or null when there was nothing to say.
   *
   * The first report of a session is compared against the baseline the LAST
   * session left behind, so opening the dashboard in the morning tells you
   * about the night. Only a browser that has never held one — a first sign-in,
   * or a baseline older than `MAX_CATCHUP_MS` — seeds in silence.
   */
  function sync(report) {
    var next = snapshot(report);
    var prev = base;
    if (!prev && !storedRead) prev = loadBase();
    base = next;
    saveBase(next);
    if (!prev) return null;
    var d = diff(prev, next);
    if (!d.any) return null;
    announce(d);
    return d;
  }

  /** Throw away the baseline, so the next report seeds instead of alerting. */
  function reset() {
    base = null;
    storedRead = true;   // and don't go and read the stored one instead
  }

  function syncButton() {
    var btn = document.getElementById('btnAlerts');
    if (!btn) return;
    btn.dataset.muted = muted ? 'true' : 'false';
    btn.setAttribute('aria-pressed', muted ? 'false' : 'true');
    btn.title = muted ? 'Alert sounds are off' : 'Alert sounds are on';
  }

  function init() {
    var clear = document.getElementById('alertClear');
    if (clear) clear.addEventListener('click', clearAll);
    syncClear();

    var btn = document.getElementById('btnAlerts');
    if (btn) {
      btn.addEventListener('click', function () {
        setMuted(!muted);
        if (!muted) play(VISITOR);   // confirm the thing you just turned on
      });
    }
    syncButton();

    /* Build the audio context on the first gesture of the session. Without it
       the first alert of the day is silent, and it is the one most worth
       hearing. */
    var unlock = function () {
      audio();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

    window.addEventListener('resize', function () { if (raf) sizeCanvas(); });
  }

  window.Alerts = {
    // pure
    snapshot: snapshot, diff: diff, storeLine: storeLine, sensorLine: sensorLine,
    // shell
    init: init, sync: sync, reset: reset, announce: announce, clearAll: clearAll,
    isMuted: function () { return muted; }, setMuted: setMuted
  };
})();
