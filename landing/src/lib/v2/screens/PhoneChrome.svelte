<!-- The device chrome every drawn app screen shares, in iPhone POINTS: the
     status bar (with the island) at the top and, unless `tabs` is false, the
     app's floating tab bar plus the home indicator at the bottom. Place it
     inside a 390pt screen root (see JournalScreen). The tab bar is
     app/(tabs)/_layout.tsx: a centred dark pill, the brand mark, the focused
     tab on its own lighter pill, the cog. -->
<script lang="ts">
  import { APP_MARK_PATH } from '$lib/site';
  export let tab: 'journal' | 'progress' | 'insight' = 'journal';
  export let tabs = true;
  export let time = '9:41';
  /** Battery level, 0 to 1. iOS draws it red at 20% and under. */
  export let battery = 1;
  $: low = battery <= 0.2;
</script>

<div class="pc-status">
  <b>{time}</b>
  <span class="pc-island"></span>
  <span class="pc-sys">
    <svg viewBox="0 0 18 12" width="18" height="12"><rect x="0" y="8" width="3" height="4" rx="1" /><rect x="5" y="5.5" width="3" height="6.5" rx="1" /><rect x="10" y="3" width="3" height="9" rx="1" /><rect x="15" y="0" width="3" height="12" rx="1" /></svg>
    <svg viewBox="0 0 16 12" width="16" height="12"><path d="M8 11.5 5.6 8.9a3.4 3.4 0 0 1 4.8 0zM3.5 6.8a6.4 6.4 0 0 1 9 0l-1.4 1.5a4.4 4.4 0 0 0-6.2 0zM1.3 4.6a9.5 9.5 0 0 1 13.4 0l-1.4 1.5a7.5 7.5 0 0 0-10.6 0z" /></svg>
    <svg viewBox="0 0 27 13" width="27" height="13"><rect x=".5" y=".5" width="23" height="12" rx="3.6" fill="none" stroke="currentColor" stroke-opacity=".4" /><rect x="2.2" y="2.2" width={Math.max(2.4, 19.6 * battery)} height="8.6" rx="2.2" fill={low ? '#ff3b30' : 'currentColor'} /><path d="M25 4.5v4c.8-.3 1.3-1.1 1.3-2s-.5-1.7-1.3-2z" fill-opacity=".45" /></svg>
  </span>
</div>

{#if tabs}
  <div class="pc-tabs">
    <span class="pc-mark"><svg viewBox="0 0 651.59 348.34"><path d={APP_MARK_PATH} fill="#e03127" stroke="#e03127" stroke-width="9" /></svg></span>
    <span class="pc-tab" class:on={tab === 'journal'}><svg viewBox="0 0 24 24"><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1H9zM9 11h6M9 15h4" /></svg>Journal</span>
    <span class="pc-tab" class:on={tab === 'progress'}><svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 16v-4M12 16V8M16 16v-6" /></svg>Progress</span>
    <span class="pc-tab" class:on={tab === 'insight'}><svg viewBox="0 0 24 24"><path d="M12 3l1.4 4.1L17.5 8l-3.6 1.4L12 13l-1.9-3.6L6.5 8l4.1-.9zM18.5 14l.8 2.3 2.2.8-2.2.8-.8 2.3-.8-2.3-2.2-.8 2.2-.8zM5 15l.6 1.6L7 17l-1.4.4L5 19l-.6-1.6L3 17l1.4-.4z" /></svg>Insight</span>
    <span class="pc-tab cog"><svg viewBox="0 0 24 24"><path fill-rule="evenodd" d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96a7.03 7.03 0 0 0-1.62-.94l-.36-2.54a.48.48 0 0 0-.5-.42h-3.84a.48.48 0 0 0-.5.42l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96a.48.48 0 0 0-.59.22L2.74 8.87a.49.49 0 0 0 .12.61l2.03 1.58c-.05.3-.07.62-.07.94 0 .32.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.14.24.42.34.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.17.07.45-.02.59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.03-1.58zM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2z" /></svg></span>
  </div>
{/if}
<span class="pc-home"></span>

<style>
  svg { display: block; }
  .pc-status { position: relative; z-index: 6; height: 54px; display: flex; align-items: center; justify-content: space-between; padding: 6px 30px 0 48px; color: #fff; }
  .pc-status b { font-size: 17px; font-weight: 600; letter-spacing: -.01em; }
  .pc-island { position: absolute; left: 50%; top: 11px; width: 126px; height: 37px; margin-left: -63px; border-radius: 999px; background: #000; box-shadow: 0 0 0 1px #0b0b0c; }
  .pc-sys { display: flex; align-items: center; gap: 6px; fill: currentColor; }

  .pc-tabs { position: absolute; z-index: 6; left: 50%; bottom: 46px; transform: translateX(-50%); width: max-content; display: flex; align-items: center; gap: 2px; padding: 5px; border-radius: 999px; background: rgba(6,6,9,.86); border: 1px solid rgba(255,255,255,.08); box-shadow: 0 10px 30px rgba(0,0,0,.6); -webkit-backdrop-filter: blur(20px); backdrop-filter: blur(20px); }
  .pc-tabs > span { flex: none; }
  .pc-mark { padding: 0 6px 0 8px; margin-right: 8px; }
  .pc-mark svg { width: 38px; height: 20px; }
  .pc-tab { display: flex; flex-direction: column; align-items: center; padding: 8px 16px; border-radius: 999px; font-size: 11px; font-weight: 600; color: #9a9aa0; }
  .pc-tab svg { width: 22px; height: 22px; margin-bottom: 3px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  .pc-tab.on { color: #f2f2f5; background: rgba(255,255,255,.14); }
  .pc-tab.cog { align-self: stretch; justify-content: center; }
  .pc-tab.cog svg { fill: #9a9aa0; stroke: none; margin: 0; }
  .pc-home { position: absolute; z-index: 6; left: 50%; bottom: 8px; width: 134px; height: 5px; margin-left: -67px; border-radius: 9px; background: #f2f2f5; }
</style>
