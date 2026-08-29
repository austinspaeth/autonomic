<script lang="ts">
  import {
    BRAND_POLYLINE,
    REDIRECT_DESTINATION,
    REDIRECT_EVENT,
    REDIRECT_EVENT_BY_PLATFORM,
    REDIRECT_MAX_WAIT_MS,
    VIDEO_CAMPAIGN_SLUG,
    videoAppStoreLink,
    videoPlayStoreLink,
    videoSiteLink
  } from '$lib/site';

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

     It TELLS GA WHICH WAY IT WENT BEFORE IT GOES. `gtag` and `_ajBlocked` are
     both defined in the shell's head script, so they are available here even
     though the tag's own library is still loading — see the
     `REDIRECT_MAX_WAIT_MS` comment in `site.ts` for why the wait exists and why
     it is capped. Everything about the redirect itself is unchanged: the same
     three destinations, the same `location.replace`, just a beat later.

     The markup below is the fallback, not a loading screen — it is what a
     visitor with JS off (or a sniff that matched nothing) is left holding, so
     it carries all three links by hand. */
  const redirect = `<script>
(function () {
  'use strict';
  var ua = navigator.userAgent || '';
  var platform = 'desktop';
  if (/android/i.test(ua)) {
    platform = 'android';
  } else if (/iphone|ipad|ipod/i.test(ua)) {
    platform = 'ios';
  } else if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) {
    // iPadOS 13+ reports as a Mac; touch points disambiguate it.
    platform = 'ios';
  }

  var DEST = {
    ios: ${JSON.stringify(videoAppStoreLink)},
    android: ${JSON.stringify(videoPlayStoreLink)},
    desktop: ${JSON.stringify(videoSiteLink)}
  };
  var NAMED = ${JSON.stringify(REDIRECT_EVENT_BY_PLATFORM)};
  var WHERE = ${JSON.stringify(REDIRECT_DESTINATION)};

  // Whichever fires first wins, and the other becomes a no-op: the callback and
  // the cap are racing on purpose, and a double replace would be a real bug on
  // a page whose whole job is to leave exactly once.
  var gone = false;
  function go() {
    if (gone) return;
    gone = true;
    window.location.replace(DEST[platform]);
  }

  // Consent blocked, or no shell on the page: nothing will ever call back, so
  // there is nothing to wait for. Blocking means blocked — not "measured, then
  // sent" — so this returns before a single event is built.
  if (typeof gtag !== 'function' || (typeof _ajBlocked === 'function' && _ajBlocked())) {
    go();
    return;
  }

  // A fresh object per event: gtag holds the arguments it was handed until the
  // library flushes them, so one shared literal would put the callback on both.
  function params(extra) {
    var p = {
      platform: platform,
      destination: WHERE[platform],
      campaign: ${JSON.stringify(VIDEO_CAMPAIGN_SLUG)},
      location: '/download',
      page_type: 'download'
    };
    if (extra) { for (var k in extra) { if (extra.hasOwnProperty(k)) p[k] = extra[k]; } }
    return p;
  }

  // The cap. \`event_timeout\` is what GA itself honours once its library is
  // loaded; the timer is what covers the case where it never loads at all.
  setTimeout(go, ${REDIRECT_MAX_WAIT_MS});

  gtag('event', NAMED[platform], params());
  // The callback rides the LAST event queued, so both have been sent by the
  // time it fires.
  gtag('event', ${JSON.stringify(REDIRECT_EVENT)}, params({
    event_callback: go,
    event_timeout: ${REDIRECT_MAX_WAIT_MS}
  }));
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
