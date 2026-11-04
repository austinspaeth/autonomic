<!-- Drawn: the iPhone lock screen at 9:00 two days before a predicted period,
     holding the cycle heads-up. The copy is HEADS_UP_COPY verbatim
     (mobile/src/lib/cycle/headsUp.ts): it never names a period or a cycle, so
     it says nothing to anyone who glances at the phone. Authored in iPhone
     POINTS like the other drawn screens. -->
<script lang="ts">
  import { APP_MARK_PATH } from '$lib/site';
  // Defaults are the cycle heads-up; a page can pass another notification the
  // app really sends (the crash warning, reminders.ts), word for word.
  export let date = 'Friday, October 17';
  export let time = '9:00';
  export let title = 'A heads-up';
  export let body = 'The next few days may be harder than usual. Plan a little lighter if you can.';
</script>

<div class="ls" aria-hidden="true">
  <div class="ls-status">
    <span></span>
    <span class="ls-island"></span>
    <span class="ls-sys">
      <svg viewBox="0 0 18 12" width="18" height="12"><rect x="0" y="8" width="3" height="4" rx="1" /><rect x="5" y="5.5" width="3" height="6.5" rx="1" /><rect x="10" y="3" width="3" height="9" rx="1" /><rect x="15" y="0" width="3" height="12" rx="1" /></svg>
      <svg viewBox="0 0 27 13" width="27" height="13"><rect x=".5" y=".5" width="23" height="12" rx="3.6" fill="none" stroke="currentColor" stroke-opacity=".5" /><rect x="2.2" y="2.2" width="16" height="8.6" rx="2.2" fill="currentColor" /></svg>
    </span>
  </div>
  <div class="ls-lock"><svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg></div>
  <div class="ls-date">{date}</div>
  <div class="ls-time">{time}</div>

  <div class="ls-note">
    <span class="ls-icon"><svg viewBox="0 0 651.59 348.34"><path d={APP_MARK_PATH} fill="#e03127" stroke="#e03127" stroke-width="9" /></svg></span>
    <span class="ls-copy">
      <span class="ls-head"><b>{title}</b><small>now</small></span>
      <span class="ls-body">{body}</span>
    </span>
  </div>

  <div class="ls-foot">
    <span class="ls-btn"><svg viewBox="0 0 24 24"><path d="M9 2h6l-1 7h3l-6 13 1-9H8z" /></svg></span>
    <span class="ls-btn"><svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg></span>
  </div>
  <span class="ls-home"></span>
</div>

<style>
  .ls { position: absolute; left: 0; top: 0; width: 390px; height: 842px; transform: scale(.62051); transform-origin: 0 0; overflow: hidden; color: #fff; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased;
    background: radial-gradient(120% 70% at 30% 20%, #4a3550 0%, #2a2231 45%, #120e15 100%); }
  .ls svg { display: block; }
  .ls-status { position: relative; height: 54px; display: flex; align-items: center; justify-content: space-between; padding: 6px 30px 0 48px; }
  .ls-island { position: absolute; left: 50%; top: 11px; width: 126px; height: 37px; margin-left: -63px; border-radius: 999px; background: #000; }
  .ls-sys { display: flex; align-items: center; gap: 6px; fill: currentColor; color: #fff; }
  .ls-lock { display: flex; justify-content: center; margin-top: 14px; }
  .ls-lock svg { width: 22px; height: 22px; fill: none; stroke: rgba(255,255,255,.85); stroke-width: 2; stroke-linecap: round; }
  .ls-date { margin-top: 10px; text-align: center; font-size: 21px; font-weight: 600; color: rgba(255,255,255,.85); }
  .ls-time { text-align: center; font-size: 96px; font-weight: 700; line-height: 1; letter-spacing: -2px; color: rgba(255,255,255,.92); }
  /* An iOS notification: frosted, 22pt corners, app icon, title + "now", body. */
  .ls-note { position: absolute; left: 12px; right: 12px; bottom: 170px; display: flex; gap: 11px; padding: 14px 14px 14px 13px; border-radius: 22px; background: rgba(60,52,66,.62); -webkit-backdrop-filter: blur(24px); backdrop-filter: blur(24px); box-shadow: 0 10px 30px rgba(0,0,0,.25); }
  .ls-icon { width: 38px; height: 38px; flex: none; border-radius: 9px; background: #0b0b0c; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .ls-icon svg { width: 30px; height: auto; }
  .ls-copy { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .ls-head { display: flex; justify-content: space-between; align-items: baseline; }
  .ls-head b { font-size: 15px; font-weight: 700; }
  .ls-head small { font-size: 13px; color: rgba(255,255,255,.6); }
  .ls-body { margin-top: 2px; font-size: 15px; line-height: 20px; color: rgba(255,255,255,.92); }
  .ls-foot { position: absolute; left: 46px; right: 46px; bottom: 50px; display: flex; justify-content: space-between; }
  .ls-btn { width: 50px; height: 50px; border-radius: 25px; background: rgba(255,255,255,.14); display: flex; align-items: center; justify-content: center; }
  .ls-btn svg { width: 22px; height: 22px; fill: none; stroke: #fff; stroke-width: 1.8; stroke-linejoin: round; }
  .ls-home { position: absolute; left: 50%; bottom: 8px; width: 134px; height: 5px; margin-left: -67px; border-radius: 9px; background: #fff; }
</style>
