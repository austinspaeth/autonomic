<!-- Drawn: Bearable's Today view, comparing this week with last, redrawn from
     Bearable's own published screenshot for /compare/bearable/ (never their
     image file). Their metrics and figures as published; nothing invented.
     Authored in iPhone POINTS like the other drawn screens. -->
<script lang="ts">
  export let time = '12:22';
  type Tone = 'good' | 'bad' | 'info';
  type Icon = 'moon' | 'foot' | 'face' | 'flask';
  const cards: [string, string, string, string, Tone, Icon][] = [
    ['Time asleep', '7h 37', '', '-15%', 'bad', 'moon'],
    ['Sleep quality', '3.5', '/5', '+17%', 'good', 'moon'],
    ['Step count', '5,746', '', '+10%', 'info', 'foot'],
    ['Anxiety', '0.0', '/4', '-100%', 'good', 'face'],
    ['Concentration', '4.5', '/5', '+25%', 'good', 'flask'],
    ['Fatigue', '0.0', '/4', '-100%', 'good', 'face'],
    ['Stress', '1.5', '/4', '+200%', 'bad', 'face'],
    ['Work/Life Balance', '2.0', '/5', '-41%', 'bad', 'flask'],
    ['Overwhelm', '0.8', '/4', '+13%', 'bad', 'face'],
    ['Irritability', '2.5', '/5', '-43%', 'bad', 'flask'],
    ['Productivity', '3.7', '/5', '+15%', 'good', 'flask'],
    ['Pain', '1.3', '/4', '+100%', 'bad', 'face']
  ];
  const ICON: Record<Icon, string> = {
    moon: '<path d="M14 3a7 7 0 1 0 7 9 6 6 0 0 1-7-9z" /><path d="M17 4l.5 1.2L19 5.7l-1.5.5L17 7.4l-.5-1.2L15 5.7l1.5-.5z" />',
    foot: '<ellipse cx="8" cy="10" rx="3" ry="5" /><ellipse cx="16" cy="8" rx="3" ry="5" /><path d="M6 17h4M14 15h4" />',
    face: '<rect x="4" y="5" width="16" height="14" rx="5" /><path d="M9 14c1.5 1 4.5 1 6 0" /><circle cx="9.5" cy="10" r=".6" /><circle cx="14.5" cy="10" r=".6" />',
    flask: '<path d="M9 3h6M10 3v6l-5 10h14l-5-10V3" />'
  };
</script>

<div class="bt" aria-hidden="true">
  <div class="bt-bar">
    <div class="bt-status"><b>{time}</b><span class="bt-island"></span><span class="bt-sys"><svg viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1" /><rect x="5" y="5.5" width="3" height="6.5" rx="1" /><rect x="10" y="3" width="3" height="9" rx="1" /><rect x="15" y="0" width="3" height="12" rx="1" /></svg><svg viewBox="0 0 27 13"><rect x=".5" y=".5" width="23" height="12" rx="3.6" fill="none" stroke="#fff" stroke-opacity=".6" /><rect x="2.2" y="2.2" width="19" height="8.6" rx="2.2" fill="#fff" /></svg></span></div>
    <div class="bt-head">
      <svg class="bt-cal" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
      <b>Today, 11 May</b>
      <svg class="bt-list" viewBox="0 0 24 24"><path d="M9 6h12M9 12h12M9 18h12" /><circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" /></svg>
    </div>
  </div>
  <div class="bt-body">
    <div class="bt-seg"><span class="on">vs last week</span><span>vs last 30 days</span></div>
    <div class="bt-grid">
      {#each cards as c}
        <div class="bt-card">
          <small>{c[0]}</small>
          <b>{c[1]}{#if c[2]}<i>{c[2]}</i>{/if}</b>
          <span class="bt-chip {c[4]}"><svg viewBox="0 0 24 24">{@html ICON[c[5]]}</svg>{c[3]}</span>
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .bt { position: absolute; left: 0; top: 0; width: 390px; height: 842px; transform: scale(.62051); transform-origin: 0 0; overflow: hidden; background: #f2f2f7; color: #1d2a55; font-family: Montserrat, -apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased; }
  .bt svg { display: block; }
  .bt-bar { background: linear-gradient(180deg, #34449c, #4a5fcf); color: #fff; padding-bottom: 16px; }
  .bt-status { position: relative; height: 54px; display: flex; align-items: center; justify-content: space-between; padding: 6px 30px 0 34px; }
  .bt-status b { font-size: 17px; font-weight: 600; }
  .bt-island { position: absolute; left: 50%; top: 11px; width: 126px; height: 37px; margin-left: -63px; border-radius: 999px; background: #000; }
  .bt-sys { display: flex; align-items: center; gap: 6px; fill: #fff; }
  .bt-sys svg:first-child { width: 18px; height: 12px; }
  .bt-sys svg:last-child { width: 27px; height: 13px; }
  .bt-head { display: flex; align-items: center; gap: 14px; padding: 10px 22px 0; }
  .bt-head b { flex: 1; font-size: 25px; font-weight: 700; letter-spacing: -.3px; }
  .bt-cal, .bt-list { width: 30px; height: 30px; fill: none; stroke: #fff; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  .bt-list circle { fill: #fff; }
  .bt-body { padding: 14px 10px 0; }
  .bt-seg { display: flex; padding: 3px; margin: 0 6px 12px; border-radius: 999px; background: #e6e6ee; }
  .bt-seg span { flex: 1; padding: 9px 0; border-radius: 999px; text-align: center; font-size: 14px; font-weight: 600; color: #1d2a55; }
  .bt-seg span.on { background: #fff; box-shadow: 0 1px 4px rgba(29,42,85,.15); }
  .bt-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 0 6px; }
  .bt-card { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; padding: 14px 14px 12px; border-radius: 12px; background: #fff; }
  .bt-card small { font-size: 14px; color: #7a8096; }
  .bt-card b { font-size: 28px; font-weight: 700; letter-spacing: -.3px; line-height: 1.15; }
  .bt-card b i { font-style: normal; font-size: 15px; font-weight: 500; color: #7a8096; }
  .bt-chip { display: flex; align-items: center; gap: 6px; padding: 3px 10px; border-radius: 999px; font-size: 14px; font-weight: 700; }
  .bt-chip svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  .bt-chip.good { background: #c9f5d9; color: #1d2a55; }
  .bt-chip.bad { background: #ffd8d8; color: #1d2a55; }
  .bt-chip.info { background: #e2e0ff; color: #1d2a55; }
</style>
