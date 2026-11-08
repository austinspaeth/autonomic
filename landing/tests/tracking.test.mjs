/* The two KEY events, driven in the BUILT article page.
 *
 * This test exists because of a live-data report that could not be explained
 * from the source: a visitor sitting on an article, who had never left it,
 * credited with `blog_to_site`, `cta_click`, `download_click` and
 * `download_redirect` all at once. Two separate things were behind it, and both
 * are pinned here.
 *
 *   1. `blog_to_site` fired on ANY same-origin link off the blog, which is
 *      every link in the nav, the burger menu, the footer, the breadcrumb and
 *      the brand logo -- chrome that sits on every page and says nothing about
 *      the article. So the event counted engaged readers, not intent.
 *
 *   2. Nothing on the page fires any of them without a click. A dispatched
 *      click is indistinguishable from a finger, so a scripted browser walking
 *      the anchors produces the whole set in one pass; `navigator.webdriver` is
 *      now part of `_ajBlocked`, which is asserted below.
 *
 * Driven against the real bytes rather than the source: the tracking lives in
 * an inline script in `app.html`, so the thing worth testing is the page a
 * visitor is actually served, with the real markup under it. jsdom runs it, and
 * the events are read out of `dataLayer` -- the genuine path, not a gtag stub.
 */
import fs from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const ART = new URL(
  '../build/insights/basics/vasovagal-syncope-fainting/index.html',
  import.meta.url
).pathname;
if (!fs.existsSync(ART)) {
  console.error(`No built article at ${ART} — run \`npm run build\` first.`);
  process.exit(1);
}
const URL_ART = 'https://autonomic.care/insights/basics/vasovagal-syncope-fainting/';

const results = [];
const check = (name, ok, detail) => results.push({ name, ok, detail });

/**
 * Load the built article and hand back the page plus its event stream.
 *
 * `webdriver` models a scripted browser: the W3C flag a real automation driver
 * is required to set, and the one signal that separates a link checker from a
 * reader.
 */
async function load({ webdriver = false } = {}) {
  const virtualConsole = new VirtualConsole();
  // jsdom has no navigation, so an <a> click logs "Not implemented". Expected.
  virtualConsole.on('jsdomError', () => {});
  const dom = new JSDOM(fs.readFileSync(ART, 'utf8'), {
    url: URL_ART,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
    /* jsdom ships neither of these, and the page uses both: `matchMedia` in a
       component script that runs BEFORE the tracking block, so without it the
       whole inline script aborts and every "did not fire" assertion below
       passes for the wrong reason. The IntersectionObserver stub never
       intersects, which is why the impression events are asserted from the
       source rather than from a run. */
    beforeParse(w) {
      w.matchMedia = () => ({
        matches: false,
        addEventListener() {}, removeEventListener() {},
        addListener() {}, removeListener() {}
      });
      w.IntersectionObserver = class {
        constructor(cb) { this.cb = cb; }
        observe() {} unobserve() {} disconnect() {}
      };
    }
  });
  const { window } = dom;
  if (webdriver) Object.defineProperty(window.navigator, 'webdriver', { value: true });
  // Re-run the head script: `navigator.webdriver` has to be in place before
  // _ajBlocked is first consulted, and jsdom has already parsed the head.
  if (webdriver) window.eval(headScript(fs.readFileSync(ART, 'utf8')));
  // The page wires itself on DOMContentLoaded, so nothing exists to click until
  // the document has finished parsing.
  if (window.document.readyState !== 'complete') {
    await new Promise((res) => window.addEventListener('load', res, { once: true }));
  }
  // Nothing may actually navigate; a real browser would leave the page, which
  // is irrelevant to what was sent before it did.
  window.document.addEventListener('click', (e) => e.preventDefault(), true);
  const events = () =>
    [...window.dataLayer]
      .map((a) => Array.from(a))
      .filter((a) => a[0] === 'event')
      .map((a) => ({ name: a[1], params: a[2] || {} }));
  return { window, events };
}

/** The head's consent/debug block, so a test can re-run it after a change. */
function headScript(html) {
  const m = html.match(/window\.dataLayer = window\.dataLayer \|\| \[\];[\s\S]*?<\/script>/);
  return m ? m[0].replace(/<\/script>$/, '') : '';
}

function click(window, el) {
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
}
const names = (evs) => evs.map((e) => e.name);
const countOf = (evs, n) => names(evs).filter((x) => x === n).length;

/* ---- 1. A page load is not a conversion ------------------------------- */
{
  const { events } = await load();
  const evs = events();
  const KEY = ['blog_to_site', 'download_intent', 'cta_click', 'download_click', 'download_redirect'];
  const fired = KEY.filter((k) => countOf(evs, k) > 0);
  check(
    'loading an article fires no key event at all',
    fired.length === 0,
    fired.join(', ')
  );
  // Impressions are what a page load IS allowed to report. They ride an
  // IntersectionObserver, which the stub above never fires, so this is a check
  // that the wiring is still there rather than that it ran.
  const html = fs.readFileSync(ART, 'utf8');
  check(
    'impressions are still reported on view, not on click',
    /ajEvent\('cta_view'/.test(html) && /ajEvent\('section_view'/.test(html)
  );
}

/* ---- 2. blog_to_site: the chrome may not fire it ---------------------- */
{
  const { window, events } = await load();
  const doc = window.document;
  const chrome = [
    ['the brand logo', '#nav a.nv-brand'],
    ['a nav link', '#nav .nav-links a[href="/pricing/"]'],
    ['a nav menu item', '#nav .nv-item[href^="/features/"]'],
    ['a footer link', 'footer a[href^="/features/"]']
  ];
  for (const [label, sel] of chrome) {
    const el = doc.querySelector(sel);
    if (!el) { check(`${label} is present to click (${sel})`, false, 'not found'); continue; }
    const before = countOf(events(), 'blog_to_site');
    click(window, el);
    check(
      `${label} does not fire blog_to_site`,
      countOf(events(), 'blog_to_site') === before,
      sel
    );
  }
}

/* The breadcrumb only ever points back into the blog, so the whitelist covers
   it; the chrome rule is what covers it if an article ever links out of one. */
{
  const html = fs.readFileSync(ART, 'utf8');
  check('the breadcrumb is named in the chrome exclusion',
    /var AJ_CHROME = '[^']*\.bl-crumb[^']*'/.test(html));
}

/* ---- 3. blog_to_site: the article body does fire it, once ------------- */
{
  const { window, events } = await load();
  const doc = window.document;
  const links = [...doc.querySelectorAll('.article-prose a[href^="/features/"]')];
  check('the article body links to a product page', links.length > 0, `${links.length} found`);
  if (links.length) {
    click(window, links[0]);
    const evs = events();
    const bts = evs.filter((e) => e.name === 'blog_to_site');
    check('a product link in the article body fires blog_to_site', bts.length === 1, `${bts.length}`);
    check(
      'it names where it went and what was clicked',
      !!bts[0] && /^\/features\//.test(bts[0].params.target || '') &&
        bts[0].params.from_type === 'blog_article' && !!bts[0].params.cta,
      JSON.stringify(bts[0] && bts[0].params)
    );
    // A reader leaves for the site once. Clicking through, coming back and
    // clicking again is one person doing one thing.
    click(window, links[1] || links[0]);
    check('a second click does not fire it again', countOf(events(), 'blog_to_site') === 1,
      `${countOf(events(), 'blog_to_site')}`);
  }
}

/* ---- 4. blog_to_site: only pages that sell the app ------------------- */
{
  const { window, events } = await load();
  const doc = window.document;
  const off = [
    ['another article', '.article-prose a[href^="/insights/"]'],
    ['a legal page', 'footer a[href^="/privacy-policy"]']
  ];
  for (const [label, sel] of off) {
    const el = doc.querySelector(sel);
    if (!el) continue; // not on every article; absence is not a failure here
    const before = countOf(events(), 'blog_to_site');
    click(window, el);
    check(`a link to ${label} does not fire blog_to_site`,
      countOf(events(), 'blog_to_site') === before, sel);
  }
  // An in-page jump is not leaving.
  const anchor = doc.querySelector('.article-prose a[href^="#"]');
  if (anchor) {
    const before = countOf(events(), 'blog_to_site');
    click(window, anchor);
    check('an in-page jump does not fire blog_to_site',
      countOf(events(), 'blog_to_site') === before);
  }
}

/* ---- 5. download_intent is one ask per visitor ----------------------- */
{
  const { window, events } = await load();
  const doc = window.document;
  const badges = [...doc.querySelectorAll('#dlModal [data-dl-store]')];
  check('the download modal carries both store badges', badges.length >= 2, `${badges.length}`);
  if (badges.length >= 2) {
    click(window, badges[0]);
    check('a store badge fires download_intent', countOf(events(), 'download_intent') === 1,
      `${countOf(events(), 'download_intent')}`);
    check('and still fires download_click for the split',
      countOf(events(), 'download_click') === 1);
    const intent = events().find((e) => e.name === 'download_intent');
    check('download_intent says how and where the ask happened',
      !!intent && !!intent.params.how && !!intent.params.placement,
      JSON.stringify(intent && intent.params));
    // Weighing up iPhone against Android is one visitor, not two conversions.
    click(window, badges[1]);
    check('a second store badge does not fire a second download_intent',
      countOf(events(), 'download_intent') === 1,
      `${countOf(events(), 'download_intent')}`);
    check('while download_click still counts both badges',
      countOf(events(), 'download_click') === 2,
      `${countOf(events(), 'download_click')}`);
  }
}

/* ---- 6. A scripted browser is not measured --------------------------- */
{
  const { window } = await load({ webdriver: true });
  check('navigator.webdriver blocks the tag outright',
    window._ajBlocked() === true,
    `_ajBlocked() = ${window._ajBlocked()}`);
}

/* ---- 7. The DebugView switch ----------------------------------------- */
{
  const html = fs.readFileSync(ART, 'utf8');
  check('the shell carries the aj_debug switch', /aj_debug=1/.test(html));
  check('and passes debug_mode to the GA config',
    /gtag\('config', '[^']+', _ajDebug\(\) \? \{ debug_mode: true \} : \{\}\)/.test(html));
}

let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log((r.ok ? '  ok  ' : '  FAIL') + '  ' + r.name + (r.ok || !r.detail ? '' : `  [${r.detail}]`));
}
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
