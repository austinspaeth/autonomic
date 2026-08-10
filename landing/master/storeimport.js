/* storeimport.js — read the CSVs App Store Connect and Play Console hand you.
 *
 * The dashboard's own CSV is one wide file with a fixed header, and `importCSV`
 * in app.js still owns that. The store consoles export something else entirely:
 * App Store Connect's Analytics view downloads ONE FILE PER CHART, so a day's
 * impressions and that same day's downloads arrive as two separate files, and
 * Play Console's reports arrive as UTF-16 CSVs with their own column names.
 * Feeding either to `importCSV` would fail on the header and, worse, its
 * missing-column-means-zero rule would blank out every metric the file didn't
 * carry. This module exists to read those files instead.
 *
 * Everything here is pure — text in, a plan out — so it can be unit-tested
 * without a DOM (tests/store-import.test.mjs). app.js owns the UI and is the
 * only thing that touches `db`.
 *
 * Two rules the rest of the design follows from:
 *
 *   - A file states only the metrics it actually contains. An impressions-only
 *     export must leave that day's downloads alone, so the plan carries fields
 *     rather than whole rows and a metric that parsed to nothing is `null`,
 *     never 0. A real zero and a missing column are different facts.
 *   - Column matching is a guess, and the exports change. Nothing commits
 *     without the caller showing what was matched, which is why `readFile`
 *     reports every column it saw — mapped, ignored as a dimension, or
 *     unrecognised — and `plan` accepts overrides for all of them.
 */
(function () {
  'use strict';

  var FIELDS = ['downloads', 'impressions', 'pageViews', 'updates', 'sales', 'revenue'];

  /* ------------------------------------------------------------ decoding */

  /* Play Console's statistics CSVs are UTF-16, which is the single most common
     reason a Play export "imports" as one row of mojibake: read as UTF-8 the
     header comes back with a NUL between every letter and matches nothing. */
  function decode(buffer) {
    var b = new Uint8Array(buffer);
    if (b[0] === 0xFF && b[1] === 0xFE) return new TextDecoder('utf-16le').decode(b.subarray(2));
    if (b[0] === 0xFE && b[1] === 0xFF) return new TextDecoder('utf-16be').decode(b.subarray(2));
    if (b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) return new TextDecoder('utf-8').decode(b.subarray(3));
    // No BOM, but ASCII text held as UTF-16LE still has a zero for every high byte.
    if (b.length > 8 && b[1] === 0 && b[3] === 0 && b[5] === 0) return new TextDecoder('utf-16le').decode(b);
    return new TextDecoder('utf-8').decode(b);
  }

  function sniffDelimiter(text) {
    var head = text.slice(0, 8000), best = ',', bestN = -1;
    [',', '\t', ';'].forEach(function (d) {
      var n = head.split(d).length - 1;
      if (n > bestN) { bestN = n; best = d; }
    });
    return bestN > 0 ? best : ',';
  }

  function parseRows(text, delim) {
    var rows = [], row = [], cell = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === delim) { row.push(cell); cell = ''; }
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (ch !== '\r') cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (c) { return c.trim() !== ''; }); });
  }

  /* ------------------------------------------------------- dates + values */

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /* Returns YYYY-MM-DD or null. Deliberately strict: a bare number is a value,
     not a year, or every metric column would look like a date column. Non-ISO
     strings are read off local calendar fields rather than toISOString(), which
     would shift "Aug 1, 2026" back a day for anyone east of UTC. */
  function parseDate(s) {
    s = String(s == null ? '' : s).trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);          // US m/d/y
    if (m) return m[3] + '-' + pad(+m[1]) + '-' + pad(+m[2]);
    m = s.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/);          // y/m/d, y.m.d
    if (m) return m[1] + '-' + pad(+m[2]) + '-' + pad(+m[3]);
    if (!/[A-Za-z]/.test(s) || !/\d/.test(s)) return null;       // needs a month name by now
    var d = new Date(s);
    if (isNaN(d.getTime())) return null;
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /* null, not 0, when there is no number here: the difference between "this
     file says zero" and "this file does not mention this metric" is the whole
     reason a partial import is safe. */
  function parseValue(s) {
    s = String(s == null ? '' : s).trim();
    if (!s || /^(n\/?a|-|--|—|null)$/i.test(s)) return null;
    if (/%$/.test(s)) return null;                                // rates are derived, never stored
    var mult = /k$/i.test(s) ? 1e3 : /m$/i.test(s) ? 1e6 : 1;     // the UI export can carry "1.2K"
    var neg = /^\(.*\)$/.test(s) || /^-/.test(s);                 // (1.23) is how a refund shows up
    var n = parseFloat(s.replace(/[^0-9.]/g, ''));
    if (isNaN(n)) return null;
    return (neg ? -1 : 1) * n * mult;
  }

  function norm(h) { return String(h == null ? '' : h).toLowerCase().replace(/[^a-z0-9]/g, ''); }

  /* ---------------------------------------------------- column vocabulary */

  function anchored(names) { return new RegExp('^(?:' + names.join('|') + ')$'); }

  var DATE_RE = /^(date|day|startdate|reportdate|period|eventdate)$/;
  var PLATFORM_RE = /^(platform|os|store|operatingsystem)$/;

  /* Columns that describe a breakdown rather than a measure. They are not
     failures to report — a territory-split export is legitimate, its rows just
     need summing per date — so they are recognised explicitly and the leftovers
     can be surfaced as genuinely unknown.

     Anchored, and it has to be: as substrings these swallow metrics whole.
     "Daily Device Installs" is Play's download count, not a device breakdown. */
  var DIMENSION_RE = anchored([
    'packagename', 'appname', 'appid', 'appleidentifier', 'sku', 'vendoridentifier',
    'territory', 'country', 'countryregion', 'region', 'market',
    'device', 'devicetype', 'platformversion', 'osversion', 'appversion', 'version',
    'source', 'sourcetype', 'sourceinfo', 'campaign', 'pagetype', 'pagetitle',
    'utmsource', 'utmcampaign', 'utmmedium', 'utmcontent', 'utmterm',
    'trafficsource', 'acquisitionchannel',
    // Play's acquisition report splits by these before it gets to a number.
    'searchterm', 'searchterms', 'customstorelisting', 'storelisting', 'listingid',
    'currency', 'currencycode', 'carrier', 'language', 'subscriptionname',
    'conversionrate', 'convrate', 'taprate', 'tapthrough', 'tapthroughrate', 'proceedsreason',
    'notes', 'note'
  ]);

  /* Ordered by how specific the phrase is, low rank winning, because a file can
     carry two columns that both mean the same dashboard field ("First-Time
     Downloads" beside "Total Downloads") and the choice should not come down to
     which one the console happened to print first.

     Apple's `Sales` is money, not a count — it is customer spend before Apple's
     cut, the sibling of `Proceeds`. Mapping it to the dashboard's `sales`, which
     counts conversions, would quietly put dollars in a count column, so it maps
     to revenue at a worse rank than Proceeds and loses to it when both appear. */
  var PATTERNS = [
    { re: /^(firsttimedownloads?|firsttimeinstalls?)$/, field: 'downloads', rank: 0 },
    { re: /storelistingacquisitions?|dailydeviceinstalls?|dailyuserinstalls?|newusersacquired/, field: 'downloads', rank: 1 },
    { re: /^(totaldownloads?|downloads?|installs?|installevents?|units?)$/, field: 'downloads', rank: 2 },
    { re: /download|acquisition|install/, field: 'downloads', rank: 4 },

    { re: /^(uniqueimpressions?|impressionsuniquedevices)$/, field: 'impressions', rank: 0 },
    { re: /^(impressions?|storelistingimpressions?)$/, field: 'impressions', rank: 1 },
    { re: /impression/, field: 'impressions', rank: 3 },

    { re: /^(productpageviews?|productpageviewsuniquedevices)$/, field: 'pageViews', rank: 0 },
    { re: /storelistingvisitors?|storelistingviews?|listingvisitors?/, field: 'pageViews', rank: 1 },
    { re: /pageview|productpage/, field: 'pageViews', rank: 3 },

    { re: /^(updates?|appupdates?|updateevents?)$/, field: 'updates', rank: 0 },
    { re: /update/, field: 'updates', rank: 3 },

    { re: /^(proceeds|developerproceeds|estimatedrevenue|revenue|salesamount|chargedamount|earnings)$/, field: 'revenue', rank: 0 },
    { re: /^(sales|totalsales|customerspend|grossrevenue|amount|total)$/, field: 'revenue', rank: 1 },
    { re: /proceed|revenue|earning/, field: 'revenue', rank: 3 },

    { re: /^(salescount|purchases?|transactions?|buyers?|paidusers?|conversions?)$/, field: 'sales', rank: 0 },
    { re: /buyer|purchaser|paidsubscri/, field: 'sales', rank: 2 }
  ];

  function classify(header) {
    var h = norm(header);
    if (!h) return { kind: 'empty' };
    if (DATE_RE.test(h)) return { kind: 'date' };
    if (PLATFORM_RE.test(h)) return { kind: 'platform' };
    if (DIMENSION_RE.test(h)) return { kind: 'dimension' };
    for (var i = 0; i < PATTERNS.length; i++) {
      if (PATTERNS[i].re.test(h)) return { kind: 'metric', field: PATTERNS[i].field, rank: PATTERNS[i].rank };
    }
    return { kind: 'unknown' };
  }

  /* ------------------------------------------------------------- platform */

  function detectPlatform(name, headers) {
    var n = norm(name);
    if (/play|android|googleplay/.test(n)) return 'android';
    if (/appstore|appleid|apple|ios|itunes|asc/.test(n)) return 'ios';
    var h = headers.map(norm).join(' ');
    if (/packagename|storelisting|dailydeviceinstall|googleplay/.test(h)) return 'android';
    if (/territory|proceeds|productpage|appleidentifier|vendoridentifier/.test(h)) return 'ios';
    return null;   // the caller has to ask; guessing wrong files a month under the wrong store
  }

  /* --------------------------------------------------------- header hunt */

  /* Consoles put a title, a date range and a blank line above the real header,
     and the number of preamble lines is not stable between exports. So the
     header is found rather than assumed: the first row that names a date column
     and at least one other thing, or failing that the row directly above the
     first row that contains a parsable date. */
  function findHeader(rows) {
    var limit = Math.min(rows.length, 25), i, j;
    for (i = 0; i < limit; i++) {
      var kinds = rows[i].map(function (c) { return classify(c).kind; });
      if (kinds.indexOf('date') !== -1 && kinds.length > 1) return i;
      // A pivoted export runs dates across the header instead.
      var dates = rows[i].slice(1).filter(function (c) { return parseDate(c); }).length;
      if (dates >= 3 && dates >= rows[i].length - 2) return i;
    }
    for (i = 0; i < limit; i++) {
      for (j = 0; j < rows[i].length; j++) {
        if (parseDate(rows[i][j]) && i > 0) return i - 1;
      }
    }
    return rows.length ? 0 : -1;
  }

  function isPivoted(header) {
    var dates = header.slice(1).filter(function (c) { return parseDate(c); }).length;
    return dates >= 3 && dates >= header.length - 2;
  }

  /* ---------------------------------------------------------- accumulate */

  function readPlatformCell(v) {
    var s = norm(v);
    if (!s) return null;
    if (/android|google|play/.test(s)) return 'android';
    if (/ios|apple|iphone|appstore/.test(s)) return 'ios';
    return null;
  }

  /* Data rows in, `{ date: { field: value } }` out, rows sharing a date summed —
     which is what a territory- or device-split export needs. A file carrying its
     own platform column (the dashboard's own CSV round-trips through here) is
     split into one map per platform instead, so a mixed file cannot collapse
     both stores onto whichever platform the filename happened to suggest. */
  function accumulate(re, dataRows) {
    var days = {}, byPlatform = null;
    dataRows.forEach(function (r) {
      var date = parseDate(r[re.dateColumn]);
      if (!date) { re.rowsSkipped++; return; }
      re.rowsRead++;
      var plat = re.platformColumn >= 0 ? readPlatformCell(r[re.platformColumn]) : null;
      var bucket = days;
      if (plat) {
        byPlatform = byPlatform || {};
        bucket = byPlatform[plat] = byPlatform[plat] || {};
      }
      var into = bucket[date] = bucket[date] || {};
      re.columns.forEach(function (col) {
        if (col.kind !== 'metric' || !col.field) return;
        var v = parseValue(r[col.index]);
        if (v === null) return;
        into[col.field] = (into[col.field] || 0) + v;
      });
    });
    re.days = days;
    re.byPlatform = byPlatform;
    var seen = {};
    Object.keys(days).forEach(function (d) { seen[d] = 1; });
    if (byPlatform) {
      Object.keys(byPlatform).forEach(function (p) {
        Object.keys(byPlatform[p]).forEach(function (d) { seen[d] = 1; });
      });
    }
    re.dates = Object.keys(seen).sort();
  }

  /* ------------------------------------------------------------ read one */

  /* Returns a description of the file, NOT a mutation: what was matched, what
     was ignored, and the per-day values that follow from that. Rows sharing a
     date are summed, which is what a territory- or device-split export needs. */
  function readFile(name, text) {
    var delim = sniffDelimiter(text);
    var rows = parseRows(text, delim);
    var out = {
      name: name, delimiter: delim, pivoted: false, columns: [], days: {},
      dates: [], rowsRead: 0, rowsSkipped: 0, warnings: [], platform: null
    };
    if (!rows.length) { out.warnings.push('The file is empty.'); return out; }

    var hi = findHeader(rows);
    if (hi < 0) { out.warnings.push('No header row found.'); return out; }
    var header = rows[hi];
    out.headerIndex = hi;
    out.platform = detectPlatform(name, header);
    out.pivoted = isPivoted(header);

    if (out.pivoted) {
      /* metric down the side, dates across the top */
      out.columns.push({ index: 0, header: header[0] || 'Metric', kind: 'metricname' });
      rows.slice(hi + 1).forEach(function (r) {
        var c = classify(r[0]);
        if (c.kind !== 'metric') { out.rowsSkipped++; return; }
        out.rowsRead++;
        for (var j = 1; j < header.length; j++) {
          var date = parseDate(header[j]), v = parseValue(r[j]);
          if (!date || v === null) continue;
          if (!out.days[date]) out.days[date] = {};
          out.days[date][c.field] = (out.days[date][c.field] || 0) + v;
        }
      });
      out.dates = Object.keys(out.days).sort();
    } else {
      var dateCol = -1, platCol = -1, best = {};
      header.forEach(function (h, j) {
        var c = classify(h);
        var col = { index: j, header: String(h || '').trim(), kind: c.kind, field: c.field || null, rank: c.rank };
        if (c.kind === 'date' && dateCol === -1) dateCol = j;
        if (c.kind === 'platform' && platCol === -1) platCol = j;
        if (c.kind === 'metric') {
          // Two columns for one field: the more specific phrasing wins, the
          // other is reported as superseded rather than silently dropped.
          var prev = best[c.field];
          if (prev && prev.rank <= c.rank) { col.kind = 'superseded'; col.field = null; }
          else {
            if (prev) { prev.kind = 'superseded'; prev.field = null; }
            best[c.field] = col;
          }
        }
        out.columns.push(col);
      });

      /* A single-metric export sometimes labels its date column with the metric
         name, or nothing at all. Fall back to the first column that parses as
         dates all the way down. */
      if (dateCol === -1) {
        for (var j = 0; j < header.length; j++) {
          var hits = 0, seen = 0;
          rows.slice(hi + 1, hi + 6).forEach(function (r) { seen++; if (parseDate(r[j])) hits++; });
          if (seen && hits === seen) { dateCol = j; break; }
        }
        if (dateCol !== -1) {
          out.columns[dateCol].kind = 'date';
          out.columns[dateCol].field = null;
          out.warnings.push('Used column "' + (out.columns[dateCol].header || dateCol + 1) + '" as the date.');
        }
      }
      if (dateCol === -1) { out.warnings.push('No date column found.'); return out; }
      out.dateColumn = dateCol;
      out.platformColumn = platCol;
      accumulate(out, rows.slice(hi + 1));
    }

    if (!out.dates.length && !out.warnings.length) {
      out.warnings.push('No dated rows matched — check the column mapping below.');
    }
    return out;
  }

  /* ---------------------------------------------------------------- plan */

  /* Folds the read files into the rows the dashboard will merge. `overrides` is
     the preview's edits: { <file name>: { platform: 'ios', columns: { <index>:
     'impressions' | '' } } }. Re-reading is the caller's job — an override on a
     column changes only which field that column feeds, so the file is re-run
     through readFile with the overrides applied by `applyOverrides` first. */
  function plan(files) {
    var byKey = {}, order = [], conflicts = [], missingPlatform = [];
    files.forEach(function (f) {
      /* A file states its platform one of two ways: a column of its own, or the
         single platform the whole file belongs to. Both can be true at once when
         some rows name a store the file's own column didn't recognise. */
      var groups = [];
      if (f.byPlatform) {
        Object.keys(f.byPlatform).forEach(function (p) { groups.push({ platform: p, days: f.byPlatform[p] }); });
      }
      if (f.days && Object.keys(f.days).length) {
        if (f.platform) groups.push({ platform: f.platform, days: f.days });
        else missingPlatform.push(f.name);
      }

      groups.forEach(function (g) {
        Object.keys(g.days).forEach(function (date) {
          var key = date + '|' + g.platform;
          if (!byKey[key]) { byKey[key] = { date: date, platform: g.platform, fields: {}, sources: {} }; order.push(key); }
          var row = byKey[key];
          Object.keys(g.days[date]).forEach(function (field) {
            var v = g.days[date][field];
            /* Same day, same metric, two files. Summing would double-count a
               file imported twice, so the later file wins and the collision is
               reported instead of buried. */
            if (row.fields[field] !== undefined && row.fields[field] !== v) {
              conflicts.push({ date: date, platform: g.platform, field: field,
                was: row.fields[field], now: v, from: row.sources[field], file: f.name });
            }
            row.fields[field] = v;
            row.sources[field] = f.name;
          });
        });
      });
    });

    var rows = order.map(function (k) { return byKey[k]; }).sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 : a.platform < b.platform ? -1 : 1;
    });
    var totals = {}, fieldsSeen = {};
    FIELDS.forEach(function (f) { totals[f] = 0; });
    rows.forEach(function (r) {
      Object.keys(r.fields).forEach(function (f) {
        if (totals[f] === undefined) totals[f] = 0;
        totals[f] += r.fields[f]; fieldsSeen[f] = true;
      });
    });

    return {
      rows: rows,
      fields: FIELDS.filter(function (f) { return fieldsSeen[f]; }),
      totals: totals,
      conflicts: conflicts,
      missingPlatform: missingPlatform,
      from: rows.length ? rows[0].date : null,
      to: rows.length ? rows[rows.length - 1].date : null
    };
  }

  /* Re-derives a file's days after the preview changed a column's meaning or
     the file's platform. Kept here so the mapping UI never has to know how a
     row becomes a value. */
  function applyOverrides(name, text, overrides) {
    var re = readFile(name, text);
    var edits = overrides && overrides.columns;
    if (edits && Object.keys(edits).length && !re.pivoted && re.dateColumn !== undefined) {
      re.columns.forEach(function (col) {
        var o = edits[col.index];
        if (o === undefined) return;
        col.field = o || null;
        col.kind = o ? 'metric' : 'ignored';
        /* One column per field. Without this, pointing a second column at a
           field that another column already holds would sum the two — the
           per-row equivalent of counting a day twice. The displaced column
           becomes an ignore, which is what the select then shows. */
        if (o) {
          re.columns.forEach(function (other) {
            if (other !== col && other.field === o) { other.field = null; other.kind = 'ignored'; }
          });
        }
      });
      re.rowsRead = 0; re.rowsSkipped = 0;
      accumulate(re, parseRows(text, re.delimiter).slice(re.headerIndex + 1));
    }
    if (overrides && overrides.platform) re.platform = overrides.platform;
    return re;
  }

  window.StoreImport = {
    FIELDS: FIELDS,
    decode: decode,
    sniffDelimiter: sniffDelimiter,
    parseRows: parseRows,
    parseDate: parseDate,
    parseValue: parseValue,
    classify: classify,
    detectPlatform: detectPlatform,
    readFile: readFile,
    applyOverrides: applyOverrides,
    plan: plan
  };
})();
