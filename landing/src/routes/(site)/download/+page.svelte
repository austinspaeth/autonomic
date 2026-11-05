<script lang="ts">
  import {
    APP_MARK_PATH,
    REDIRECT_DESTINATION,
    REDIRECT_EVENT,
    REDIRECT_EVENT_BY_PLATFORM,
    REDIRECT_MAX_WAIT_MS,
    VIDEO_CAMPAIGN,
    VIDEO_CAMPAIGN_SLUG,
    redirectTitle,
    site,
    pricing,
    videoAppStoreLink,
    videoPlayStoreLink,
    videoSiteLink
  } from '$lib/site';
  import Stores from '$lib/v2/Stores.svelte';

  const title = redirectTitle(VIDEO_CAMPAIGN);
  const description = 'Get Autonomic for iPhone or Android.';

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
  <title>{title}</title>
  <meta name="description" content={description} />
  <!-- A store hand-off for link-in-bio traffic, not a page to rank. -->
  <meta name="robots" content="noindex, follow" />
  <!-- Shared links (a video description, a DM) still unfurl with a card: the
       site's own, which already carries both store badges. -->
  <meta property="og:type" content="website" />
  <meta property="og:url" content={`${site.url}/download/`} />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:image" content={site.ogImage} />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={title} />
  <meta name="twitter:description" content={description} />
  <meta name="twitter:image" content={site.ogImage} />
  <!-- A redirect is not a page of the site: keep it out of the index and out of
       the sitemap (which is hand-listed in routes/sitemap.xml). -->
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<!-- Rendered inside the site's own nav and footer: on a phone it is on screen
     for a beat before the store opens, and on a desktop (or with JS off) it is
     the page the visitor is left holding, so it has to read as the site. -->
<section class="v2-phead dlr">
  <div class="v2-wrap">
    <!-- The app's own mark, not the decorative ECG waveform: this is the last
         thing a visitor sees before the store, so it has to be the same object
         they are about to install. -->
    <span class="v2-appicon dlr-icon"><svg viewBox="0 0 651.59 348.34" aria-hidden="true"><path d={APP_MARK_PATH} fill="#e03127" stroke="#e03127" stroke-width="9" /></svg></span>
    <h1>Opening your app store<span class="dlr-dots" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span></h1>
    <p class="v2-lead">If nothing happens, pick your phone below. Free to download, with {pricing.trialDays} days of Pro and no card.</p>
    <div class="dlr-stores"><Stores ios={videoAppStoreLink} android={videoPlayStoreLink} /></div>
    <a class="dlr-quiet" href={videoSiteLink}>Or explore autonomic.care →</a>
  </div>
</section>

{@html redirect}

<style>
  .dlr { min-height: min(78vh, 760px); display: flex; align-items: center; padding-bottom: 96px; }
  .dlr .v2-wrap { display: flex; flex-direction: column; align-items: center; }
  .dlr-icon { width: 92px; height: 92px; border-radius: 24px; margin-bottom: 30px; box-shadow: 0 24px 40px -16px rgba(20,14,26,.55); }
  .dlr h1 { font-size: clamp(36px, 5vw, 60px); }
  .dlr-dots i { font-style: normal; animation: dlr-blink 1.4s infinite both; }
  .dlr-dots i:nth-child(2) { animation-delay: .2s; }
  .dlr-dots i:nth-child(3) { animation-delay: .4s; }
  @keyframes dlr-blink { 0%, 80%, 100% { opacity: .2; } 40% { opacity: 1; } }
  .dlr-stores { margin-top: 32px; }
  .dlr-stores :global(.v2-stores) { justify-content: center; }
  .dlr-quiet { margin-top: 26px; font-size: 15px; font-weight: 700; color: var(--red); text-decoration: none; }
  .dlr-quiet:hover { text-decoration: underline; }
  @media (prefers-reduced-motion: reduce) { .dlr-dots i { animation: none; opacity: 1; } }
</style>
