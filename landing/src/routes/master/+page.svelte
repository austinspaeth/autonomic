<script lang="ts">
  /* /master — the private store-analytics dashboard.
   *
   * The dashboard itself is framework-free: plain HTML, one stylesheet and
   * scripts under `landing/master/`, which is where they are edited. This
   * route is only a shell that inlines all of it into a single prerendered
   * document, so the page has nothing to resolve at runtime — no sibling
   * stylesheet, no script src, no image. It used to ship as
   * `static/master/index.html` with relative asset URLs, which meant a request
   * for `/master` (no trailing slash) resolved every one of them against `/`
   * and served an unstyled page with the gate inert and the dashboard visible
   * behind it.
   *
   * ?raw keeps the sources verbatim: nothing is bundled, minified or scoped, so
   * what runs in the browser is byte-for-byte what is in `landing/master/`.
   */
  import body from '../../../master/body.html?raw';
  import styles from '../../../master/styles.css?raw';
  import config from '../../../master/config.js?raw';
  import auth from '../../../master/auth.js?raw';
  import api from '../../../master/api.js?raw';
  import sync from '../../../master/sync.js?raw';
  import charts from '../../../master/charts.js?raw';
  import analytics from '../../../master/analytics.js?raw';
  import sales from '../../../master/sales.js?raw';
  import costs from '../../../master/costs.js?raw';
  import releases from '../../../master/releases.js?raw';
  import alerts from '../../../master/alerts.js?raw';
  import pwa from '../../../master/pwa.js?raw';
  import app from '../../../master/app.js?raw';
  import boot from '../../../master/boot.js?raw';

  /* Load order matters — see boot.js. Each file is an IIFE hanging one global
     off `window`, so concatenating them is the same as the <script src>
     tags the standalone page used. */
  const dashboard = [config, auth, api, sync, charts, analytics, sales, costs, releases, alerts, pwa, app, boot].join('\n');

  /* Tags are assembled rather than written out, because a literal <script> or
     <style> in this file — even inside a string or a comment — is what Svelte's
     own preprocessor splits the component on. Script bodies additionally get
     their closing sequence escaped: none of the sources contain one today, and
     if one ever did it would end the tag early and take the whole page down
     silently. */
  const tag = (name: string, contents: string) => `<${name}>${contents}</${name}>`;
  const inlineScript = (js: string) => tag('script', js.replace(/<\/(script)/gi, '<\\/$1'));
</script>

<svelte:head>
  <title>Autonomic</title>
  <meta name="robots" content="noindex, nofollow" />
  <!-- Installed-app metadata. The manifest itself is a real file
       (static/master/manifest.json) rather than another inlined string:
       a manifest is fetched by the browser as a URL, and a data: one cannot
       carry a same-origin start_url. It is linked from the boot script below
       rather than here — see the note there. Both meta tags are additive, so
       they can live in the head with the site's own. -->
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black" />
  {@html tag('style', styles)}
</svelte:head>

<!-- The gate has to be up before the dashboard is painted, not after the
     scripts at the bottom of the page have run, or the numbers flash on screen
     first. The standalone page did this with `<body class="gated">`; app.html
     is shared by the whole site, so the class is set here instead — still
     before the markup below is parsed.

     The same script pins the viewport. This is a dense grid of numbers with its
     own horizontal scrollers, and pinch-zoom on a phone fights every one of
     them — a sideways drag on a wide table zooms the page instead of scrolling
     the table. The meta tag is REWRITTEN rather than added: app.html ships one
     for the whole site and two viewport tags is undefined behaviour, so this
     route edits the site's rather than competing with it.

     The manifest link is rewritten for the same reason, and it matters more:
     app.html links `/site.webmanifest` for the marketing site, and which of
     two manifest links a browser honours is not something to leave to document
     order. Pointing the existing one at the dashboard's manifest is
     unambiguous — /master installs as its own app, with its own name, icon and
     start_url, and the site's manifest is untouched everywhere else. -->
{@html inlineScript(
  "document.body.classList.add('gated');" +
  "var vp=document.querySelector('meta[name=viewport]');" +
  "if(vp)vp.setAttribute('content','width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');" +
  "var mf=document.querySelector('link[rel=manifest]');" +
  "if(mf)mf.setAttribute('href','/master/manifest.json');" +
  "else{mf=document.createElement('link');mf.rel='manifest';mf.href='/master/manifest.json';document.head.appendChild(mf);}"
)}

{@html body}

{@html inlineScript(dashboard)}
