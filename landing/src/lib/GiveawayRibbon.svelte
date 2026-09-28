<script lang="ts">
  // Awareness ribbon: one path, drawn four times (glow, body, travelling
  // shine, edge highlight). Colours drift through the teal family on a slow
  // loop via SMIL, which CSS reduced-motion cannot pause, so the moving
  // layers are hidden under that preference instead. One per page: the
  // gradient ids are fixed.
  const RIBBON = 'M80 134 L43 63 C29 37 32 9 50 9 C68 9 71 37 57 63 L20 134';
  const EASE3 = '0.45 0 0.55 1;0.45 0 0.55 1;0.45 0 0.55 1';
  const ribbonStops = [
    ['0%', '#5eead4;#67e8f9;#99f6e4;#5eead4'],
    ['55%', '#14b8a6;#06b6d4;#2dd4bf;#14b8a6'],
    ['100%', '#0f766e;#0e7490;#115e59;#0f766e']
  ];
</script>

<svg viewBox="0 0 100 140" width="100%" height="100%" role="img" aria-label="Teal awareness ribbon">
  <defs>
    <linearGradient id="gvaRibG" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="100" y2="140">
      {#each ribbonStops as [off, vals]}
        <stop offset={off} stop-color={vals.split(';')[0]}>
          <animate attributeName="stop-color" values={vals} dur="9s" repeatCount="indefinite" calcMode="spline" keySplines={EASE3} />
        </stop>
      {/each}
    </linearGradient>
    <linearGradient id="gvaRibS" gradientUnits="userSpaceOnUse" x1="-60" y1="0" x2="0" y2="0">
      <stop offset="0%" stop-color="#ecfeff" stop-opacity="0" />
      <stop offset="50%" stop-color="#ecfeff" stop-opacity="0.7" />
      <stop offset="100%" stop-color="#ecfeff" stop-opacity="0" />
      <animateTransform attributeName="gradientTransform" type="translate" values="-20 -30;180 50" dur="5.5s" repeatCount="indefinite" calcMode="spline" keyTimes="0;1" keySplines="0.4 0 0.2 1" />
    </linearGradient>
    <filter id="gvaRibB" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="8" /></filter>
  </defs>
  <path class="moving" d={RIBBON} fill="none" stroke="url(#gvaRibG)" stroke-width="20" stroke-linejoin="round" filter="url(#gvaRibB)" opacity="0.7">
    <animate attributeName="opacity" values="0.4;0.9;0.4" dur="7s" repeatCount="indefinite" calcMode="spline" keySplines="0.45 0 0.55 1;0.45 0 0.55 1" />
  </path>
  <path d={RIBBON} fill="none" stroke="url(#gvaRibG)" stroke-width="17" stroke-linejoin="round" />
  <path class="moving" d={RIBBON} fill="none" stroke="url(#gvaRibS)" stroke-width="17" stroke-linejoin="round" style="mix-blend-mode:screen" />
  <path d={RIBBON} fill="none" stroke="#ecfeff" stroke-opacity="0.22" stroke-width="1.4" stroke-linejoin="round" transform="translate(-4 -2)" />
</svg>

<style>
  svg { display: block; overflow: visible; }
  @media (prefers-reduced-motion: reduce) {
    .moving { display: none; }
  }
</style>
