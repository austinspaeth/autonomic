<!-- A phone frame. Pass `src` for a real screenshot, or a slot for a drawn screen
     (authored at 260px wide and scaled to `w`). A drawn card screen can pass
     `chrome` to wear the app's real status bar and floating tab bar (and, on
     the Journal, its date header) in place of the placeholder island and tabs,
     so a large phone reads as a device rather than a sketch. -->
<script lang="ts">
  import PhoneChrome from './screens/PhoneChrome.svelte';
  export let w = 260;
  export let src = '';
  export let alt = '';
  export let chrome: '' | 'journal' | 'progress' | 'insight' = '';
  /** The Journal's date header under the status bar; on by default there. */
  export let date: string | null = 'Tue, Oct 14';
  $: k = w / 260;
  $: header = chrome === 'journal' && !!date;
</script>

<div class="v2-ph" style="width:{w}px;height:{Math.round(w * 2.077)}px">
  <div class="v2-ph-in" style="transform:scale({k})">
    <div class="v2-ph-screen" class:real={!!src} class:chromed={!!chrome} class:dated={header}>
      {#if src}
        <img {src} {alt} width="242" height="526" loading="lazy" />
      {:else if chrome}
        <slot />
        <div class="v2-ph-chrome" aria-hidden="true">
          <PhoneChrome tab={chrome} />
          {#if header}
            <div class="v2-ph-date">
              <svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg>
              <span>{date}</span>
              <svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" /></svg>
            </div>
          {/if}
        </div>
      {:else}
        <span class="v2-ph-island"></span>
        <slot />
        <div class="v2-ph-tabs" aria-hidden="true"><span class="on"><i></i>Journal</span><span><i></i>Progress</span><span><i></i>Insights</span><span><i></i>Settings</span></div>
      {/if}
    </div>
  </div>
</div>
