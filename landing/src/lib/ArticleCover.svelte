<script lang="ts">
  import { BRAND_POLYLINE, categoryLabel } from './site';

  export let photoLocation: string | undefined = undefined;
  export let photoAttribution: string | undefined = undefined;
  export let title = '';
  export let slug = '';
  export let category: string | undefined = undefined;
  /** Set true for above-the-fold covers (featured) so they aren't lazy-loaded. */
  export let eager = false;
  /** Overlay the category pill on the image. Off for the featured card, which shows the topic in its meta row. */
  export let showTag = true;

  // Deterministic per-article variation for the branded fallback cover, so each
  // article reads differently without any external image. No randomness - keeps
  // prerender stable.
  const hash = (s: string) => {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  };
  $: seed = hash(slug || title);
  // Glow horizontal position (18% / 50% / 82%) and accent tint cycle.
  $: glowX = [22, 50, 78][seed % 3];
  $: tint = ['var(--accent)', 'var(--orange)', 'var(--sky)'][(seed >> 2) % 3];
  $: label = categoryLabel(category);
</script>

{#if photoLocation}
  <div class="cover">
    <img class="cover-img" src={photoLocation} alt={photoAttribution || title} loading={eager ? 'eager' : 'lazy'} />
    {#if label && showTag}<span class="cover-tag">{label}</span>{/if}
  </div>
{:else}
  <div class="cover cover-gen" style="--glow-x:{glowX}%; --tint:{tint};" aria-hidden="true">
    <span class="cover-glow"></span>
    <svg class="cover-ecg" viewBox="0 0 512 512" preserveAspectRatio="xMidYMid meet">
      <polyline
        points={BRAND_POLYLINE}
        fill="none"
        stroke="currentColor"
        stroke-width="14"
        stroke-linejoin="round"
        stroke-linecap="round"
      />
    </svg>
    {#if label && showTag}<span class="cover-tag">{label}</span>{/if}
  </div>
{/if}

<style>
  .cover {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 9;
    overflow: hidden;
    background: var(--bg-1);
  }
  .cover-img { width: 100%; height: 100%; object-fit: cover; display: block; }

  /* Branded, image-free fallback: OLED panel + soft accent glow + pulse line. */
  .cover-gen {
    background:
      radial-gradient(120% 90% at var(--glow-x) -10%, color-mix(in srgb, var(--tint) 22%, transparent), transparent 60%),
      linear-gradient(180deg, var(--panel-2), var(--bg-1));
  }
  .cover-glow {
    position: absolute; inset: 0;
    background: radial-gradient(60% 60% at var(--glow-x) 30%, color-mix(in srgb, var(--tint) 14%, transparent), transparent 70%);
    pointer-events: none;
  }
  .cover-ecg {
    position: absolute; left: 50%; top: 54%;
    width: 78%; transform: translate(-50%, -50%);
    color: var(--tint); opacity: 0.55;
  }

  .cover-tag {
    position: absolute; left: 14px; bottom: 14px; z-index: 2;
    font-family: var(--mono);
    font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; font-weight: 700;
    color: var(--text);
    background: rgba(5, 5, 6, 0.55);
    -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
    border: 1px solid var(--line-2); border-radius: 999px;
    padding: 5px 11px;
  }
</style>
