/* charts.js — dependency-free SVG chart engine (line / area / bar, stacked or grouped)
   Every chart ships: hairline grid, thin marks, legend for >=2 series, crosshair
   tooltip, and a table-view twin (see Chart.tableHTML). */
(function (global) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var SURFACE = '#1a1a19';

  function el(name, attrs) {
    var n = document.createElementNS(NS, name);
    for (var k in attrs) if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
    return n;
  }

  function niceMax(v) {
    if (!isFinite(v) || v <= 0) return 1;
    var exp = Math.floor(Math.log10(v));
    var base = Math.pow(10, exp);
    var f = v / base;
    var step = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    return step * base;
  }

  function ticks(min, max, count) {
    if (max === min) max = min + 1;
    var span = niceMax((max - min) / (count || 5));
    var out = [];
    var start = Math.floor(min / span) * span;
    // run past `max` so the top tick always sits at or above the largest value —
    // otherwise the tallest mark renders outside the plot area
    for (var v = start; ; v += span) {
      out.push(+v.toFixed(10));
      if (v >= max - span * 0.001) break;
      if (out.length > 40) break;
    }
    return out;
  }

  function fmtCompact(n) {
    if (n === null || n === undefined || isNaN(n)) return '–';
    var a = Math.abs(n);
    if (a >= 1e9) return (n / 1e9).toFixed(a >= 1e10 ? 0 : 1).replace(/\.0$/, '') + 'B';
    if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
    if (a >= 1e4) return (n / 1e3).toFixed(0) + 'k';
    if (a >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
    if (Number.isInteger(n)) return String(n);
    return String(+n.toFixed(2));
  }

  /* rounded-top rectangle anchored to the baseline (4px data-end radius) */
  function barPath(x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h));
    if (h <= 0.5) return '';
    return 'M' + x + ',' + (y + h) +
      'L' + x + ',' + (y + r) +
      'Q' + x + ',' + y + ' ' + (x + r) + ',' + y +
      'L' + (x + w - r) + ',' + y +
      'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) +
      'L' + (x + w) + ',' + (y + h) + 'Z';
  }

  function linePath(pts) {
    var d = '', open = false;
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      if (p === null) { open = false; continue; }
      d += (open ? 'L' : 'M') + p[0].toFixed(2) + ',' + p[1].toFixed(2);
      open = true;
    }
    return d;
  }

  /* ---------- main render ---------- */

  function render(container, cfg) {
    container.innerHTML = '';
    cfg.height = cfg.height || 300;

    var visible = cfg.series.filter(function (s) { return !s.hidden; });
    var hasData = cfg.x.length > 0 && visible.length > 0;

    // legend (always for >= 2 series; a single series is named by the card title)
    if (cfg.series.length >= 2 && cfg.legend !== false) {
      var lg = document.createElement('div');
      lg.className = 'legend';
      cfg.series.forEach(function (s) {
        var b = document.createElement('button');
        b.className = 'item';
        b.type = 'button';
        b.setAttribute('aria-pressed', s.hidden ? 'false' : 'true');
        b.innerHTML = '<span class="swatch" style="background:' + s.color +
          (s.type === 'marker' ? ';height:2px;border-radius:1px' : '') +
          (s.dashed ? ';opacity:.6' : '') + '"></span>' + escapeHTML(s.name);
        b.title = 'Show / hide ' + s.name;
        b.onclick = function () {
          if (!s.hidden && visible.length === 1) return; // keep at least one
          s.hidden = !s.hidden;
          render(container, cfg);
        };
        lg.appendChild(b);
      });
      container.appendChild(lg);
    }

    var wrap = document.createElement('div');
    wrap.className = 'chart-wrap';
    container.appendChild(wrap);

    if (!hasData) {
      var e = document.createElement('div');
      e.className = 'empty';
      e.textContent = cfg.emptyText || 'No data in this range yet.';
      wrap.appendChild(e);
      return;
    }

    var W = Math.max(280, wrap.clientWidth || container.clientWidth || 640);
    var H = cfg.height;
    var pad = { l: 56, r: 16, t: 12, b: 30 };
    var iw = W - pad.l - pad.r;
    var ih = H - pad.t - pad.b;
    var n = cfg.x.length;

    var stacked = !!cfg.stacked;
    var barSeries = visible.filter(function (s) { return s.type === 'bar'; });

    // y domain
    var maxV = 0, minV = 0;
    if (stacked) {
      for (var i = 0; i < n; i++) {
        var sum = 0;
        visible.forEach(function (s) { sum += num(s.values[i]); });
        if (sum > maxV) maxV = sum;
      }
    } else {
      visible.forEach(function (s) {
        for (var i = 0; i < n; i++) {
          var v = s.values[i];
          if (v === null || v === undefined || isNaN(v)) continue;
          if (v > maxV) maxV = v;
          if (v < minV) minV = v;
          if (s.base) {  // a band's lower edge can sit below its upper values
            var lo = s.base[i];
            if (lo !== null && lo !== undefined && !isNaN(lo)) {
              if (lo > maxV) maxV = lo;
              if (lo < minV) minV = lo;
            }
          }
        }
      });
    }
    if (cfg.yMax !== undefined) maxV = Math.max(maxV, cfg.yMax);
    var yt = ticks(Math.min(0, minV), maxV || 1, 5);
    var yTop = yt[yt.length - 1], yBot = yt[0];

    function yPos(v) { return pad.t + ih - ((num(v) - yBot) / (yTop - yBot || 1)) * ih; }

    var band = iw / n;
    function xCenter(i) { return pad.l + band * (i + 0.5); }

    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, height: H, role: 'img' });
    svg.setAttribute('aria-label', cfg.ariaLabel || cfg.title || 'chart');

    // gridlines (solid hairlines, one shade off the surface)
    yt.forEach(function (t) {
      var y = yPos(t);
      svg.appendChild(el('line', { x1: pad.l, x2: W - pad.r, y1: y, y2: y, stroke: '#2c2c2a', 'stroke-width': 1 }));
      var lbl = el('text', {
        x: pad.l - 9, y: y + 4, 'text-anchor': 'end', fill: '#898781',
        'font-size': 11, 'font-family': 'system-ui, sans-serif', style: 'font-variant-numeric:tabular-nums'
      });
      lbl.textContent = (cfg.yTickFormat || fmtCompact)(t);
      svg.appendChild(lbl);
    });
    // baseline
    svg.appendChild(el('line', { x1: pad.l, x2: W - pad.r, y1: yPos(Math.max(0, yBot)), y2: yPos(Math.max(0, yBot)), stroke: '#383835', 'stroke-width': 1 }));

    // x labels — thinned so they never collide
    var maxLabels = Math.max(2, Math.floor(iw / 74));
    var stepL = Math.ceil(n / maxLabels);
    for (var i = 0; i < n; i++) {
      if (i % stepL !== 0 && i !== n - 1) continue;
      if (i !== n - 1 && n - 1 - i < stepL * 0.6) continue;
      var tx = el('text', {
        x: xCenter(i), y: H - 10, 'text-anchor': 'middle', fill: '#898781',
        'font-size': 11, 'font-family': 'system-ui, sans-serif'
      });
      tx.textContent = cfg.x[i].label;
      svg.appendChild(tx);
    }

    // ---- marks ----
    // areas first (they stack bottom-up), then bars, then lines on top — so the
    // series array can lead with the headline line without it being buried
    var stackTop = new Array(n).fill(0);

    function drawPath(s) {
      var pts = [], basePts = [], tops = [];
      for (var i = 0; i < n; i++) {
        var v = s.values[i];
        if (v === null || v === undefined || isNaN(v)) { pts.push(null); basePts.push(null); tops.push(null); continue; }
        var isStackedArea = stacked && s.type === 'area';
        var b = isStackedArea ? stackTop[i] : (s.base ? num(s.base[i]) : 0);
        var top = isStackedArea ? b + v : v;
        tops.push(top);
        pts.push([xCenter(i), yPos(top)]);
        basePts.push([xCenter(i), yPos(b)]);
        if (isStackedArea) stackTop[i] = top;
      }
      s._top = tops;
      if ((s.type === 'area' || s.type === 'band') && pts.filter(Boolean).length) {
        var back = basePts.filter(Boolean).reverse();
        var d = linePath(pts) + 'L' + back.map(function (p) { return p[0].toFixed(2) + ',' + p[1].toFixed(2); }).join('L') + 'Z';
        svg.appendChild(el('path', {
          d: d, fill: s.color,
          'fill-opacity': stacked ? 0.5 : (s.type === 'band' ? 0.16 : 0.13), stroke: 'none'
        }));
        // 2px surface gap between stacked fills
        if (stacked) svg.appendChild(el('path', { d: linePath(pts), fill: 'none', stroke: SURFACE, 'stroke-width': 2 }));
      }
      if (s.type === 'band') return;
      svg.appendChild(el('path', {
        d: linePath(pts), fill: 'none', stroke: s.color,
        'stroke-width': s.type === 'area' ? 1.5 : 2,
        'stroke-linecap': 'round', 'stroke-linejoin': 'round',
        'stroke-dasharray': s.dashed ? '5 4' : null
      }));
      // a single-point series still needs to be visible
      if (pts.filter(Boolean).length === 1) {
        var p0 = pts.filter(Boolean)[0];
        svg.appendChild(el('circle', { cx: p0[0], cy: p0[1], r: 4, fill: s.color, stroke: SURFACE, 'stroke-width': 2 }));
      }
    }

    visible.filter(function (s) { return s.type === 'area' || s.type === 'band'; }).forEach(drawPath);

    if (barSeries.length) {
      var gap = 2;
      var groupW = band * 0.72;
      var slotW = stacked ? groupW : (groupW - gap * (barSeries.length - 1)) / barSeries.length;
      var stackAcc = new Array(n).fill(0);
      barSeries.forEach(function (s, bi) {
        for (var i = 0; i < n; i++) {
          var v = num(s.values[i]);
          if (!v) continue;
          var x = stacked
            ? xCenter(i) - groupW / 2
            : xCenter(i) - groupW / 2 + bi * (slotW + gap);
          var y0 = stacked ? yPos(stackAcc[i]) : yPos(0);
          var y1 = stacked ? yPos(stackAcc[i] + v) : yPos(v);
          var h = Math.abs(y0 - y1) - (stacked && stackAcc[i] > 0 ? gap : 0);
          svg.appendChild(el('path', {
            d: barPath(x, Math.min(y0, y1), slotW, Math.max(0, h), 4), fill: s.color,
            'fill-opacity': s.dashed ? 0.5 : 0.92
          }));
          if (stacked) stackAcc[i] += v;
        }
      });
    }

    // reference ticks sit on top of the bars they annotate
    visible.filter(function (s) { return s.type === 'marker'; }).forEach(function (s) {
      var w = band * 0.84;   // overhangs the bar (0.72) so it reads as a reference tick
      for (var i = 0; i < n; i++) {
        var v = s.values[i];
        if (v === null || v === undefined || isNaN(v)) continue;
        var y = yPos(v);
        svg.appendChild(el('line', {
          x1: xCenter(i) - w / 2, x2: xCenter(i) + w / 2, y1: y, y2: y,
          stroke: s.color, 'stroke-width': 2, 'stroke-linecap': 'round'
        }));
      }
    });

    visible.filter(function (s) {
      return s.type !== 'area' && s.type !== 'bar' && s.type !== 'band' && s.type !== 'marker';
    }).forEach(drawPath);

    // ---- hover layer ----
    var hoverG = el('g', { style: 'pointer-events:none' });
    var crosshair = el('line', { y1: pad.t, y2: pad.t + ih, stroke: '#c3c2b7', 'stroke-width': 1, opacity: 0 });
    hoverG.appendChild(crosshair);
    var dots = [];
    visible.forEach(function (s) {
      var c = el('circle', { r: 4, fill: s.color, stroke: SURFACE, 'stroke-width': 2, opacity: 0 });
      hoverG.appendChild(c);
      dots.push({ s: s, node: c });
    });
    svg.appendChild(hoverG);

    var hit = el('rect', { x: pad.l, y: pad.t, width: iw, height: ih, fill: 'transparent', style: 'cursor:crosshair' });
    svg.appendChild(hit);
    wrap.appendChild(svg);

    var tip = document.createElement('div');
    tip.className = 'tooltip';
    wrap.appendChild(tip);

    function show(idx, clientX) {
      var cx = xCenter(idx);
      crosshair.setAttribute('x1', cx); crosshair.setAttribute('x2', cx);
      crosshair.setAttribute('opacity', 0.45);
      dots.forEach(function (d) {
        var top = d.s._top ? d.s._top[idx] : null;
        if (top === null || top === undefined ||
            d.s.type === 'bar' || d.s.type === 'band' || d.s.type === 'marker') {
          d.node.setAttribute('opacity', 0); return;
        }
        d.node.setAttribute('cx', cx);
        d.node.setAttribute('cy', yPos(top));
        d.node.setAttribute('opacity', 1);
      });

      var rows = visible.map(function (s) {
        var v = s.values[idx];
        var f = s.format || cfg.format || fmtCompact;
        var txt = (v === null || v === undefined || isNaN(v)) ? '–' : f(v);
        if (s.base) {
          var lo = s.base[idx];
          txt = (lo === null || lo === undefined || isNaN(lo)) ? txt : f(lo) + ' – ' + txt;
        }
        return '<div class="tt-row"><span class="swatch" style="background:' + s.color + '"></span>' +
          escapeHTML(s.name) + '<span class="n">' + txt + '</span></div>';
      }).join('');
      var note = cfg.tooltipNote ? '<div class="tt-note">' + cfg.tooltipNote(idx) + '</div>' : '';
      tip.innerHTML = '<div class="tt-title">' + escapeHTML(cfg.x[idx].full || cfg.x[idx].label) + '</div>' + rows + note;
      tip.classList.add('on');

      var wrapBox = wrap.getBoundingClientRect();
      var px = (cx / W) * wrapBox.width;
      var tw = tip.offsetWidth;
      var left = px + 14;
      if (left + tw > wrapBox.width) left = px - tw - 14;
      if (left < 0) left = 4;
      tip.style.left = left + 'px';
      tip.style.top = Math.max(4, (pad.t / H) * wrapBox.height) + 'px';
    }

    function hide() {
      crosshair.setAttribute('opacity', 0);
      dots.forEach(function (d) { d.node.setAttribute('opacity', 0); });
      tip.classList.remove('on');
    }

    function indexFromEvent(ev) {
      var box = svg.getBoundingClientRect();
      var xPix = ((ev.clientX - box.left) / box.width) * W;
      var idx = Math.floor((xPix - pad.l) / band);
      return Math.max(0, Math.min(n - 1, idx));
    }

    hit.addEventListener('mousemove', function (ev) { show(indexFromEvent(ev), ev.clientX); });
    hit.addEventListener('mouseleave', hide);
    hit.addEventListener('touchstart', function (ev) {
      if (ev.touches[0]) show(indexFromEvent(ev.touches[0]));
    }, { passive: true });
    hit.addEventListener('touchmove', function (ev) {
      if (ev.touches[0]) show(indexFromEvent(ev.touches[0]));
    }, { passive: true });

    // keyboard access mirrors hover
    svg.setAttribute('tabindex', '0');
    var kIdx = 0;
    svg.addEventListener('keydown', function (ev) {
      if (ev.key === 'ArrowRight') { kIdx = Math.min(n - 1, kIdx + 1); show(kIdx); ev.preventDefault(); }
      else if (ev.key === 'ArrowLeft') { kIdx = Math.max(0, kIdx - 1); show(kIdx); ev.preventDefault(); }
      else if (ev.key === 'Escape') hide();
    });
    svg.addEventListener('blur', hide);
  }

  function num(v) { return (v === null || v === undefined || isNaN(v)) ? 0 : +v; }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* table-view twin for any chart config */
  function tableHTML(cfg) {
    var head = '<tr><th>' + escapeHTML(cfg.xLabel || 'Period') + '</th>' +
      cfg.series.map(function (s) { return '<th>' + escapeHTML(s.name) + '</th>'; }).join('') + '</tr>';
    var body = cfg.x.map(function (x, i) {
      return '<tr><td>' + escapeHTML(x.full || x.label) + '</td>' + cfg.series.map(function (s) {
        var v = s.values[i];
        var f = s.format || cfg.format || fmtCompact;
        var txt = (v === null || v === undefined || isNaN(v)) ? '–' : f(v);
        if (s.base) {
          var lo = s.base[i];
          if (lo !== null && lo !== undefined && !isNaN(lo)) txt = f(lo) + ' – ' + txt;
        }
        return '<td>' + txt + '</td>';
      }).join('') + '</tr>';
    }).join('');
    return '<div class="table-scroll"><table><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';
  }

  /* tiny sparkline for stat tiles */
  function sparkline(values, color, w, h) {
    w = w || 96; h = h || 26;
    var vals = values.map(num);
    if (!vals.length) return '';
    var max = Math.max.apply(null, vals), min = Math.min(0, Math.min.apply(null, vals));
    var span = (max - min) || 1;
    var pts = vals.map(function (v, i) {
      var x = vals.length === 1 ? w / 2 : (i / (vals.length - 1)) * w;
      var y = h - ((v - min) / span) * (h - 3) - 1.5;
      return x.toFixed(1) + ',' + y.toFixed(1);
    });
    return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true">' +
      '<polyline fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" points="' + pts.join(' ') + '"/></svg>';
  }

  global.Chart = {
    render: render, tableHTML: tableHTML, sparkline: sparkline,
    fmtCompact: fmtCompact, escapeHTML: escapeHTML
  };
})(window);
