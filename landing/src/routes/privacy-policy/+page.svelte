<script lang="ts">
  import { site } from '$lib/site';
  const canonical = `${site.url}/privacy-policy/`;
</script>

<svelte:head>
  <title>Privacy Policy | Autonomic</title>
  <meta
    name="description"
    content="Autonomic's privacy policy: the app collects nothing and your data stays on your device. No accounts, no servers, no in-app tracking. Our marketing website uses basic analytics."
  />
  <link rel="canonical" href={canonical} />
  <meta property="og:type" content="website" />
  <meta property="og:url" content={canonical} />
  <meta property="og:title" content="Privacy Policy | Autonomic" />
  <meta property="og:description" content="The app collects nothing and your data stays on your device. No accounts, no servers, no in-app tracking. Our marketing website uses basic analytics." />
  <meta property="og:image" content="https://autonomic.care/og.png" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content="https://autonomic.care/og.png" />
</svelte:head>

<section class="legal">
  <div class="wrap legal-wrap">
    <p class="eyebrow">Legal</p>
    <h1 class="h2">Privacy Policy</h1>
    <p class="legal-updated">Last updated: July 12, 2026</p>

    <div class="article-prose">
      <p>
        Autonomic is a private, offline journal for logging autonomic-nervous-system recovery. This
        policy is short because the honest answer to "what does the app do with my data?" is:
        <strong>nothing, we never receive it.</strong> The one exception is this marketing website,
        which uses basic analytics, described under <a href="#website">The website</a> below.
      </p>

      <h2>What the app collects</h2>
      <p>
        <strong>Nothing.</strong> The Autonomic app has no user accounts, no sign-in, no servers, and
        no backend. We do not collect, receive, store, sell, or share any personal information or
        health data from the app. The app itself contains no analytics, no advertising, no crash
        reporters, and no third-party tracking of any kind. Everything below about your health data
        applies to the app; the separate website is covered at the end.
      </p>

      <h2>Where your data lives</h2>
      <p>
        Everything you log, journal entries, HRV readings, sleep, symptoms, medications, profile
        details such as sex, birthday, height, and weight, is stored locally on your device in the
        app's private storage. The journal database is encrypted at rest with a key held in your
        device's Keychain. It never leaves your device unless <em>you</em> deliberately export
        or share it.
      </p>
      <ul>
        <li>
          <strong>Local backups.</strong> The app keeps a small rotation of automatic JSON snapshots
          of your journal inside its own Documents folder on your device, so your data can survive
          reinstalls via a device restore. Unlike the journal database, these snapshots are plain
          readable JSON, so you can always recover your data yourself from the Files app. They are
          part of your device storage and, if you have iCloud Backup enabled, are included in your
          device's iCloud backup under <em>Apple's</em> terms and encryption (end-to-end encrypted
          only if you enable Advanced Data Protection), not on any server of ours.
        </li>
        <li>
          <strong>Apple Health.</strong> If you connect Apple Health, readings are exchanged with
          the Health app on your device using permissions you grant and can revoke at any time.
          Health data is processed entirely on-device.
        </li>
        <li>
          <strong>Bluetooth heart-rate straps.</strong> If you pair a chest strap, beat-to-beat data
          streams directly from the strap to your phone and is processed on-device.
        </li>
      </ul>

      <h2>Exports, sharing, and AI prompts</h2>
      <p>
        Autonomic can package your logged data into a JSON export or an analysis prompt that you can
        copy or share. This only happens when you explicitly trigger it. If you paste a prompt into
        a third-party AI service (such as Claude, ChatGPT, or Gemini), that data is then handled
        under <em>that provider's</em> privacy policy and terms, choose a provider you trust. We
        have no relationship with, and receive nothing from, any AI provider.
      </p>

      <h2>Permissions the app requests</h2>
      <ul>
        <li><strong>Bluetooth</strong>, to connect a heart-rate strap for live HRV readings.</li>
        <li><strong>Apple Health</strong>, to read and write the health metrics you approve.</li>
      </ul>
      <p>Both are optional; the app works without them.</p>

      <h2 id="website">The website</h2>
      <p>
        The guarantees above are absolute for the <strong>app</strong>. This public marketing and
        blog website at <strong>autonomic.care</strong> is a separate, ordinary website, and it uses
        <strong>Google Analytics</strong> to understand aggregate traffic, such as which articles are
        read and roughly where visitors come from, so we can improve the site. Google Analytics sets
        cookies and processes information like your IP address, device, and browser under
        <a href="https://policies.google.com/privacy" rel="noopener" target="_blank">Google's own
        privacy policy</a>.
      </p>
      <p>
        You can <strong>opt out</strong> at any time. On your first visit the site shows a cookie
        banner; choose <em>Block cookies</em> and Google Analytics is disabled immediately and never
        loads again on future visits, we don't track you at all. Your choice is saved in your
        browser, and you can change your mind by clearing this site's data. You can also block
        analytics with a content or cookie blocker or your browser's tracking controls. This applies
        only to your visits to the website, never to anything you do inside the app.
      </p>
      <p>
        The website does <strong>not</strong> collect any personal information from you: there is no
        sign-up, no account, and no contact or waitlist form. The download buttons simply link out to
        the Apple App Store and Google Play, where any install is governed by Apple's and Google's own
        privacy practices.
      </p>

      <h2>Children</h2>
      <p>
        Autonomic is not directed at children under 13 and does not knowingly handle their data,
        which, given that no app data ever reaches us, it structurally cannot.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        If the app's data practices ever change, we will update this page and the "last updated"
        date above before those changes take effect.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy can be raised through the app's App Store listing or by emailing
        <a href="mailto:austin@discoverymark.com">austin@discoverymark.com</a>.
      </p>
    </div>
  </div>
</section>

<style>
  .legal { padding: 150px 0 100px; }
  .legal-wrap { max-width: 780px; }
  .legal-updated {
    color: var(--dim-2);
    font-family: var(--mono);
    font-size: 13px;
    margin: 0 0 40px;
  }
</style>
