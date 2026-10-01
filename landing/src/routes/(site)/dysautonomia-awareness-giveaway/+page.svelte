<script lang="ts">
  /**
   * /dysautonomia-awareness-giveaway: the October giveaway. Every giveaway
   * banner's "Learn more" and the nav's awareness ribbon land here.
   *
   * The site runs `csr = false`, so everything here is static markup and CSS:
   * the floating prizes and the ribbon's glow are CSS/SMIL animations.
   */
  import { site, storeUrl, giveawayUrl, giveawayPosts, APP_MARK_PATH, GIVEAWAY_CAMPAIGN } from '$lib/site';
  import GiveawayRibbon from '$lib/GiveawayRibbon.svelte';
  import PrizeWatchArt from '$lib/PrizeWatchArt.svelte';
  import PrizeStrapArt from '$lib/PrizeStrapArt.svelte';

  const canonical = `${site.url}${giveawayUrl}`;
  const title = 'Dysautonomia Awareness Month Giveaway | Autonomic';
  const description =
    'This October, every day you take an HRV reading in Autonomic earns an entry, up to 10. Win an Apple Watch Series 12 (iPhone) or a Polar H10 strap (Android), plus other great prizes to help our community. Free to enter.';
  // Its own card, built by `npm run og:giveaway` (scripts/giveaway-og.html).
  const ogImage = `${site.url}/giveaway/og.png`;
  const ogAlt = 'Autonomic Dysautonomia Awareness Month giveaway: win an Apple Watch Series 12 or a Polar H10 with a daily HRV reading.';
  const email = 'austin@autonomic.care';

  // Attributed so giveaway downloads show up as their own campaign. The meta
  // tag below carries the same campaign to the nav button and download modal.
  const iosHref = storeUrl('ios', GIVEAWAY_CAMPAIGN);
  const androidHref = storeUrl('android', GIVEAWAY_CAMPAIGN);

  const socials = [
    { key: 'facebook', label: 'Facebook' },
    { key: 'instagram', label: 'Instagram' },
    { key: 'tiktok', label: 'TikTok' },
    { key: 'x', label: 'X' }
  ] as const;

  const rules: [string, string][] = [
    ['No purchase necessary', `A purchase does not increase your chance of winning. To enter without the app, email <a href="mailto:${email}">${email}</a> and ask to be entered.`],
    ['Eligibility', 'Open to legal residents of the United States, 18 or older. Void where prohibited.'],
    ['Entries', 'One entry per day with a completed HRV reading from October 1 to 31, 2026, Eastern Time, up to 10. One bonus entry for tagging a friend in each official giveaway post on Facebook, Instagram, TikTok and X, up to 4 bonus entries.'],
    ['Your data', 'No reading values or health data are shared with us. The only information collected is your email address and the number of readings completed.'],
    ['Selection', 'All winners are drawn at random on November 1, 2026. Two grand prize winners: one from entries made on iPhone, who receives the Apple Watch Series 12, and one from entries made on Android, who receives the Polar H10. Winners of the other prizes are drawn the same day. Odds depend on the number of entries received.'],
    ['Notification', 'All winners are notified by email and have 14 days to respond before an alternate is chosen.'],
    ['Not affiliated', 'This giveaway is not sponsored, endorsed or administered by, or associated with, Apple, Google, Android, Polar, Coospo, LMNT, X, TikTok, Facebook, Instagram, Meta or any other platform or brand named.'],
    ['Run by', `This giveaway is run by Austin Spaeth, founder of Autonomic, Charleston, SC. Questions: <a href="mailto:${email}">${email}</a>.`]
  ];
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={description} />
  <link rel="canonical" href={canonical} />
  <meta name="aj-store-campaign" content={GIVEAWAY_CAMPAIGN} />
  <meta property="og:type" content="website" />
  <meta property="og:url" content={canonical} />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:image" content={ogImage} />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content={ogAlt} />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content={ogImage} />
  <meta name="twitter:image:alt" content={ogAlt} />
</svelte:head>

{#snippet badges()}
  <div class="gvp-badges">
    <a class="gvp-badge" href={iosHref}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M16.4 12.6c0-2.4 2-3.5 2-3.6-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9s-1.8-.9-3-.8C7 7.3 5.6 8.2 4.8 9.6c-1.6 2.8-.4 6.9 1.2 9.2.8 1.1 1.7 2.3 2.9 2.3 1.2-.1 1.6-.8 3-.8s1.8.8 3 .7c1.3 0 2-1.1 2.8-2.3.9-1.3 1.2-2.5 1.3-2.6-.1 0-2.6-1-2.6-3.5zM14.2 5.6c.6-.8 1.1-1.9 1-3-1 0-2.1.7-2.8 1.5-.6.7-1.2 1.8-1 2.9 1 .1 2.1-.6 2.8-1.4z" /></svg>
      <span class="gvp-badge-t"><span class="gvp-badge-s">Download on the</span><span class="gvp-badge-l">App Store</span></span>
    </a>
    <a class="gvp-badge" href={androidHref}>
      <svg width="22" height="24" viewBox="0 0 22 24" aria-hidden="true"><path d="M1 1.5l11.3 10.5L1 22.5c-.3-.2-.5-.6-.5-1.1V2.6c0-.5.2-.9.5-1.1z" fill="#3ec46d" /><path d="M16.2 8.3L12.3 12 1 1.5c.3-.3.8-.3 1.3 0l13.9 6.8z" fill="#5eb4e8" /><path d="M16.2 15.7L2.3 22.5c-.5.3-1 .3-1.3 0L12.3 12l3.9 3.7z" fill="#e03127" /><path d="M20.4 10.4c.9.5.9 2.7 0 3.2l-4.2 2.1L12.3 12l3.9-3.7 4.2 2.1z" fill="#f2c94c" /></svg>
      <span class="gvp-badge-t"><span class="gvp-badge-s">Get it on</span><span class="gvp-badge-l">Google Play</span></span>
    </a>
  </div>
{/snippet}

{#snippet floatWatch(k: string)}
  <figure class="gvp-float">
    <div class="gvp-float-art gvp-float-watch">
      <div class="gvp-float-glow"></div>
      <div class="gvp-float-img"><PrizeWatchArt {k} /></div>
    </div>
    <figcaption><strong>Apple Watch Series 12</strong><span>iPhone grand prize</span></figcaption>
  </figure>
{/snippet}

{#snippet floatStrap(k: string)}
  <figure class="gvp-float">
    <div class="gvp-float-art gvp-float-strap">
      <div class="gvp-float-glow"></div>
      <div class="gvp-float-img"><PrizeStrapArt {k} /></div>
    </div>
    <figcaption><strong>Polar H10</strong><span>Android grand prize</span></figcaption>
  </figure>
{/snippet}

<div class="gvp">
<div class="gvp-in">
  <!-- ============ HERO ============ -->
  <section class="gvp-hero">
    <div class="gvp-hero-glow" aria-hidden="true"></div>

    <div class="gvp-ribbon-stage">
      <div class="gvp-halo" aria-hidden="true"></div>
      <div class="gvp-ribbon"><GiveawayRibbon /></div>
    </div>

    <div class="gvp-hero-row">
      <div class="gvp-side gvp-side-l" aria-hidden="true">{@render floatWatch('a')}</div>

      <div class="gvp-hero-copy">
        <div class="gvp-pill">October · Dysautonomia Awareness Month</div>
        <h1 class="gvp-h1">A giveaway for our community.</h1>
        <p class="gvp-lead">
          Two grand prizes: an <strong>Apple Watch Series 12</strong> for one iPhone user, and a
          <strong>Polar H10</strong> heart-rate strap for one Android user. Plus other prizes available. Free to enter.
        </p>
        <a class="btn btn-primary gvp-cta" href="#download">Download free &amp; enter</a>
        <div id="download">{@render badges()}</div>
        <p class="gvp-fine">
          No purchase necessary. No health data collected. US residents 18 and older.
          <a href="#rules">View all rules</a>
        </p>
      </div>

      <div class="gvp-side gvp-side-r" aria-hidden="true">{@render floatStrap('a')}</div>
    </div>

    <!-- Below the width where the prizes can float beside the copy, they sit under it. -->
    <div class="gvp-hero-prizes" aria-hidden="true">
      {@render floatWatch('b')}
      {@render floatStrap('b')}
    </div>
  </section>

  <!-- ============ WHY (founder's letter) ============ -->
  <section class="gvp-sec gvp-letter">
    <div class="gvp-letter-in">
      <p class="gvp-eyebrow">From the founder</p>
      <h2 class="gvp-h2">Why I'm doing this</h2>
      <p>
        I have been living with this for more than four years. For most of that time, the hardest part was not
        the symptoms. It was not knowing. Was today a bad day, or the start of a crash? Was the new supplement
        helping, or was I just hoping it was? And more than once, I was told everything looked normal.
      </p>
      <p>
        Your autonomic nervous system runs everything you never think about: your heart rate, your blood
        pressure, your breathing, your digestion. When it struggles, it rarely says so clearly. That is what
        Dysautonomia Awareness Month is for, and I want this October to be about more than a ribbon. I want more
        of us paying attention to our own autonomic health.
      </p>
      <p class="gvp-pull">One reading is a snapshot. A month of mornings is a pattern.</p>
      <p>
        That is why the entries are daily readings. Heart rate variability is one of the few windows we have into
        how the autonomic system is doing, and it means the most over time: your own baseline, how it moves after
        a bad night or a hard day, and what seems to bring it back. Ten mornings is a real start on knowing your
        own normal, and knowing your normal is where the answers start.
      </p>
      <p>
        I built Autonomic for exactly that. Your readings never leave your phone, and it is made by a fellow
        patient for people like us. If this month gets a few more of us measuring, noticing, and a little closer
        to answers, it did its job.
      </p>
      <div class="gvp-sign">
        <span class="gvp-sign-name">Austin Spaeth</span>
        <span class="gvp-sign-role">Founder, Autonomic</span>
      </div>
    </div>
  </section>

  <!-- ============ HOW TO ENTER ============ -->
  <section class="gvp-sec" id="enter">
    <div class="gvp-head">
      <h2 class="gvp-h2">How to enter</h2>
      <p class="gvp-sub">It is free, and it fits into a routine you may already have.</p>
    </div>

    <ol class="gvp-steps">
      <li class="gvp-step">
        <div class="gvp-step-n">Step 1</div>
        <div class="gvp-step-t">Download the app</div>
        <div class="gvp-step-d">Autonomic is free to download on iPhone and Android.</div>
      </li>
      <li class="gvp-step gvp-step-key">
        <div class="gvp-step-n">Step 2</div>
        <div class="gvp-step-t">Take a reading each day</div>
        <div class="gvp-step-d">Sign up in the app. Every day you take an HRV reading in October earns one entry, up to 10.</div>
        <div class="gvp-dots" role="img" aria-label="Ten entries possible">
          {#each Array(10) as _, i}<span class:on={i < 4}></span>{/each}
        </div>
      </li>
      <li class="gvp-step">
        <div class="gvp-step-n gvp-step-n-dim">Optional bonus · up to 4</div>
        <div class="gvp-step-t">Tag a friend</div>
        <div class="gvp-step-d">Tag someone in our giveaway post on each platform. One extra entry per post.</div>
        <div class="gvp-socials">
          {#each socials as s}
            {@const href = giveawayPosts[s.key]}
            {#if href}
              <a class="gvp-social" {href} aria-label={`Tag a friend on ${s.label}`} target="_blank" rel="noopener">
                {@render socialIcon(s.key)}
              </a>
            {:else}
              <span class="gvp-social is-off" role="img" aria-label={`${s.label} post coming soon`} title={`${s.label} post coming soon`}>
                {@render socialIcon(s.key)}
              </span>
            {/if}
          {/each}
        </div>
      </li>
    </ol>

    <div class="gvp-privacy">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2.5" /><path d="M8 11V7.5a4 4 0 0 1 8 0V11" /></svg>
      <div>
        <div class="gvp-privacy-t">Your data stays yours</div>
        <div class="gvp-privacy-d">We never see your heart rate, HRV or any health data. The only things we collect are your email address and how many readings you took. Nothing else leaves your phone.</div>
      </div>
    </div>
  </section>

  <!-- ============ PRIZES ============ -->
  <section class="gvp-sec">
    <div class="gvp-head">
      <h2 class="gvp-h2">Prizes</h2>
      <p class="gvp-sub">Two grand prizes, plus other great prizes to help our community.</p>
    </div>

    <div class="gvp-grand">
      <div class="gvp-prize">
        <div class="gvp-prize-art"><span class="gvp-prize-watch"><PrizeWatchArt k="c" /></span></div>
        <div class="gvp-prize-meta">
          <div class="gvp-prize-tag">iPhone grand prize</div>
          <div class="gvp-prize-name">Apple Watch Series 12</div>
          <div class="gvp-prize-d">One winner drawn from iPhone entries.</div>
        </div>
      </div>
      <div class="gvp-prize">
        <div class="gvp-prize-art"><span class="gvp-prize-strap"><PrizeStrapArt k="c" /></span></div>
        <div class="gvp-prize-meta">
          <div class="gvp-prize-tag">Android grand prize</div>
          <div class="gvp-prize-name">Polar H10 strap</div>
          <div class="gvp-prize-d">One winner drawn from Android entries.</div>
        </div>
      </div>
    </div>

    <div class="gvp-more">
      <div class="gvp-card">
        <div class="gvp-logo gvp-logo-coospo" role="img" aria-label="Coospo"></div>
        <div class="gvp-card-t">Heart-rate strap</div>
        <div class="gvp-card-d">4 winners.</div>
      </div>
      <div class="gvp-card">
        <div class="gvp-logo gvp-logo-lmnt" role="img" aria-label="LMNT electrolyte drink mix"></div>
        <div class="gvp-card-t">LMNT boxes</div>
        <div class="gvp-card-d">10 winners.</div>
      </div>
      <div class="gvp-card">
        <div class="gvp-logo gvp-logo-pro">
          <svg viewBox="0 0 651.59 348.34" aria-hidden="true"><path fill="currentColor" d={APP_MARK_PATH} /></svg>
          <span>Autonomic Pro</span>
        </div>
        <div class="gvp-card-t">A free year of Pro</div>
        <div class="gvp-card-d">From us. 25 winners.</div>
      </div>
    </div>
  </section>

  <!-- ============ DATES ============ -->
  <section class="gvp-sec">
    <h2 class="gvp-h2 gvp-center gvp-h2-gap">Dates &amp; winners</h2>
    <div class="gvp-dates">
      <div class="gvp-card">
        <div class="gvp-date">Oct 1 to 31</div>
        <div class="gvp-card-d">Entries count for readings taken during these dates.</div>
      </div>
      <div class="gvp-card">
        <div class="gvp-date">November 1</div>
        <div class="gvp-card-d">Winners drawn at random from all entries.</div>
      </div>
      <div class="gvp-card">
        <div class="gvp-date">We reach out</div>
        <div class="gvp-card-d">Winners are contacted by email.</div>
      </div>
    </div>
  </section>

  <!-- ============ RULES ============ -->
  <section class="gvp-sec">
    <div class="gvp-rules" id="rules">
      <h2 class="gvp-h2 gvp-center">Official rules</h2>
      <p class="gvp-sub gvp-rules-sub">The short version. Everything that decides who can enter and how winners are chosen.</p>
      <ol class="gvp-rule-list">
        {#each rules as [head, body], i}
          <li class="gvp-rule">
            <div class="gvp-rule-h"><span class="gvp-rule-n">{String(i + 1).padStart(2, '0')}</span><span>{head}</span></div>
            <div class="gvp-rule-b">{@html body}</div>
          </li>
        {/each}
      </ol>
    </div>
  </section>

  <!-- ============ CLOSING CTA ============ -->
  <section class="gvp-sec gvp-end">
    <h2 class="gvp-h2 gvp-end-h">Start with today's reading.</h2>
    <p class="gvp-sub gvp-end-sub">Free on iPhone and Android.</p>
    {@render badges()}
  </section>
</div>
</div>

{#snippet socialIcon(key: string)}
  {#if key === 'facebook'}
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.6 1.6-1.6h1.6V4.3c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.3H8.9v3h2.6V21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" /></svg>
  {:else if key === 'instagram'}
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="5" fill="none" stroke="currentColor" stroke-width="1.9" /><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.9" /><circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" /></svg>
  {:else if key === 'tiktok'}
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5M14 3c.4 2.6 2.2 4.4 5 4.6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
  {:else}
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.78L17.75 3zm-1.08 16.17h1.7L7.4 4.74H5.58l11.09 14.43z" /></svg>
  {/if}
{/snippet}

<style>
  .gvp {
    --gvp-teal: #2dd4bf;
    --gvp-teal-light: #5eead4;
    --gvp-coral: #ff8a82;
    --gvp-card: #141416;
    --gvp-rule: #1c1c1f;
    /* Full width, so the hero's glows and floating prizes are only ever cut
       by the edge of the screen, never by the content column. */
    overflow-x: clip;
  }
  .gvp-in { max-width: 1080px; margin: 0 auto; padding: 0 var(--pad); }

  /* ── Hero ─────────────────────────────────────────────── */
  .gvp-hero { position: relative; text-align: center; padding: 72px 0 72px; }
  .gvp-hero-glow {
    position: absolute; left: 50%; top: 20px; width: 760px; height: 480px;
    transform: translateX(-50%); pointer-events: none;
    background: radial-gradient(ellipse, rgba(45,212,191,0.15) 0%, rgba(45,212,191,0) 65%);
  }
  .gvp-ribbon-stage { position: relative; display: flex; justify-content: center; margin-bottom: 34px; }
  .gvp-halo {
    position: absolute; left: 50%; top: 50%; width: 220px; height: 220px; margin: -110px 0 0 -110px;
    border-radius: 999px;
    background: radial-gradient(circle, rgba(45,212,191,0.33) 0%, rgba(34,211,238,0.13) 40%, rgba(45,212,191,0) 70%);
    animation: gvpHalo 7s ease-in-out infinite;
  }
  .gvp-ribbon { position: relative; width: 120px; height: 168px; }

  /* Wide screens: the two grand prizes float either side of the copy.
     Narrower: they drop into a row underneath it (.gvp-hero-prizes). */
  .gvp-hero-row { position: relative; display: grid; grid-template-columns: minmax(0, 1fr); }
  .gvp-side { display: none; }
  .gvp-hero-copy { position: relative; max-width: 600px; margin: 0 auto; }
  @media (min-width: 1240px) {
    /* minmax(0, …): a bare 1fr grows to fit its content, and the strap is wider
       than the watch, which pushed the copy off centre. */
    .gvp-hero-row { grid-template-columns: minmax(0, 1fr) 600px minmax(0, 1fr); gap: 24px; margin: 0 -80px; }
    .gvp-side { display: flex; }
    .gvp-side-l { justify-content: flex-end; padding-top: 40px; }
    .gvp-side-r { justify-content: flex-start; padding-top: 70px; }
  }

  .gvp-pill {
    display: inline-flex; align-items: center; gap: 9px;
    font-size: 13px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
    color: var(--gvp-teal-light); background: rgba(45,212,191,0.1);
    border: 1px solid rgba(45,212,191,0.33); border-radius: 999px; padding: 8px 16px; margin-bottom: 26px;
  }
  .gvp-h1 {
    font-family: var(--display); font-size: clamp(40px, 7vw, 68px); line-height: 1.02;
    letter-spacing: -0.03em; font-weight: 700; margin: 0 auto 22px; text-wrap: balance;
  }
  .gvp-lead {
    font-size: clamp(18px, 2.4vw, 21px); line-height: 1.5; color: #c9c9d0;
    margin: 0 auto 36px; max-width: 560px; text-wrap: pretty;
  }
  .gvp-lead strong { color: var(--text); }
  .gvp-cta { height: 58px; padding: 0 32px; font-size: 17px; font-weight: 700; margin-bottom: 32px; }
  #download { scroll-margin-top: 120px; }
  .gvp-fine { font-size: 14px; line-height: 1.55; color: #8a8a92; margin: 18px 0 0; }
  .gvp-fine a, .gvp-rule-b :global(a) {
    color: var(--gvp-teal-light); font-weight: 600; text-decoration: underline; text-underline-offset: 3px;
  }
  .gvp-fine a:hover, .gvp-rule-b :global(a:hover) { color: #99f6e4; }

  .gvp-badges { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; }
  .gvp-badge {
    display: flex; align-items: center; gap: 12px; height: 56px; padding: 0 20px 0 16px;
    border-radius: 14px; background: #000; border: 1px solid rgba(255,255,255,0.18); color: #fff;
    transition: border-color 0.2s, transform 0.18s var(--bounce);
  }
  .gvp-badge:hover { border-color: rgba(255,255,255,0.4); transform: translateY(-2px); }
  .gvp-badge-t { display: flex; flex-direction: column; text-align: left; line-height: 1.1; }
  .gvp-badge-s { font-size: 11px; color: #c9c9d0; }
  .gvp-badge-l { font-size: 18px; font-weight: 600; }

  .gvp-float { margin: 0; display: flex; flex-direction: column; align-items: center; }
  .gvp-float figcaption { display: flex; flex-direction: column; gap: 3px; }
  .gvp-float strong { font-size: 14px; font-weight: 700; color: #e4e4e8; white-space: nowrap; }
  .gvp-float span { font-size: 12.5px; color: #8a8a92; white-space: nowrap; }
  .gvp-float-art { position: relative; animation: gvpFloat 6s ease-in-out infinite; }
  .gvp-float-watch { --r: -6deg; margin: 18px 0 14px; }
  .gvp-float-strap { --r: 5deg; margin: 30px 0 22px; animation-delay: -3s; }
  .gvp-float-glow { position: absolute; background: var(--gvp-teal); filter: blur(46px); }
  .gvp-float-watch .gvp-float-glow { left: 30px; right: 30px; top: 50px; bottom: 50px; border-radius: 60px; opacity: 0.18; }
  .gvp-float-strap .gvp-float-glow { left: 70px; right: 70px; top: 40px; height: 70px; border-radius: 999px; opacity: 0.16; }
  .gvp-float-img { position: relative; }
  .gvp-float-watch .gvp-float-img { width: 176px; height: 220px; }
  .gvp-float-strap .gvp-float-img { width: 300px; height: 150px; }

  .gvp-hero-prizes {
    display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: center;
    gap: 8px 28px; padding-top: 24px;
  }
  .gvp-hero-prizes .gvp-float-watch .gvp-float-img { width: 127px; height: 158px; }
  .gvp-hero-prizes .gvp-float-strap .gvp-float-img { width: 216px; height: 108px; }
  .gvp-hero-prizes .gvp-float-watch .gvp-float-glow { left: 22px; right: 22px; top: 36px; bottom: 36px; }
  .gvp-hero-prizes .gvp-float-strap .gvp-float-glow { left: 50px; right: 50px; top: 29px; height: 50px; }
  /* After the row's own rules, or they win. */
  @media (min-width: 1240px) {
    .gvp-hero-prizes { display: none; }
  }

  @keyframes gvpHalo { 0%, 100% { transform: scale(0.9); opacity: 0.55; } 50% { transform: scale(1.12); opacity: 1; } }
  @keyframes gvpFloat {
    0%, 100% { transform: translateY(0) rotate(var(--r)); }
    50% { transform: translateY(-10px) rotate(var(--r)); }
  }
  @media (prefers-reduced-motion: reduce) {
    .gvp-halo, .gvp-float-art { animation: none; }
    .gvp-float-art { transform: rotate(var(--r)); }
  }

  /* ── Sections ─────────────────────────────────────────── */
  .gvp-sec { padding: 64px 0; border-top: 1px solid var(--gvp-rule); }
  .gvp-head { text-align: center; margin-bottom: 40px; }
  .gvp-center { text-align: center; }
  .gvp-h2 {
    font-family: var(--display); font-size: clamp(30px, 5vw, 42px); letter-spacing: -0.02em;
    font-weight: 700; margin: 0 0 12px;
  }
  .gvp-h2-gap { margin-bottom: 28px; }
  .gvp-sub { font-size: 17px; line-height: 1.55; color: #a8a8b0; margin: 0 auto; max-width: 520px; }
  /* Founder's letter: centred title, left-aligned prose at a reading measure. */
  .gvp-letter-in { max-width: 640px; margin: 0 auto; }
  .gvp-letter .gvp-eyebrow, .gvp-letter .gvp-h2 { text-align: center; }
  .gvp-eyebrow {
    font-size: 13px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
    color: var(--gvp-teal-light); margin: 0 0 12px;
  }
  .gvp-letter .gvp-h2 { margin-bottom: 30px; }
  .gvp-letter p:not(.gvp-eyebrow) {
    font-size: clamp(17px, 2.1vw, 19px); line-height: 1.7; color: #c9c9d0; margin: 0 0 20px; text-wrap: pretty;
  }
  .gvp-letter p.gvp-pull {
    font-family: var(--display); font-size: clamp(24px, 3.4vw, 30px); line-height: 1.25; letter-spacing: -0.02em;
    font-weight: 700; color: var(--text); margin: 34px 0; padding-left: 22px;
    border-left: 3px solid var(--gvp-teal); text-wrap: balance;
  }
  .gvp-sign { display: flex; flex-direction: column; gap: 2px; margin-top: 30px; }
  .gvp-sign-name { font-family: var(--display); font-size: 19px; font-weight: 700; }
  .gvp-sign-role { font-size: 14px; color: #8a8a92; }

  /* How to enter */
  .gvp-steps {
    list-style: none; margin: 0; padding: 0; display: grid; gap: 16px;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
  }
  .gvp-step {
    background: var(--gvp-card); border: 1px solid rgba(255,255,255,0.05);
    border-radius: 22px; padding: 26px 24px;
  }
  .gvp-step-key { border-color: rgba(224,49,39,0.27); }
  .gvp-step-n { font-family: var(--display); font-size: 15px; font-weight: 700; color: var(--gvp-coral); margin-bottom: 14px; }
  .gvp-step-n-dim { color: #a8a8b0; }
  .gvp-step-t { font-size: 21px; font-weight: 700; line-height: 1.3; margin-bottom: 8px; }
  .gvp-step-d { font-size: 16px; line-height: 1.55; color: #a8a8b0; }
  .gvp-step-key .gvp-step-d, .gvp-step:last-child .gvp-step-d { margin-bottom: 18px; }
  .gvp-dots { display: grid; grid-template-columns: repeat(10, 1fr); gap: 5px; }
  .gvp-dots span { height: 10px; border-radius: 999px; background: #2a2a2e; }
  .gvp-dots span.on { background: var(--accent); }
  .gvp-socials { display: flex; gap: 8px; }
  .gvp-social {
    flex: 1; height: 48px; display: flex; align-items: center; justify-content: center;
    background: #0a0a0b; border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; color: #e4e4e8;
    transition: background 0.2s, border-color 0.2s, color 0.2s, box-shadow 0.2s, transform 0.2s;
  }
  a.gvp-social:hover {
    background: rgba(45,212,191,0.08); border-color: var(--gvp-teal); color: var(--gvp-teal-light);
    box-shadow: 0 0 0 3px rgba(45,212,191,0.12), 0 0 22px rgba(45,212,191,0.25); transform: translateY(-2px);
  }
  a.gvp-social:focus-visible { border-color: var(--gvp-teal); box-shadow: 0 0 0 3px rgba(45,212,191,0.33); outline: none; }
  .gvp-social.is-off { opacity: 0.4; cursor: default; }

  .gvp-privacy {
    display: flex; align-items: flex-start; gap: 16px; max-width: 760px; margin: 22px auto 0;
    background: #0f1d1b; border: 1px solid rgba(45,212,191,0.25); border-radius: 22px; padding: 22px 24px;
  }
  .gvp-privacy svg { flex: none; margin-top: 2px; color: var(--gvp-teal-light); }
  .gvp-privacy-t { font-size: 18px; font-weight: 700; margin-bottom: 6px; }
  .gvp-privacy-d { font-size: 16px; line-height: 1.6; color: #c9d6d4; }

  /* Prizes */
  .gvp-grand {
    display: grid; gap: 16px; margin-bottom: 16px;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
  }
  .gvp-prize { background: #111113; border: 1px solid rgba(255,255,255,0.06); border-radius: 26px; padding: 14px 14px 22px; }
  .gvp-prize-art {
    height: 240px; margin-bottom: 18px; border-radius: 18px; overflow: hidden;
    background: radial-gradient(ellipse 70% 60% at 50% 45%, #1d1f22 0%, #0b0b0c 75%);
    display: flex; align-items: center; justify-content: center;
  }
  .gvp-prize-watch { display: block; width: 168px; height: 210px; }
  .gvp-prize-strap { display: block; width: 100%; max-width: 300px; height: 150px; }
  .gvp-prize-meta { padding: 0 8px; }
  .gvp-prize-tag {
    font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
    color: var(--gvp-teal-light); margin-bottom: 6px;
  }
  .gvp-prize-name { font-family: var(--display); font-size: 24px; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 6px; }
  .gvp-prize-d { font-size: 15px; line-height: 1.5; color: #a8a8b0; }

  .gvp-more, .gvp-dates {
    display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
  }
  .gvp-dates { max-width: 860px; margin: 0 auto; }
  .gvp-card { background: var(--gvp-card); border: 1px solid rgba(255,255,255,0.05); border-radius: 22px; padding: 22px; }
  .gvp-dates .gvp-card { padding: 24px; }
  .gvp-card-t { font-size: 18px; font-weight: 700; margin-bottom: 6px; }
  .gvp-card-d { font-size: 15px; line-height: 1.5; color: #a8a8b0; }
  .gvp-date { font-family: var(--display); font-size: 26px; font-weight: 700; margin-bottom: 6px; }
  .gvp-logo {
    height: 60px; border-radius: 14px; margin-bottom: 18px;
    background: #000 center / contain no-repeat; border: 1px solid rgba(255,255,255,0.05);
  }
  .gvp-logo-coospo { background-image: url('/giveaway/coospo.webp'); background-size: auto 62%; }
  .gvp-logo-lmnt { background-image: url('/giveaway/lmnt.webp'); background-size: cover; background-position: center 40%; }
  .gvp-logo-pro { display: flex; align-items: center; justify-content: center; gap: 12px; }
  .gvp-logo-pro svg { width: 40px; height: auto; color: var(--accent); }
  .gvp-logo-pro span { font-family: var(--display); font-size: 20px; font-weight: 700; letter-spacing: -0.01em; }

  /* Rules */
  .gvp-rules { max-width: 820px; margin: 0 auto; scroll-margin-top: 90px; }
  .gvp-rules-sub { text-align: center; margin-bottom: 34px; }
  .gvp-rule-list { list-style: none; margin: 0; padding: 0; border-bottom: 1px solid var(--gvp-rule); }
  .gvp-rule { display: flex; flex-wrap: wrap; gap: 6px 32px; padding: 20px 0; border-top: 1px solid var(--gvp-rule); }
  .gvp-rule-h { flex: 0 0 200px; display: flex; align-items: baseline; gap: 12px; font-size: 16px; font-weight: 700; }
  .gvp-rule-n { font-family: var(--display); font-variant-numeric: tabular-nums; font-size: 13px; color: var(--gvp-teal-light); }
  .gvp-rule-b { flex: 1 1 320px; min-width: 0; font-size: 15.5px; line-height: 1.6; color: #a8a8b0; text-wrap: pretty; }

  /* Closing */
  .gvp-end { text-align: center; padding-bottom: 80px; }
  .gvp-end-h { font-size: clamp(28px, 4.6vw, 38px); }
  .gvp-end-sub { margin-bottom: 28px; }

  @media (max-width: 560px) {
    .gvp-hero { padding-top: 44px; }
    .gvp-ribbon-stage { margin-bottom: 26px; }
    .gvp-ribbon { width: 96px; height: 134px; }
    .gvp-pill { font-size: 10.5px; letter-spacing: 0.07em; padding: 7px 12px; text-wrap: balance; }
    /* Side by side, smaller, rather than stacked with a screen of air between. */
    .gvp-hero-prizes { flex-wrap: nowrap; gap: 10px; padding-top: 16px; }
    .gvp-hero-prizes .gvp-float-watch .gvp-float-img { width: 100px; height: 125px; }
    .gvp-hero-prizes .gvp-float-strap .gvp-float-img { width: 168px; height: 84px; }
    .gvp-hero-prizes .gvp-float-watch { margin: 12px 0 10px; }
    .gvp-hero-prizes .gvp-float-strap { margin: 20px 0 14px; }
    .gvp-hero-prizes .gvp-float strong { font-size: 13px; }
    .gvp-hero-prizes .gvp-float span { font-size: 12px; }
    .gvp-rule-h { flex-basis: 100%; }
    /* Share the row when both fit, each full width when they cannot. */
    .gvp-badges { gap: 10px; }
    .gvp-badge { flex: 1 1 140px; justify-content: center; gap: 10px; padding: 0 12px; }
    .gvp-badge-l { font-size: 17px; }
    .gvp-cta { width: 100%; }
    .gvp-sec { padding: 52px 0; }
    .gvp-privacy { padding: 20px; gap: 14px; }
  }
</style>
