<!-- Polar H10 prize illustration. Pass a distinct `k` for each copy on a page: it suffixes every gradient id. -->
<script lang="ts">
  export let k = '';
</script>
<svg viewBox="0 0 360 180" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style="display:block;overflow:visible" aria-hidden="true">
  <defs>
    <linearGradient id="sStrap{k}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2a2b2f" /><stop offset="0.35" stop-color="#1a1b1e" /><stop offset="1" stop-color="#08080a" />
    </linearGradient>
    <linearGradient id="sEdge{k}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#000" stop-opacity="0.7" /><stop offset="0.2" stop-color="#000" stop-opacity="0" /><stop offset="0.8" stop-color="#000" stop-opacity="0" /><stop offset="1" stop-color="#000" stop-opacity="0.7" />
    </linearGradient>
    <radialGradient id="sMod{k}" cx="0.36" cy="0.26" r="0.85">
      <stop offset="0" stop-color="#55565c" /><stop offset="0.32" stop-color="#2b2c30" /><stop offset="0.7" stop-color="#141517" /><stop offset="1" stop-color="#070708" />
    </radialGradient>
    <linearGradient id="sGloss{k}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0.13" /><stop offset="1" stop-color="#fff" stop-opacity="0.02" />
    </linearGradient>
    <pattern id="sWeave{k}" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="1.1" height="4" fill="#fff" opacity="0.05" /></pattern>
    <filter id="sShadow{k}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7" /></filter>
  </defs>
  <ellipse cx="180" cy="160" rx="120" ry="8" fill="#000" opacity="0.75" filter="url(#sShadow{k})" />
  <path d="M-10 62 Q180 112 370 62 L370 108 Q180 158 -10 108 Z" fill="url(#sStrap{k})" />
  <path d="M-10 62 Q180 112 370 62 L370 108 Q180 158 -10 108 Z" fill="url(#sWeave{k})" />
  <path d="M-10 62 Q180 112 370 62 L370 108 Q180 158 -10 108 Z" fill="url(#sEdge{k})" />
  <path d="M-10 67 Q180 117 370 67" fill="none" stroke="#fff" stroke-opacity="0.09" stroke-width="1" stroke-dasharray="2.5 3" />
  <path d="M-10 103 Q180 153 370 103" fill="none" stroke="#fff" stroke-opacity="0.06" stroke-width="1" stroke-dasharray="2.5 3" />
  <ellipse cx="184" cy="122" rx="78" ry="36" fill="#000" opacity="0.8" filter="url(#sShadow{k})" />
  <rect x="106" y="78" width="148" height="66" rx="33" fill="url(#sMod{k})" />
  <rect x="106.5" y="78.5" width="147" height="65" rx="32.5" fill="none" stroke="#fff" stroke-opacity="0.14" stroke-width="1" />
  <rect x="115" y="85" width="130" height="52" rx="26" fill="#050506" />
  <rect x="115" y="85" width="130" height="52" rx="26" fill="none" stroke="#000" stroke-width="1.4" />
  <rect x="115.5" y="85.5" width="129" height="51" rx="25.5" fill="none" stroke="#fff" stroke-opacity="0.07" stroke-width="1" />
  <g transform="translate(16.5 0) skewX(-8)" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-weight="900" font-size="17.5" fill="#e9e9ec">
    <text x="147" y="118">P</text>
    <circle cx="166.5" cy="111.8" r="6.4" fill="#e03127" />
    <text x="175" y="118" letter-spacing="1.3">LAR</text>
  </g>
  <path d="M141 85 L245 85 L245 111 C214 101 170 99 115 108 L115 111 C115 96 126 85 141 85 Z" fill="url(#sGloss{k})" />
</svg>
