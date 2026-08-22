<script lang="ts">
  import { BRAND_POLYLINE, videoAppStoreLink, videoPlayStoreLink, videoSiteLink } from '$lib/site';

  /* The sniffer. The site ships no framework runtime, so this rides along as a
     plain inline script in the prerendered HTML (emitted via {@html redirect}
     at the foot of the page), the same pattern as the homepage's watch demo.

     The three destinations are interpolated from `site.ts` rather than typed
     here, so this page cannot drift from the campaign tokens the rest of the
     site uses. Every visitor leaves with attribution attached:

       iPhone / iPad -> App Store, Apple campaign `Videos`
       Android       -> Play, referrer utm_source=video
       anything else -> the home page, same utm triple for GA

     `location.replace` rather than `href`: this page is a signpost, and Back
     from the store should return to the video, not to the signpost.

     The markup below is the fallback, not a loading screen — it is what a
     visitor with JS off (or a sniff that matched nothing) is left holding, so
     it carries all three links by hand. */
  const redirect = `<script>
(function () {
  'use strict';
  var ua = navigator.userAgent || '';
  var dest = ${JSON.stringify(videoSiteLink)};
  if (/android/i.test(ua)) {
    dest = ${JSON.stringify(videoPlayStoreLink)};
  } else if (/iphone|ipad|ipod/i.test(ua)) {
    dest = ${JSON.stringify(videoAppStoreLink)};
  } else if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) {
    // iPadOS 13+ reports as a Mac; touch points disambiguate it.
    dest = ${JSON.stringify(videoAppStoreLink)};
  }
  window.location.replace(dest);
})();
<\/script>`;
</script>

<svelte:head>
  <title>Download Autonomic</title>
  <meta name="description" content="Get Autonomic for iPhone or Android." />
  <!-- A redirect is not a page of the site: keep it out of the index and out of
       the sitemap (which is hand-listed in routes/sitemap.xml). -->
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main>
  <svg class="mark" viewBox="0 0 512 512" aria-hidden="true">
    <polyline points={BRAND_POLYLINE} />
  </svg>
  <h1>Opening your app store…</h1>
  <p>If nothing happens, pick your phone:</p>
  <div class="links">
    <a href={videoAppStoreLink}>Download for iPhone</a>
    <a href={videoPlayStoreLink}>Download for Android</a>
  </div>
  <a class="quiet" href={videoSiteLink}>Or visit autonomic.care</a>
</main>

{@html redirect}

<style>
  :global(body) {
    margin: 0;
    background: #050506;
    color: #f4f4f5;
    font-family:
      -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Helvetica, Arial, sans-serif;
  }

  main {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    padding: 32px 24px;
    box-sizing: border-box;
    text-align: center;
  }

  .mark {
    width: 84px;
    height: 84px;
    fill: none;
    stroke: #e03127;
    stroke-width: 30;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  h1 {
    margin: 0;
    font-size: 22px;
    font-weight: 650;
    letter-spacing: -0.01em;
  }

  p {
    margin: 0;
    font-size: 15px;
    color: #a1a1aa;
  }

  .links {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 10px;
    margin-top: 6px;
  }

  .links a {
    display: inline-block;
    padding: 12px 20px;
    border-radius: 999px;
    background: #e03127;
    color: #fff;
    font-size: 15px;
    font-weight: 600;
    text-decoration: none;
  }

  .links a:last-child {
    background: rgba(255, 255, 255, 0.1);
  }

  .quiet {
    margin-top: 4px;
    font-size: 14px;
    color: #71717a;
    text-decoration: none;
  }
</style>
