<script lang="ts">
  /* /master — the private store-analytics dashboard.
   *
   * The dashboard itself is framework-free: plain HTML, one stylesheet and
   * seven scripts under `landing/master/`, which is where they are edited. This
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
  import app from '../../../master/app.js?raw';
  import boot from '../../../master/boot.js?raw';

  /* Load order matters — see boot.js. Each file is an IIFE hanging one global
     off `window`, so concatenating them is the same as the seven <script src>
     tags the standalone page used. */
  const dashboard = [config, auth, api, sync, charts, app, boot].join('\n');

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
  <title>Autonomic — App Analytics Dashboard</title>
  <meta name="robots" content="noindex, nofollow" />
  {@html tag('style', styles)}
</svelte:head>

<!-- The gate has to be up before the dashboard is painted, not after the
     scripts at the bottom of the page have run, or the numbers flash on screen
     first. The standalone page did this with `<body class="gated">`; app.html
     is shared by the whole site, so the class is set here instead — still
     before the markup below is parsed. -->
{@html inlineScript("document.body.classList.add('gated')")}

{@html body}

{@html inlineScript(dashboard)}
