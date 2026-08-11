<!--
  App Store rating, as stars + the number.

  One component so every surface states the rating identically and reads it from
  the same place (`rating` in site.ts) — a star row that says one thing in the
  hero and another beside the price is worse than no rating at all.

  `size` scales the whole row. `tone="quiet"` is the muted variant for placements
  that sit inside an already-loud card. Half stars are supported so the row stays
  honest the moment the average stops being a whole number.
-->
<script lang="ts">
  import { rating } from './site';

  export let size = 15;
  export let tone: 'bright' | 'quiet' = 'bright';
  /** Suffix after the number, e.g. "on the App Store". Pass '' to show stars + number only. */
  export let label = `on the ${rating.store}`;

  // Fill for star `i` (1-based): full, half, or empty. Rounded to halves so a
  // 4.7 renders as four and a half rather than an arbitrary sliver.
  const fillOf = (i: number) => Math.max(0, Math.min(1, Math.round((rating.stars - i + 1) * 2) / 2));

  const STAR =
    'M12 2.6l2.83 5.73 6.32.92-4.57 4.46 1.08 6.3L12 17.03l-5.66 2.98 1.08-6.3L2.85 9.25l6.32-.92z';

  const text = [
    rating.label,
    rating.reviews ? `(${rating.reviews.toLocaleString('en-US')})` : '',
    label
  ]
    .filter(Boolean)
    .join(' ');
</script>

<span class="stars stars-{tone}" style="--star-size:{size}px" aria-label="Rated {rating.label} out of 5 {label}">
  <span class="stars-row" aria-hidden="true">
    {#each [1, 2, 3, 4, 5] as i}
      <svg class="star" viewBox="0 0 24 24" aria-hidden="true">
        <!-- Empty plate first, then the fill clipped to this star's share, so a
             half star is one shape rather than two mismatched glyphs. -->
        <path d={STAR} class="star-bg" />
        {#if fillOf(i) > 0}
          <clipPath id="starclip-{i}-{size}-{tone}">
            <rect x="0" y="0" width={24 * fillOf(i)} height="24" />
          </clipPath>
          <path d={STAR} class="star-fg" clip-path="url(#starclip-{i}-{size}-{tone})" />
        {/if}
      </svg>
    {/each}
  </span>
  <span class="stars-text" aria-hidden="true">{text}</span>
</span>

<style>
  .stars {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    line-height: 1;
    white-space: nowrap;
  }
  .stars-row {
    display: inline-flex;
    gap: 1.5px;
  }
  .star {
    width: var(--star-size);
    height: var(--star-size);
    flex: none;
    display: block;
  }
  .star-bg {
    fill: rgba(255, 255, 255, 0.14);
  }
  .star-fg {
    fill: #f5c451;
  }
  .stars-text {
    font-size: calc(var(--star-size) * 0.88);
    font-weight: 600;
    color: var(--text);
  }
  .stars-quiet .star-fg {
    fill: #d8ab45;
  }
  .stars-quiet .stars-text {
    font-weight: 500;
    color: var(--dim);
  }
</style>
