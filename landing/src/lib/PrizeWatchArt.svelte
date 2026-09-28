<!-- Apple Watch prize illustration. Pass a distinct `k` for each copy on a page: it suffixes every gradient id. -->
<script lang="ts">
  export let k = '';
</script>
<svg viewBox="0 0 200 250" width="100%" height="100%" style="display:block;overflow:visible" aria-hidden="true">
  <defs>
    <linearGradient id="wCase{k}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#9a9ca2" /><stop offset="0.22" stop-color="#55575d" /><stop offset="0.5" stop-color="#1c1d20" /><stop offset="0.78" stop-color="#3d3f44" /><stop offset="1" stop-color="#8b8d93" />
    </linearGradient>
    <linearGradient id="wBand{k}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#0e0f11" /><stop offset="0.18" stop-color="#232428" /><stop offset="0.5" stop-color="#2e2f34" /><stop offset="0.82" stop-color="#232428" /><stop offset="1" stop-color="#0e0f11" />
    </linearGradient>
    <linearGradient id="wBandShadeT{k}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000" stop-opacity="0" /><stop offset="1" stop-color="#000" stop-opacity="0.55" />
    </linearGradient>
    <linearGradient id="wBandShadeB{k}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000" stop-opacity="0.55" /><stop offset="1" stop-color="#000" stop-opacity="0" />
    </linearGradient>
    <linearGradient id="wGlass{k}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0.2" /><stop offset="0.35" stop-color="#fff" stop-opacity="0.04" /><stop offset="0.5" stop-color="#fff" stop-opacity="0" />
    </linearGradient>
    <linearGradient id="wCrown{k}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#2a2b2f" /><stop offset="0.45" stop-color="#9a9ca2" /><stop offset="1" stop-color="#3a3b40" />
    </linearGradient>
    <pattern id="wKnurl{k}" width="10" height="2" patternUnits="userSpaceOnUse"><rect width="10" height="0.8" fill="#000" opacity="0.45" /></pattern>
    <filter id="wShadow{k}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6" /></filter>
  </defs>
  <ellipse cx="104" cy="238" rx="58" ry="7" fill="#000" opacity="0.8" filter="url(#wShadow{k})" />
  <g transform="rotate(-7 100 125)" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif">
    <rect x="62" y="-6" width="76" height="86" rx="16" fill="url(#wBand{k})" />
    <rect x="62" y="40" width="76" height="40" fill="url(#wBandShadeT{k})" />
    <rect x="62" y="172" width="76" height="84" rx="16" fill="url(#wBand{k})" />
    <rect x="62" y="172" width="76" height="36" fill="url(#wBandShadeB{k})" />
    {#each [214, 229, 244] as cy}
      <ellipse cx="100" {cy} rx="3.2" ry="2.6" fill="#050506" />
      <ellipse cx="100" cy={cy + 1.4} rx="3.2" ry="1.2" fill="#fff" opacity="0.06" />
    {/each}
    <rect x="155" y="88" width="11" height="28" rx="4.5" fill="url(#wCrown{k})" />
    <rect x="157" y="88" width="9" height="28" rx="4" fill="url(#wKnurl{k})" />
    <rect x="156" y="126" width="5.5" height="34" rx="2.5" fill="#2a2b2f" />
    <rect x="40" y="58" width="120" height="140" rx="38" fill="url(#wCase{k})" />
    <rect x="42.5" y="60.5" width="115" height="135" rx="35.5" fill="none" stroke="#fff" stroke-opacity="0.22" stroke-width="1" />
    <rect x="47" y="65" width="106" height="126" rx="31" fill="#030304" />
    <text x="134" y="80" text-anchor="end" fill="#f2f2f5" font-size="8" font-weight="600">11:19</text>
    <text x="100" y="88" text-anchor="middle" fill="#8a8a92" font-size="5.4" font-weight="700" letter-spacing="0.8">HEART RATE</text>
    <path d="M100 102 c-3.6-2.5-5.6-4.6-5.6-7.1 a3 3 0 0 1 5.6-1.7 a3 3 0 0 1 5.6 1.7 c0 2.5-2 4.6-5.6 7.1z" fill="#e03127" />
    <text x="100" y="127" text-anchor="middle" fill="#f2f2f5" font-size="29" font-weight="800" letter-spacing="-0.8">58</text>
    <text x="100" y="136" text-anchor="middle" fill="#8a8a92" font-size="5.8" font-weight="700" letter-spacing="0.6">BPM</text>
    <path d="M141.5 109.5 l3 3.5 -3 3.5" fill="none" stroke="#6a6a72" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
    <rect x="55" y="142" width="43" height="34" rx="7" fill="#1a1a1c" />
    <rect x="102" y="142" width="43" height="34" rx="7" fill="#1a1a1c" />
    <text x="59.5" y="151.5" fill="#8a8a92" font-size="4.4" font-weight="700" letter-spacing="0.4">2 MIN AVG</text>
    <text x="59.5" y="169" fill="#f2f2f5" font-size="13" font-weight="800">57</text>
    <text x="106.5" y="151.5" fill="#8a8a92" font-size="4.4" font-weight="700" letter-spacing="0.4">DELTA</text>
    <text x="106.5" y="169" fill="#3ec46d" font-size="13" font-weight="800">Δ +1</text>
    <rect x="47" y="65" width="106" height="126" rx="31" fill="url(#wGlass{k})" />
    <path d="M48 112 C48 82 62 66 90 62" fill="none" stroke="#fff" stroke-opacity="0.45" stroke-width="1.4" stroke-linecap="round" />
  </g>
</svg>
