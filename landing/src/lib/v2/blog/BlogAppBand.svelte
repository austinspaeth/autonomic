<!-- The blog's turn from reading to measuring: the film of the app in use
     beside what it answers, each line a link to the page that shows it. The
     video carries no src until it scrolls near the screen, so the blog's first
     paint never pays for it; without script the poster simply stays. -->
<script lang="ts">
  import { rating } from '$lib/site';
  import Stores from '../Stores.svelte';
  import StarRow from '../StarRow.svelte';
  import { APP_ROWS_DEFAULT, type AppRow } from '../blogData';
  export let video = { webm: '/features/blog-loop.webm', mp4: '/features/blog-loop.mp4', poster: '/features/blog-loop.webp' };
  export let title = 'Reading helps. Knowing your own numbers changes things.';
  export let sub = 'An article can tell you what is common. Autonomic tells you what is happening to you, from one quick reading each morning.';
  export let rows: AppRow[] = APP_ROWS_DEFAULT;
  /** A closing link to the page about this topic in the app (a condition page). */
  export let link: { href: string; name: string } | null = null;
  const videoScript = `<script>
(function () {
  var v = document.getElementById('blAppVideo');
  if (!v) return;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function start() {
    v.querySelectorAll('source[data-src]').forEach(function (s) { s.src = s.getAttribute('data-src'); });
    v.load();
    if (!reduce) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
  }
  if (!('IntersectionObserver' in window)) { start(); return; }
  var io = new IntersectionObserver(function (es) {
    if (es[0].isIntersecting) { io.disconnect(); start(); }
  }, { rootMargin: '300px' });
  io.observe(v);
})();
<\/script>`;
</script>

<section class="v2-sec white bl-app" data-cta="app_band">
  <div class="v2-wrap bl-app-in">
    <div class="bl-app-film">
      <video id="blAppVideo" muted loop playsinline preload="none" poster={video.poster} width="720" height="1280" aria-hidden="true">
        <source data-src={video.webm} type="video/webm" />
        <source data-src={video.mp4} type="video/mp4" />
      </video>
    </div>
    <div class="bl-app-copy">
      <h2 class="v2-h2">{title}</h2>
      <p class="v2-sub">{sub}</p>
      <ul class="bl-app-rows">
        {#each rows as r}
          <li><a href={r.href} data-cta={`app_band_row_${r.href.split('/').filter(Boolean).pop()}`}><b>{r.q}</b><span>{r.a}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></a></li>
        {/each}
      </ul>
      <Stores />
      {#if link}<a class="bl-app-link" href={link.href} data-cta="app_band_link">{link.name} →</a>{/if}
      <p class="bl-app-proof"><StarRow /><b>{rating.label}</b> on the {rating.store} · Free to start · Your data stays on your phone</p>
    </div>
  </div>
</section>

{@html videoScript}
