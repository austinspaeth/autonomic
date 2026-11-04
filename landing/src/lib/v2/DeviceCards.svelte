<!-- "Works with what you have": one card per device, led by its own mark. Used
     by /features and the Journal + HRV page so the two draw the same cards.
     Logos live in static/brands; the phone camera is drawn here. -->
<script lang="ts">
  export let devices: { name: string; logos: string[]; body: string; tag?: string }[];
  const ALT: Record<string, string> = { polar: 'Polar', coospo: 'Coospo', garmin: 'Garmin', 'apple-watch': 'Apple Watch' };
</script>

<div class="v2-devs" style="--n:{devices.length}">
  {#each devices as d}
    <div>
      <span class="v2-devs-logos">
        {#each d.logos as l}
          {#if l === 'camera'}<svg class="v2-devs-mark" viewBox="0 0 40 40" role="img" aria-label="Phone camera"><rect x="1" y="1" width="38" height="38" rx="11" fill="#2a2630" /><circle cx="12.5" cy="12.5" r="6.4" fill="#141217" stroke="#4a4552" stroke-width="1.6" /><circle cx="12.5" cy="27.5" r="6.4" fill="#141217" stroke="#4a4552" stroke-width="1.6" /><circle cx="27.5" cy="20" r="6.4" fill="#141217" stroke="#4a4552" stroke-width="1.6" /><circle cx="12.5" cy="12.5" r="2.2" fill="#3b3a63" /><circle cx="12.5" cy="27.5" r="2.2" fill="#3b3a63" /><circle cx="27.5" cy="20" r="2.2" fill="#3b3a63" /><circle cx="29" cy="9" r="2.4" fill="#f4e9c8" /></svg>
          {:else if l === 'health'}<svg class="v2-devs-mark" viewBox="0 0 40 40" role="img" aria-label="Apple Health"><defs><linearGradient id="ahHeart" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff6482" /><stop offset="1" stop-color="#ff2d55" /></linearGradient></defs><rect x="1" y="1" width="38" height="38" rx="9" fill="#fff" stroke="#e3dde2" /><path d="M29.4 8.6c-2.4 0-4.6 1.2-5.8 3.2-1.2-2-3.4-3.2-5.8-3.2-3.8 0-6.6 3-6.6 6.8 0 5.8 7.4 10.6 12.4 14 5-3.4 12.4-8.2 12.4-14 0-3.8-2.8-6.8-6.6-6.8z" transform="translate(-3.6 0)" fill="url(#ahHeart)" /></svg>
          {:else if l === 'hc'}<img class="v2-devs-mark" src="/brands/health-connect.png" width="40" height="40" alt="Health Connect" loading="lazy" />
          {:else}<img class="v2-devs-word" src="/brands/{l}.svg" alt={ALT[l]} loading="lazy" />{/if}
        {/each}
        {#if d.tag}<i class="v2-devs-tag">{d.tag}</i>{/if}
      </span>
      <b>{d.name}</b><span>{d.body}</span>
    </div>
  {/each}
</div>
