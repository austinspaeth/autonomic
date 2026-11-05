import { RANGES, EXPERIENCES, COMBOS, RESULTS_FALLBACK, MATCHES_SHOWN, HERO_CUES } from './homeData';

/** The site ships no framework runtime (csr = false), so the home page's
 *  interactive parts ride along as one inline script. */
export const homeScript = `<script>
(function () {
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // The hero loop is decoration: with reduced motion it holds on its first frame.
  var heroLoop = $('#heroLoop');
  if (still && heroLoop) { heroLoop.removeAttribute('autoplay'); heroLoop.pause(); }

  // The hero question and phone screen follow the video's own clock: every
  // presented frame is checked against the cues, so a stall, a seek or a loop
  // can never leave them out of step with the picture.
  (function () {
    var bub = $('#heroBubble'), box = bub && $('.hb-box', bub), meas = bub && $('.hb-measure', bub);
    var glass = bub && $('.hb-glass', bub), edge = bub && $('.hb-edge', bub);
    if (!bub || !box || !meas || !glass || !edge || !heroLoop) return;
    var CUES = ${JSON.stringify(HERO_CUES)}, screens = $$('[data-hero-screen]'), cur = 0;
    var rim = $('.hb-rim', edge), shade = $('.hb-shadow', edge), maskP = $('.hb-mask-p', edge);
    var glow = $('.hb-glow', edge), inP = $('.hb-in-p', edge);
    var size = null, raf = 0, drawn = null;
    // Lay a question out the way the bubble will show it (balanced lines), and
    // read back its lines and the body size that fits them.
    function lay(q) {
      var words = q.split(' ');
      meas.textContent = '';
      var spans = words.map(function (w, i) {
        if (i) meas.appendChild(document.createTextNode(' '));
        var s = document.createElement('span'); s.textContent = w; meas.appendChild(s); return s;
      });
      var lines = [], top = null, width = 0;
      spans.forEach(function (s, i) {
        if (s.offsetTop !== top) { lines.push([]); top = s.offsetTop; }
        lines[lines.length - 1].push(i);
      });
      lines.forEach(function (l) {
        var a = spans[l[0]], b = spans[l[l.length - 1]];
        width = Math.max(width, b.offsetLeft + b.offsetWidth - a.offsetLeft);
      });
      var cs = getComputedStyle(meas);
      return {
        lines: lines.map(function (l) { return l.map(function (i) { return words[i]; }); }),
        w: Math.ceil(width + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)),
        h: meas.offsetHeight
      };
    }
    // The bubble's single outline: a rounded body w x h and a triangle off its
    // right edge, centred, with its two joins and its tip rounded so the glass,
    // rim and shadow all read as one piece.
    function outline(w, h, k) {
      var r = Math.min(30 * k, h / 2 - 20 * k), tw = 20 * k, tb = 30 * k, f = 6 * k, tr = 3.5 * k;
      var cy = h / 2, W = w + tw, y0 = cy - tb / 2, y1 = cy + tb / 2;
      var len = Math.sqrt(tw * tw + (tb / 2) * (tb / 2)), ux = tw / len, uy = (tb / 2) / len;
      function n(v) { return Math.round(v * 100) / 100; }
      return 'M' + n(r) + ' 0H' + n(w - r) + 'A' + n(r) + ' ' + n(r) + ' 0 0 1 ' + n(w) + ' ' + n(r) +
        'V' + n(y0 - f) + 'Q' + n(w) + ' ' + n(y0) + ' ' + n(w + ux * f) + ' ' + n(y0 + uy * f) +
        'L' + n(W - ux * tr) + ' ' + n(cy - uy * tr) + 'Q' + n(W) + ' ' + n(cy) + ' ' + n(W - ux * tr) + ' ' + n(cy + uy * tr) +
        'L' + n(w + ux * f) + ' ' + n(y1 - uy * f) + 'Q' + n(w) + ' ' + n(y1) + ' ' + n(w) + ' ' + n(y1 + f) +
        'V' + n(h - r) + 'A' + n(r) + ' ' + n(r) + ' 0 0 1 ' + n(w - r) + ' ' + n(h) + 'H' + n(r) +
        'A' + n(r) + ' ' + n(r) + ' 0 0 1 0 ' + n(h - r) + 'V' + n(r) + 'A' + n(r) + ' ' + n(r) + ' 0 0 1 ' + n(r) + ' 0Z';
    }
    // DRAW the outline at one size. This is the expensive half: a fresh mask
    // raster, five path rewrites and two SVG filter regions, so it runs ONCE
    // per question and NEVER inside the spring below. It used to run on every
    // frame, and on an iPhone that is a new SVG image decode, a re-derived
    // gaussian-blur region and a fresh backdrop snapshot sixty times a second
    // for a bubble sitting on top of a playing video.
    function paint(w, h) {
      var k = parseFloat(getComputedStyle(bub).fontSize) / 32, W = w + 20 * k, d = outline(w, h, k), pad = 80 * k;
      // A MASK, not clip-path: Chrome clips a clip-path element's paint but lets
      // its backdrop blur leak out to the bounding box, a square halo round the
      // bubble. A mask trims the blurred backdrop too.
      var m = 'url("data:image/svg+xml,' + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='" + W + "' height='" + h + "' viewBox='0 0 " + W + ' ' + h + "'><path d='" + d + "'/></svg>") + '")';
      glass.style.webkitMaskImage = glass.style.maskImage = m;
      // The viewport is set per frame by stretch(); the viewBox is what the
      // shape was drawn at, so the whole edge scales with the box instead of
      // being laid out again.
      edge.setAttribute('viewBox', '0 0 ' + W + ' ' + h);
      edge.setAttribute('preserveAspectRatio', 'none');
      rim.setAttribute('d', d); inP.setAttribute('d', d);
      glow.setAttribute('d', d); glow.setAttribute('stroke-width', 9 * k);
      shade.setAttribute('d', d); shade.setAttribute('transform', 'translate(0 ' + (12 * k) + ')');
      // The shadow is cut to the region OUTSIDE the bubble, or it would darken
      // the glass it is supposed to sit behind. That cut is a CLIP (one
      // even-odd path: a padded rectangle with the bubble punched out of it),
      // never an SVG <mask>: WebKit painted the mask's own white backing rect,
      // which is what laid a pale rectangle over the video beside the bubble.
      // The padding is the blur's reach, so the soft edge is not cut off square.
      maskP.setAttribute('d', 'M' + (-pad) + ' ' + (-pad) + 'H' + (W + pad) + 'V' + (h + pad) + 'H' + (-pad) + 'Z' + d);
      drawn = { k: k, w: w, h: h };
      stretch(w, h);
    }
    // FOLLOW the spring. The shape is already drawn, so a frame writes four
    // numbers: the mask stretches with the box (mask-size: 100% 100%) and the
    // edge stretches with its viewBox. The corner radii are a little off true
    // while it travels and exact the moment it lands, which is the trade a
    // morphing speech bubble can afford and a dropped frame is not.
    // TOP, not a translate: the backdrop blur is sampled wrong under a
    // transformed ancestor on iOS, which is what put the frosting beside the
    // bubble rather than inside it. The script knows the height, so it can
    // place the tip without one; the CSS keeps the -75% for the no-script box.
    function stretch(w, h) {
      var W = w + 20 * drawn.k;
      box.style.width = W + 'px'; box.style.height = h + 'px'; box.style.top = (-.75 * h) + 'px';
      edge.setAttribute('width', W); edge.setAttribute('height', h);
    }
    // Spring the outline to a new size (ease-out quint), from wherever it is.
    function sizeTo(w, h, animate) {
      cancelAnimationFrame(raf);
      if (!animate || !size) { size = { w: w, h: h }; paint(w, h); return; }
      var from = size, t0 = performance.now(), D = 640;
      // Draw the DESTINATION once, then travel to it: the shape is only ever
      // stretched on its way somewhere, and is exact once it arrives.
      paint(w, h); stretch(from.w, from.h);
      var step = function (now) {
        var p = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - p, 5);
        size = { w: from.w + (w - from.w) * e, h: from.h + (h - from.h) * e };
        stretch(size.w, size.h);
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }
    function build(L, animate) {
      var p = document.createElement('p'), n = 0;
      p.className = 'hb-text' + (animate ? ' in' : '');
      L.lines.forEach(function (line) {
        var row = document.createElement('span'); row.className = 'hb-line';
        line.forEach(function (w, i) {
          if (i) row.appendChild(document.createTextNode(' '));
          var s = document.createElement('span'); s.className = 'w'; s.textContent = w;
          if (animate) s.style.animationDelay = (230 + n * 45) + 'ms';
          n++; row.appendChild(s);
        });
        p.appendChild(row);
      });
      return p;
    }
    function show(i, animate) {
      var L = lay(CUES[i].q);
      sizeTo(L.w, L.h, animate);
      $$('.hb-text', glass).forEach(function (o) {
        if (!animate) return o.remove();
        o.classList.add('out');
        setTimeout(function () { o.remove(); }, 420);
      });
      glass.appendChild(build(L, animate));
      screens.forEach(function (s, j) { s.classList.toggle('on', j === i); });
      cur = i;
    }
    // Snap to the current question with no motion (first paint, fonts, resize).
    function settle() { show(cur, false); }
    bub.classList.add('live');
    settle();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(settle);
    var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(settle, 120); });
    function cueAt(t) { var k = 0; for (var j = 0; j < CUES.length; j++) if (t >= CUES[j].at) k = j; return k; }
    function tick(t) { var k = cueAt(t); if (k !== cur) show(k, !still); }
    if (heroLoop.requestVideoFrameCallback) {
      var onFrame = function (now, meta) { tick(meta.mediaTime); heroLoop.requestVideoFrameCallback(onFrame); };
      heroLoop.requestVideoFrameCallback(onFrame);
    } else {
      var onRaf = function () { if (!heroLoop.paused) tick(heroLoop.currentTime); requestAnimationFrame(onRaf); };
      requestAnimationFrame(onRaf);
    }
  })();

  // "Sound familiar?". Selections live in this closure only: no storage, no
  // analytics, no request. Each experience's lead match comes first, so all of
  // them are answered, then whatever answers the most of them.
  var COMBOS = ${JSON.stringify(COMBOS)}, FALLBACK = ${JSON.stringify(RESULTS_FALLBACK)};
  var EXP = ${JSON.stringify(EXPERIENCES)}, SHOWN = ${MATCHES_SHOWN}, opened = false, showAll = false;
  var panel = $('#matches'), cta = $('#fmCta'), title = $('#fmTitle'), sub = $('#fmSub'), more = $('#fmMore'), hint = $('#fmHint');
  function selected() {
    return EXP.filter(function (e) { return $('[data-exp="' + e.id + '"]').getAttribute('aria-pressed') === 'true'; });
  }
  function ranked(sel) {
    var seen = {}, list = [];
    sel.forEach(function (e, ei) {
      e.matches.forEach(function (m, mi) {
        if (!seen[m]) { seen[m] = { id: m, n: 0, pos: mi, ei: ei, why: [] }; list.push(seen[m]); }
        seen[m].n++;
        seen[m].pos = Math.min(seen[m].pos, mi);
        seen[m].why.push(e.text);
      });
    });
    return list.sort(function (a, b) { return (a.pos ? 1 : 0) - (b.pos ? 1 : 0) || b.n - a.n || a.pos - b.pos || a.ei - b.ei; });
  }
  function resultsCopy(sel) {
    if (sel.length === 1) return sel[0];
    var ids = sel.map(function (e) { return e.id; });
    return COMBOS.filter(function (c) {
      return c.ids.length === ids.length && c.ids.every(function (i) { return ids.indexOf(i) >= 0; });
    })[0] || FALLBACK;
  }
  function renderMatches() {
    var sel = selected(), list = ranked(sel), grid = $('#fmGrid');
    title.textContent = sel.length ? sel.length + (sel.length === 1 ? ' experience selected' : ' experiences selected') : 'Find your answers.';
    sub.textContent = sel.length ? 'See the features that match what you’re dealing with.' : 'Select what sounds familiar, and we’ll show you the Autonomic features that can help.';
    cta.setAttribute('aria-disabled', sel.length ? 'false' : 'true');
    if (sel.length) hint.hidden = true;
    var copy = resultsCopy(sel);
    $('#fmResultsT').textContent = copy.heading;
    $('#fmResultsS').textContent = copy.description;
    $$('[data-match]').forEach(function (c) { c.hidden = true; });
    list.forEach(function (m, i) {
      var c = $('[data-match="' + m.id + '"]');
      c.style.order = i;
      c.hidden = !showAll && i >= SHOWN;
      $('[data-match-why]', c).textContent = 'You said: ' + m.why.map(function (w) { return '“' + w + '”'; }).join(' and ');
    });
    var rest = list.length - SHOWN;
    more.hidden = showAll || rest <= 0;
    more.textContent = 'Show ' + rest + ' other ' + (rest === 1 ? 'feature' : 'features');
    if (!sel.length) { panel.hidden = true; opened = false; showAll = false; } else if (opened) panel.hidden = false;
  }
  $$('[data-exp]').forEach(function (b) {
    b.addEventListener('click', function () {
      b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
      renderMatches();
    });
  });
  if (cta) cta.addEventListener('click', function () {
    if (!selected().length) { hint.hidden = false; $('[data-exp]').focus(); return; }
    opened = true;
    renderMatches();
    panel.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
    $('#fmResultsT').focus({ preventScroll: true });
  });
  if (more) more.addEventListener('click', function () {
    var before = $$('[data-match]:not([hidden])').length;
    showAll = true;
    renderMatches();
    var next = $$('[data-match]:not([hidden])').sort(function (a, b) { return a.style.order - b.style.order; })[before];
    if (next) $('a', next).focus({ preventScroll: true });
  });

  var aw = $('#answersWrap'), ar = aw && $('.v2-answers', aw), aDots = $$('[data-answer-dot]'), aHint = $('#answersHint');
  function answersSync() {
    var atEnd = ar.scrollLeft + ar.clientWidth >= ar.scrollWidth - 8;
    aw.classList.toggle('at-start', ar.scrollLeft <= 8);
    aw.classList.toggle('at-end', atEnd);
    // By progress, not card position: wide screens cannot bring the last cards to the left edge.
    var max = ar.scrollWidth - ar.clientWidth, last = ar.children.length - 1;
    var i = max > 0 ? Math.round(ar.scrollLeft / max * last) : 0;
    aDots.forEach(function (b, n) {
      b.classList.toggle('on', n === i);
      if (n === i) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    });
    aHint.textContent = atEnd ? '← Swipe back' : 'Swipe to explore →';
  }
  if (ar) {
    ar.addEventListener('scroll', answersSync, { passive: true });
    window.addEventListener('resize', answersSync);
    function answersGo(n) {
      ar.scrollTo({ left: (ar.scrollWidth - ar.clientWidth) * n / (ar.children.length - 1), behavior: still ? 'auto' : 'smooth' });
    }
    aDots.forEach(function (b, n) { b.addEventListener('click', function () { answersGo(n); }); });
    aHint.addEventListener('click', function () {
      var now = aDots.findIndex(function (b) { return b.classList.contains('on'); });
      answersGo(now >= aDots.length - 1 ? 0 : now + 1);
    });
    answersSync();
  }

  // The live Training card (screens/SessionScreen.svelte): a simulated strap
  // beats with breath-driven heart rate swings (paced 4 in / 6 out, the RSA
  // wave real paced breathing produces), and every number and trace on the
  // card is computed from those beats, as the app's session store does: the
  // rings and phase word from the breath clock, heart rate from the last few
  // beats, SDNN over the session, EMA-smoothed sparklines and the RAW
  // beat-to-beat trace. Runs only while the card is on screen; reduced motion
  // gets one still frame.
  (function () {
    var roots = $$('[data-live-session]');
    if (!roots.length) return;
    var IN = 4, OUT = 6, CYCLE = IN + OUT, RINGS = 6;
    var easeSin = function (t) { return -(Math.cos(Math.PI * t) - 1) / 2; };
    var breath = function (t) {
      var c = ((t % CYCLE) + CYCLE) % CYCLE;
      return c < IN ? { phase: 'in', p: easeSin(c / IN) } : { phase: 'out', p: 1 - easeSin((c - IN) / OUT) };
    };
    var seed = 9;
    var rnd = function () { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    var gauss = function () { return Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd()); };
    // LiveStats.tsx, verbatim in spirit: smoothPath, ema, project.
    var smooth = function (pts) {
      if (pts.length < 2) return '';
      var d = 'M' + pts[0].x.toFixed(1) + ' ' + pts[0].y.toFixed(1);
      for (var i = 0; i < pts.length - 1; i++) {
        var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
        d += ' C' + (p1.x + (p2.x - p0.x) / 6).toFixed(1) + ' ' + (p1.y + (p2.y - p0.y) / 6).toFixed(1) + ' ' +
          (p2.x - (p3.x - p1.x) / 6).toFixed(1) + ' ' + (p2.y - (p3.y - p1.y) / 6).toFixed(1) + ' ' + p2.x.toFixed(1) + ' ' + p2.y.toFixed(1);
      }
      return d;
    };
    var ema = function (v, a) { var out = [], acc = v[0]; for (var i = 0; i < v.length; i++) { acc = a * v[i] + (1 - a) * acc; out.push(acc); } return out; };
    var project = function (vals, w, h, pad) {
      var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
      if (hi - lo < 1e-6) { lo -= 1; hi += 1; }
      return vals.map(function (v, i) { return { x: (i / (vals.length - 1)) * w, y: pad + (1 - (v - lo) / (hi - lo)) * (h - pad * 2) }; });
    };
    roots.forEach(function (root) {
      var q = function (sel) { return root.querySelector(sel); };
      var start = +root.getAttribute('data-start'), dur = +root.getAttribute('data-duration');
      var prog = q('.lv-prog'), C = +prog.getAttribute('data-c'), rings = root.querySelectorAll('.lv-r');
      var phaseEl = q('.lv-phase'), timeEl = q('.lv-time'), hrEl = q('.lv-hr'), sdEl = q('.lv-sdnn'), beatsEl = q('.lv-beats');
      var hrPath = q('.lv-hr-spark'), hrHead = q('.lv-hr-head'), sdPath = q('.lv-sdnn-spark'), sdHead = q('.lv-sdnn-head');
      var rrPath = q('.lv-rr-path'), rrHead = q('.lv-rr-head');
      // The strap: one beat at a time, heart rate riding the breath ~1 s late.
      var rrs = [], hrTrace = [], sdTrace = [], tNext = 0, drift = 0, sum = 0, sumSq = 0;
      var beat = function () {
        drift = 0.97 * drift + gauss() * 0.3;
        var hr = 57 + 13 * breath(tNext - 0.9).p + drift + gauss() * 0.8;
        var rr = 60000 / hr;
        rrs.push(rr); sum += rr; sumSq += rr * rr; tNext += rr / 1000;
        var last = rrs.slice(-4), m = last.reduce(function (a, b) { return a + b; }, 0) / last.length;
        hrTrace.push(Math.round(60000 / m)); if (hrTrace.length > 60) hrTrace.shift();
        var n = rrs.length, mean = sum / n, sd = Math.sqrt(Math.max(0, sumSq / n - mean * mean));
        sdTrace.push(Math.round(sd)); if (sdTrace.length > 60) sdTrace.shift();
      };
      while (tNext < start) beat();
      var setHead = function (el, pt) { el.setAttribute('cx', pt.x.toFixed(1)); el.setAttribute('cy', pt.y.toFixed(1)); };
      var drawBeats = function () {
        hrEl.textContent = hrTrace[hrTrace.length - 1];
        sdEl.textContent = sdTrace[sdTrace.length - 1];
        beatsEl.textContent = 'Clean · ' + rrs.length + ' beats';
        var hp = project(ema(hrTrace, 0.35), 150, 24, 3), sp = project(ema(sdTrace, 0.35), 150, 24, 3);
        hrPath.setAttribute('d', smooth(hp)); setHead(hrHead, hp[hp.length - 1]);
        sdPath.setAttribute('d', smooth(sp)); setHead(sdHead, sp[sp.length - 1]);
        var rp = project(rrs.slice(-48), 320, 88, 5);
        rrPath.setAttribute('d', smooth(rp)); setHead(rrHead, rp[rp.length - 1]);
      };
      var lastPhase = null;
      var drawFrame = function (st, elapsed) {
        var b = breath(st);
        for (var i = 0; i < rings.length; i++) {
          var near = Math.max(0, Math.min(1, (b.p - i / RINGS) * RINGS));
          rings[i].setAttribute('opacity', (0.12 + near * 0.88).toFixed(3));
          rings[i].setAttribute('stroke-width', (2 + near * 3).toFixed(2));
        }
        if (b.phase !== lastPhase) { phaseEl.textContent = b.phase === 'in' ? 'Breathe in' : 'Breathe out'; lastPhase = b.phase; }
        var remain = Math.max(0, Math.ceil(dur - elapsed));
        timeEl.textContent = Math.floor(remain / 60) + ':' + String(remain % 60).padStart(2, '0');
        prog.setAttribute('stroke-dashoffset', (C * (1 - elapsed / dur)).toFixed(1));
      };
      drawBeats(); drawFrame(start, start);
      if (still) return;
      // Simulated time runs on; the session clock loops back to 3:20 left
      // before it would finish, so the card never ends on a results screen.
      var t0 = null, base = start, raf = 0, on = false, LOOP = dur - 20 - start;
      var tick = function (now) {
        if (t0 === null) t0 = now - (base - start) * 1000;
        var st = start + (now - t0) / 1000;
        var grew = false;
        while (tNext <= st) { beat(); grew = true; }
        if (grew) drawBeats();
        drawFrame(st, start + ((st - start) % LOOP));
        base = st;
        if (on) raf = requestAnimationFrame(tick);
      };
      var play = function () { if (on) return; on = true; t0 = null; raf = requestAnimationFrame(tick); };
      var pause = function () { on = false; cancelAnimationFrame(raf); };
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) play(); else pause(); }); }).observe(root);
      } else play();
    });
  })();

  $$('[data-step]').forEach(function (b) {
    b.addEventListener('click', function () {
      var i = b.getAttribute('data-step');
      $$('[data-step]').forEach(function (o) { o.classList.toggle('on', o === b); });
      $$('[data-step-view]').forEach(function (v) { v.hidden = v.getAttribute('data-step-view') !== i; });
    });
  });

  var RANGES = ${JSON.stringify(RANGES)};
  $$('[data-range]').forEach(function (b) {
    b.addEventListener('click', function () {
      var r = RANGES[+b.getAttribute('data-range')];
      $$('[data-range]').forEach(function (o) { o.classList.toggle('on', o === b); });
      var i = b.getAttribute('data-range');
      $$('[data-range-view]').forEach(function (v) { v.hidden = v.getAttribute('data-range-view') !== i; });
      $('#rangeDelta').textContent = r.delta;
      $('#rangeNote').textContent = r.note;
    });
  });

})();
<\/script>`;
