<script lang="ts">
  import { page } from '$app/stores';
  import type { Article } from '../routes/api/articles/types';
  import { getTopic, topicLabel } from './topics';
  import { articleHref, formatDate, BRAND_POLYLINE, PILLARS, PILLAR_LABELS } from './site';

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
      <div class="sg-orbit sg-orbit-a"><span class="dot" style="background:var(--sky)"></span>RMSSD 34 <em>great</em></div>
      <div class="sg-orbit sg-orbit-b"><span class="dot" style="background:var(--green)"></span>Outlook +12</div>
      <div class="sg-orbit sg-orbit-c"><span class="dot" style="background:var(--accent)"></span>11-day streak</div>
      <div class="side-phone">
      <div class="sg-scr">
        <div class="sg-top">
          <span class="sg-brand">
            <svg viewBox="0 0 512 512"><polyline points={BRAND_POLYLINE} fill="none" stroke="currentColor" stroke-width="46" stroke-linejoin="round" stroke-linecap="round" /></svg>
            <b>Autonomic</b>
          </span>
          <span class="sg-top-ic">☀&#xFE0E; ☰</span>
        </div>
        <div class="sg-cardbox">
          <div class="sg-cardhead">
            <span class="sg-mode">Autonomic Outlook</span>
            <span class="sg-chip">Excellent</span>
          </div>
          <div class="sg-gauge">
            <svg viewBox="0 0 176 176">
              <path d="M35.67 140.33 A74 74 0 1 1 140.33 140.33" fill="none" stroke="#222226" stroke-width="12" stroke-linecap="round" />
              <path d="M35.67 140.33 A74 74 0 1 1 161.77 93.81" fill="none" stroke="#16a34a" stroke-width="19" stroke-linecap="round" opacity="0.16" />
              <path d="M35.67 140.33 A74 74 0 1 1 161.77 93.81" fill="none" stroke="#16a34a" stroke-width="12" stroke-linecap="round" />
            </svg>
            <div class="sg-gauge-in"><div class="sg-num">85</div><div class="sg-den">OUT OF 100</div></div>
          </div>
          <div class="sg-status">Excellent Autonomic Day</div>
        </div>
        <div class="sg-tabs"><span class="on">Journal</span><span>Analysis</span><span>Insights</span></div>
      </div>
      </div>
    </div>

    <h2 class="side-get-h">Track your recovery</h2>
    <p class="side-get-p">Score your daily HRV, BP and orthostatic readings, privately on your iPhone.</p>
    <a class="dl-ios-badge" href="#" aria-label="Download on the App Store">
      <svg viewBox="0 0 120 40" role="img" aria-label="Download on the App Store" xmlns="http://www.w3.org/2000/svg">
        <rect x="0.5" y="0.5" width="119" height="39" rx="6.5" fill="#000" stroke="rgba(255,255,255,0.4)" />
        <path transform="translate(10,7.5) scale(0.05)" fill="#fff" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5c0 26.2 4.8 53.3 14.4 81.2 12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 20-27.8 44.7-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
        <text x="35" y="16" fill="#fff" font-family="-apple-system, Helvetica, Arial, sans-serif" font-size="7.5">Download on the</text>
        <text x="34" y="31" fill="#fff" font-family="-apple-system, Helvetica, Arial, sans-serif" font-size="16" font-weight="600" letter-spacing="-0.3">App Store</text>
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
