<!-- The blog's typeahead: search every answer by its title and tags, with the
     part of the app that answers the same question offered under the articles.
     The index (/search-index.json) is fetched on first focus, so the page costs
     nothing extra for a reader who never searches. Without JavaScript the form
     submits to the full list of answers. Every pick and every search that finds
     nothing is reported (blog_search_select / blog_search_none), so the
     questions nobody has answered yet show up in analytics. -->
<script lang="ts">
  export let count: number;
  export let examples = ['dizzy when I stand', 'magnesium', 'crash after exercise'];
  const searchScript = `<script>
(function () {
  var box = document.getElementById('bsBox');
  var input = document.getElementById('bsInput');
  var list = document.getElementById('bsList');
  var live = document.getElementById('bsLive');
  if (!box || !input || !list) return;
  var rows = null, loading = null, active = -1, items = [], noneTimer = null;
  var STOP = { the: 1, a: 1, an: 1, my: 1, is: 1, and: 1, of: 1, to: 1, in: 1, i: 1, for: 1, it: 1, do: 1, does: 1, why: 1, what: 1, how: 1, can: 1, with: 1, when: 1, am: 1, me: 1, on: 1, or: 1, are: 1, so: 1, after: 1, before: 1, at: 1, from: 1, your: 1, you: 1, be: 1, about: 1, get: 1, im: 1, keep: 1, always: 1 };
  var SYN = { dizzy: ['dizziness', 'lightheaded'], lightheaded: ['dizziness', 'dizzy'], tired: ['fatigue', 'exhausted'], exhausted: ['fatigue', 'tired'], racing: ['tachycardia', 'palpitations'], palpitations: ['racing', 'ectopic'], crash: ['pem', 'post-exertional'], pem: ['crash', 'post-exertional'], fog: ['brain fog', 'cognitive'], faint: ['syncope', 'fainting'], fainting: ['syncope', 'faint'], bp: ['blood pressure'], hr: ['heart rate'], covid: ['long covid'], cfs: ['me/cfs'], period: ['menstrual', 'cycle'], sleep: ['insomnia'], stomach: ['nausea', 'gut', 'digestion'] };
  function norm(s) { return (s || '').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').replace(/[^a-z0-9/ ]+/g, ' ').replace(/\\s+/g, ' ').trim(); }
  function load() {
    if (rows || loading) return loading;
    loading = fetch('/search-index.json').then(function (r) { return r.json(); }).then(function (d) {
      rows = d.map(function (x) { return { kind: x[0], title: x[1], href: x[2], label: x[3], t: norm(x[1]), g: norm(x[4]) }; });
      return rows;
    }).catch(function () { rows = []; });
    return loading;
  }
  function hitIn(text, w) {
    if (!text) return 0;
    if ((' ' + text + ' ').indexOf(' ' + w + ' ') >= 0) return 3;
    if ((' ' + text).indexOf(' ' + w) >= 0) return 2;
    return text.indexOf(w) >= 0 ? 1 : 0;
  }
  function score(r, words, whole) {
    var total = 0, matched = 0;
    for (var i = 0; i < words.length; i++) {
      var alts = [words[i]].concat(SYN[words[i]] || []), best = 0;
      for (var j = 0; j < alts.length; j++) {
        var w = alts[j], tw = hitIn(r.t, w) * 2, gw = hitIn(r.g, w);
        best = Math.max(best, tw ? tw + 1 : 0, gw);
      }
      if (best) { matched++; total += best; }
    }
    if (whole && r.t.indexOf(whole) >= 0) total += 6;
    return { s: total, all: matched === words.length, any: matched > 0 };
  }
  function search(q) {
    var whole = norm(q);
    var words = whole.split(' ').filter(function (w) { return w && !STOP[w]; });
    if (!words.length) words = whole.split(' ').filter(Boolean);
    if (!words.length) return [];
    var scored = rows.map(function (r) { var x = score(r, words, whole); x.r = r; return x; });
    var byScore = function (a, b) { return b.s - a.s || a.r.title.length - b.r.title.length; };
    var strict = scored.filter(function (x) { return x.all; }).sort(byScore);
    var pool = strict;
    if (strict.length < 4) {
      var loose = scored.filter(function (x) { return !x.all && x.any && x.s >= 3; }).sort(byScore);
      pool = strict.concat(loose);
    }
    var arts = pool.filter(function (x) { return x.r.kind === 'a'; }).slice(0, 6);
    var pages = pool.filter(function (x) { return x.r.kind === 'p'; }).slice(0, 2);
    return arts.map(function (x) { return x.r; }).concat(pages.map(function (x) { return x.r; }));
  }
  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function mark(title, q) {
    var words = norm(q).split(' ').filter(function (w) { return w.length > 2 && !STOP[w]; });
    var out = esc(title);
    words.forEach(function (w) {
      var re = new RegExp('(^|[^a-z0-9])(' + w.replace(/[.*+?^()|[\\]\\\\]/g, '') + ')', 'gi');
      out = out.replace(re, '$1<mark>$2</mark>');
    });
    return out;
  }
  function render(q) {
    items = search(q);
    active = -1;
    input.removeAttribute('aria-activedescendant');
    if (!q.trim()) { close(); return; }
    var html = '', shownPages = false;
    if (!items.length) {
      html = '<li class="bs-empty" role="presentation">No answers for that yet. Try a symptom like <b>dizzy</b>, <b>fatigue</b> or <b>heart rate</b>, or <a href="/insights/articles/">browse every answer</a>.</li>';
      clearTimeout(noneTimer);
      noneTimer = setTimeout(function () { if (window.ajEvent) window.ajEvent('blog_search_none', { query: q.slice(0, 80) }); }, 1200);
    }
    items.forEach(function (r, i) {
      if (r.kind === 'p' && !shownPages) { html += '<li class="bs-group" role="presentation">In the app</li>'; shownPages = true; }
      html += '<li role="option" id="bs-opt-' + i + '" class="bs-opt' + (r.kind === 'p' ? ' app' : '') + '" data-i="' + i + '" aria-selected="false">' +
        '<a href="' + esc(r.href) + '" tabindex="-1"><b>' + mark(r.title, q) + '</b><span>' + esc(r.label) + '</span></a></li>';
    });
    list.innerHTML = html;
    box.classList.add('open');
    input.setAttribute('aria-expanded', 'true');
    if (live) live.textContent = items.length ? items.length + ' results' : 'No results';
  }
  function close() { box.classList.remove('open'); input.setAttribute('aria-expanded', 'false'); active = -1; }
  function move(d) {
    if (!items.length) return;
    active = (active + d + items.length) % items.length;
    list.querySelectorAll('.bs-opt').forEach(function (el) {
      var on = Number(el.getAttribute('data-i')) === active;
      el.setAttribute('aria-selected', on ? 'true' : 'false');
      el.classList.toggle('on', on);
      if (on) { input.setAttribute('aria-activedescendant', el.id); el.scrollIntoView({ block: 'nearest' }); }
    });
  }
  function go(i) {
    var r = items[i];
    if (!r) return;
    if (window.ajEvent) window.ajEvent('blog_search_select', { query: input.value.slice(0, 80), target: r.href, rank: i + 1, kind: r.kind === 'p' ? 'app_page' : 'article' });
    window.location.href = r.href;
  }
  var t = null;
  input.addEventListener('focus', function () { load(); if (input.value.trim() && rows) render(input.value); });
  input.addEventListener('input', function () {
    var q = input.value;
    clearTimeout(t);
    t = setTimeout(function () { (rows ? Promise.resolve() : load()).then(function () { render(q); }); }, 60);
  });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') { if (items.length) { e.preventDefault(); go(active >= 0 ? active : 0); } }
    else if (e.key === 'Escape') { close(); }
  });
  list.addEventListener('mousedown', function (e) { e.preventDefault(); });
  list.addEventListener('click', function (e) {
    var li = e.target.closest ? e.target.closest('.bs-opt') : null;
    if (!li) return;
    e.preventDefault();
    go(Number(li.getAttribute('data-i')));
  });
  document.addEventListener('click', function (e) { if (!box.contains(e.target)) close(); });
  document.querySelectorAll('[data-bs-try]').forEach(function (b) {
    b.addEventListener('click', function () { input.value = b.getAttribute('data-bs-try'); input.focus(); load().then(function () { render(input.value); }); });
  });
})();
<\/script>`;
</script>

<form class="bs" id="bsBox" role="search" action="/insights/articles/" method="get">
  <label class="v2-sr" for="bsInput">Search {count} answers</label>
  <div class="bs-field">
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
    <input id="bsInput" name="q" type="search" autocomplete="off" spellcheck="false" placeholder="Search {count} answers" role="combobox" aria-expanded="false" aria-controls="bsList" aria-autocomplete="list" />
  </div>
  <ul class="bs-list" id="bsList" role="listbox" aria-label="Search results"></ul>
  <p class="bs-try">Try {#each examples as e, i}<button type="button" data-bs-try={e}>{e}</button>{#if i < examples.length - 1}<span aria-hidden="true">·</span>{/if}{/each}</p>
  <span class="v2-sr" id="bsLive" aria-live="polite"></span>
</form>

{@html searchScript}
