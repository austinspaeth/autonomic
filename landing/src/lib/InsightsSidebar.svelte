<script lang="ts">
  import { page } from '$app/stores';
  import type { Article } from '../routes/api/articles/types';
  import { getTopic, topicLabel } from './topics';
  import { articleHref, formatDate, BRAND_POLYLINE, APP_MARK_PATH, PILLARS, PILLAR_LABELS, appStoreLink, playStoreLink } from './site';

  $: articles = (($page.data as { articles?: Article[] }).articles ?? []) as Article[];
  $: activeSlug = $page.params?.slug ?? '';

  // "Start here" lists the cornerstone pillar articles in their canonical order,
  // resolved from PILLARS against the live article list (skips any not yet published).
  $: pillars = PILLARS.map((slug) => articles.find((a) => a.slug === slug)).filter(
    (a): a is Article => Boolean(a)
  );

  // Scope "recent" to the current topic on a topic hub, a topic's article list,
  // or a specific article (its URL topic). Elsewhere (home / all articles) show all.
  $: topicSlug = $page.params?.topic ?? '';
  $: topicShort = topicSlug ? (getTopic(topicSlug)?.shortName ?? topicLabel(topicSlug)) : '';
  $: scoped = topicSlug ? articles.filter((a) => a.categories?.includes(topicSlug)) : articles;
  $: recent = [...scoped].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8);
  $: recentHeading = topicShort ? `Recent ${topicShort} articles` : 'Recent articles';
  $: allHref = topicSlug ? `/insights/articles/${topicSlug}/` : '/insights/articles/';
  $: allLabel = topicShort ? `All ${topicShort} articles →` : 'All articles →';
</script>

<div class="side-stack">
  {#if pillars.length}
    <section class="side-card">
      <h2 class="side-title">Start here</h2>
      <ul class="side-topics side-pillars">
        {#each pillars as a, i (a.slug)}
          <li>
            <a href={articleHref(a)} class:active={a.slug === activeSlug}>
              <span class="side-pillar-n" aria-hidden="true">{i + 1}</span>
              <span>{PILLAR_LABELS[a.slug] ?? a.title}</span>
            </a>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  <section class="side-card side-get">
    <div class="side-get-glow" aria-hidden="true"></div>

    <!-- Compact version of the landing hero phone, with hovering chips. -->
    <div class="side-phone-stage" aria-hidden="true">
      <div class="sg-orbit sg-orbit-a"><span class="dot" style="background:var(--sky)"></span>RMSSD 34</div>
      <div class="sg-orbit sg-orbit-b"><span class="dot" style="background:var(--green)"></span>Outlook +12</div>
      <div class="sg-orbit sg-orbit-c"><span class="dot" style="background:var(--accent)"></span>2 clean days</div>
      <div class="side-phone">
      <div class="sg-scr">
        <div class="sg-statusbar">
          <span class="sg-time">8:00</span>
          <span class="sg-island"></span>
          <span class="sg-sysic">
            <svg class="sg-wifi" viewBox="0 0 16 12"><path d="M8 10.6 5.9 8.4a3 3 0 0 1 4.2 0zM3.8 6.3a6 6 0 0 1 8.4 0l1.3-1.4a8 8 0 0 0-11 0zM1.6 4a9.2 9.2 0 0 1 12.8 0l1.3-1.4a11.1 11.1 0 0 0-15.4 0z" fill="currentColor"/></svg>
            <svg class="sg-batt" viewBox="0 0 27 12"><rect x="0.5" y="0.5" width="22" height="11" rx="3.2" fill="none" stroke="currentColor" stroke-opacity="0.45"/><rect x="2" y="2" width="19" height="8" rx="2" fill="currentColor"/><path d="M24.2 4.2v3.6a2 2 0 0 0 0-3.6z" fill="currentColor" fill-opacity="0.45"/></svg>
          </span>
        </div>
        <div class="sg-datebar"><span class="sg-arw">‹</span><span class="sg-date">Sat, Aug 1</span><span class="sg-arw">›</span></div>
        <div class="sg-body">
          <div class="sg-cardbox">
            <div class="sg-cardhead">
              <span class="sg-mode">Autonomic Outlook</span>
              <span class="sg-chip">Excellent</span>
            </div>
            <div class="sg-gauge">
              <svg viewBox="0 0 176 176">
                <path d="M35.67 140.33 A74 74 0 1 1 140.33 140.33" fill="none" stroke="#2b3a2c" stroke-width="15" stroke-linecap="round" />
                <path d="M35.67 140.33 A74 74 0 1 1 152.6 118.3" fill="none" stroke="#6ee06e" stroke-width="15" stroke-linecap="round" />
              </svg>
              <div class="sg-gauge-in"><div class="sg-num">92</div><div class="sg-den">OUT OF 100</div></div>
            </div>
            <div class="sg-status">95% confidence</div>
          </div>
          <div class="sg-tile">
            <span class="sg-tile-ic" style="background:rgba(224,49,39,.16);color:#e03127">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/></svg>
            </span>
            <span class="sg-tile-body">
              <b>Milestones</b>
              <span class="sg-bar"><i style="width:69%"></i></span>
            </span>
          </div>
          <div class="sg-tile">
            <span class="sg-tile-ic" style="background:rgba(245,158,11,.16);color:#f59e0b">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2.5l1.7 4.3 4.3 1.7-4.3 1.7L13 14.5l-1.7-4.3L7 8.5l4.3-1.7zM6.5 14l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9z"/></svg>
            </span>
            <span class="sg-tile-body">
              <b>2 <span class="sg-tile-mute">clean days</span></b>
              <span class="sg-tile-sub">Streak continues.</span>
            </span>
          </div>
          <div class="sg-sec">
            <div class="sg-sec-h">Sleep</div>
            <div class="sg-sleep">
              <div class="sg-cardhead"><span class="sg-mode">Last night</span><span class="sg-chip sg-chip-good">Good</span></div>
              <div class="sg-big"><b>7.8</b><span>hrs asleep</span></div>
              <div class="sg-stages"><i style="flex:22;background:#4f7cff"></i><i style="flex:19;background:#a06bff"></i><i style="flex:52;background:#3aa0d8"></i><i style="flex:7;background:#4a4a52"></i></div>
            </div>
          </div>
        </div>
        <div class="sg-tabs">
          <span class="sg-tab sg-tab-brand"><svg viewBox="0 0 651.59 348.34"><path d={APP_MARK_PATH} fill="currentColor" /></svg></span>
          <span class="sg-tab on">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M9 11h6M9 15h4"/></svg>
            <b>Journal</b>
          </span>
          <span class="sg-tab">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.5 15v-3M12 15V9.5M15.5 15v-1.8"/></svg>
            <b>Progress</b>
          </span>
          <span class="sg-tab">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l1.5 3.9L17.4 8.4l-3.9 1.5L12 13.8l-1.5-3.9L6.6 8.4l3.9-1.5zM6.6 14.4l.8 2.1 2.1.8-2.1.8-.8 2.1-.8-2.1-2.1-.8 2.1-.8z"/></svg>
            <b>Insight</b>
          </span>
          <span class="sg-tab sg-tab-gear">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 13.5a7.7 7.7 0 0 0 0-3l1.8-1.4-1.8-3.1-2.2.8a7.6 7.6 0 0 0-2.6-1.5L14.2 3h-3.6l-.4 2.3A7.6 7.6 0 0 0 7.6 6.8l-2.2-.8-1.8 3.1L5.4 10.5a7.7 7.7 0 0 0 0 3l-1.8 1.4 1.8 3.1 2.2-.8a7.6 7.6 0 0 0 2.6 1.5l.4 2.3h3.6l.4-2.3a7.6 7.6 0 0 0 2.6-1.5l2.2.8 1.8-3.1z"/></svg>
          </span>
        </div>
      </div>
      </div>
    </div>

    <h2 class="side-get-h">Track your recovery</h2>
    <p class="side-get-p">Score your daily HRV, BP and orthostatic readings, privately on your iPhone or Android.</p>
    <a class="dl-ios-badge" href={appStoreLink} data-dl-store="ios" aria-label="Download on the App Store">
      <svg viewBox="0 0 120 40" role="img" aria-label="Download on the App Store" xmlns="http://www.w3.org/2000/svg">
        <rect x="0.5" y="0.5" width="119" height="39" rx="6.5" fill="#000" stroke="rgba(255,255,255,0.4)" />
        <path transform="translate(10,7.5) scale(0.05)" fill="#fff" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5c0 26.2 4.8 53.3 14.4 81.2 12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 20-27.8 44.7-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
        <text x="35" y="16" fill="#fff" font-family="-apple-system, Helvetica, Arial, sans-serif" font-size="7.5">Download on the</text>
        <text x="34" y="31" fill="#fff" font-family="-apple-system, Helvetica, Arial, sans-serif" font-size="16" font-weight="600" letter-spacing="-0.3">App Store</text>
      </svg>
    </a>
    <a class="dl-ios-badge" href={playStoreLink} data-dl-store="android" aria-label="Get it on Google Play">
      <svg viewBox="0 0 120 40" role="img" aria-label="Get it on Google Play" xmlns="http://www.w3.org/2000/svg">
        <rect x="0.5" y="0.5" width="119" height="39" rx="6.5" fill="#000" stroke="rgba(255,255,255,0.4)" />
        <g transform="translate(1.11,1.17) scale(0.94)" stroke-width="1.6" stroke-linejoin="round">
          <path fill="#00C3FF" stroke="#00C3FF" d="M10 8 21 19.5 10 19.5Z" />
          <path fill="#FF3A44" stroke="#FF3A44" d="M10 8 27 19.5 21 19.5Z" />
          <path fill="#00D66F" stroke="#00D66F" d="M10 19.5 21 19.5 10 31Z" />
          <path fill="#FFCE00" stroke="#FFCE00" d="M21 19.5 27 19.5 10 31Z" />
        </g>
        <text x="35" y="16" fill="#fff" font-family="-apple-system, Helvetica, Arial, sans-serif" font-size="7">GET IT ON</text>
        <text x="34" y="31" fill="#fff" font-family="-apple-system, Helvetica, Arial, sans-serif" font-size="14.5" textLength="78" lengthAdjust="spacingAndGlyphs" font-weight="600" letter-spacing="-0.2">Google Play</text>
      </svg>
    </a>
  </section>

  {#if recent.length}
    <section class="side-card">
      <h2 class="side-title">{recentHeading}</h2>
      <ul class="side-recent">
        {#each recent as a (a.slug)}
          <li>
            <a class="side-recent-link" class:active={a.slug === activeSlug} href={articleHref(a)}>
              <span class="side-recent-t">{a.title}</span>
              <span class="side-recent-d">{formatDate(a.date, 'short')} · {a.author}</span>
            </a>
          </li>
        {/each}
      </ul>
      <a class="side-all" href={allHref}>{allLabel}</a>
    </section>
  {/if}
</div>
