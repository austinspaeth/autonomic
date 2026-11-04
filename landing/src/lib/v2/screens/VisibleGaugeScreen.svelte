<!-- Drawn: Visible's PacePoints day view, redrawn from Visible's own published
     screenshot for the /compare/visible/ page (never their image file): the
     half gauge at 12.0 of 13.0, the PaceSetter message, and "Your pacing day"
     with the cumulative curve against the PaceSetter line. Their numbers, their
     wording; nothing invented. Authored in iPhone POINTS like the other drawn
     screens, so it sits in the same Phone frame as ours. -->
<script lang="ts">
  import PhoneChrome from './PhoneChrome.svelte';
  export let time = '10:35';
  // The gauge: a half circle, filled to 12 of 13.
  const CX = 195, CY = 214, R = 124, SW = 26;
  const pt = (f: number) => { const a = Math.PI * (1 - f); return [CX + R * Math.cos(a), CY - R * Math.sin(a)]; };
  const arc = (f: number) => { const [x0, y0] = pt(0), [x1, y1] = pt(f); return `M${x0} ${y0} A${R} ${R} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`; };
  const fill = 12 / 13;
  const dot = pt(fill);
  // The pacing day: 04:00 to 00:00, PacePoints 0 to 15, budget 13.
  const W = 320, H = 190, X0 = 18, Y0 = 18;
  const x = (h: number) => X0 + ((h - 4) / 20) * W;
  const y = (v: number) => Y0 + H - (v / 15) * H;
  const curve: [number, number][] = [[4, 0], [8, 0.05], [10, 0.1], [11, 0.4], [12, 1.4], [13, 2.6], [14, 3.6], [15, 4.6], [16, 5.4], [17, 6.3], [18, 7.5], [19, 8.7], [20, 9.9], [21, 11.0], [22, 11.8], [22.6, 12.0]];
  const line = curve.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)} ${y(p[1]).toFixed(1)}`).join(' ');
</script>

<div class="vg" aria-hidden="true">
  <PhoneChrome tabs={false} {time} />
  <div class="vg-head"><svg viewBox="0 0 24 24"><path d="M19 12H5M11 6l-6 6 6 6" /></svg><b>PacePoints</b><span></span></div>
  <div class="vg-date"><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" /></svg><b>Today, 3 Mar</b><svg class="off" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" /></svg></div>
  <span class="vg-info">i</span>
  <svg class="vg-gauge" viewBox="0 0 390 262" width="390" height="262">
    <defs><linearGradient id="vgMint" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#9fe0c2" /><stop offset="1" stop-color="#d3f5e5" /></linearGradient></defs>
    <path d={arc(1)} fill="none" stroke="#2a2e66" stroke-width={SW} stroke-linecap="round" />
    <path d={arc(fill)} fill="none" stroke="url(#vgMint)" stroke-width={SW} stroke-linecap="round" />
    <circle cx={dot[0]} cy={dot[1]} r="11" fill="#1e2154" stroke="#d3f5e5" stroke-width="5" />
    <text x={CX} y={CY - 38} text-anchor="middle" font-size="48" font-weight="400" fill="#fff">12.0</text>
    <text x={CX} y={CY - 2} text-anchor="middle" font-size="22" fill="#9ea3cf">/13.0</text>
    <text x={CX - R} y={CY + 42} text-anchor="middle" font-size="12" fill="#9ea3cf">04:00</text>
    <text x={CX + R} y={CY + 42} text-anchor="middle" font-size="12" fill="#9ea3cf">00:00</text>
  </svg>
  <p class="vg-msg">You are 0.2 PacePoints ahead of your PaceSetter. At your current rate you may go over budget.</p>
  <div class="vg-sub"><b>Your pacing day</b><span class="vg-info sm">i</span></div>
  <svg class="vg-chart" viewBox="0 0 390 236" width="390" height="236">
    <polygon points="{x(4)},{y(0)} {x(24)},{y(13)} {x(24)},{y(0)}" fill="#fff" fill-opacity=".05" />
    <line x1={x(4)} y1={y(0)} x2={x(24)} y2={y(13)} stroke="#8d92c4" stroke-width="1.4" />
    <line x1={x(22.6)} y1={y(12)} x2={x(22.6)} y2={y(0)} stroke="#8d92c4" stroke-width="1.2" />
    <path d={line} fill="none" stroke="#bfeedd" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" />
    <circle cx={x(22.6)} cy={y(12)} r="4.5" fill="#1e2154" stroke="#d3f5e5" stroke-width="2.4" />
    {#each [0, 3, 6, 9, 12, 15] as v}<text x={X0 + W + 30} y={y(v) + 4} text-anchor="end" font-size="12" fill="#9ea3cf">{v}</text>{/each}
    <text x={X0 + W + 30} y={y(13) + 2} text-anchor="end" font-size="12" font-weight="700" fill="#fff">13</text>
    {#each [6, 12, 18, 24] as h}<text x={x(h)} y={Y0 + H + 22} text-anchor="middle" font-size="12" fill="#9ea3cf">{h === 24 ? '00:00' : `${String(h).padStart(2, '0')}:00`}</text>{/each}
  </svg>
</div>

<style>
  .vg { position: absolute; left: 0; top: 0; width: 390px; height: 842px; transform: scale(.62051); transform-origin: 0 0; overflow: hidden; background: #1e2154; color: #fff; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased; }
  .vg svg { display: block; }
  .vg-head { display: flex; align-items: center; justify-content: space-between; padding: 64px 22px 0; }
  .vg-head svg { width: 24px; height: 24px; fill: none; stroke: #fff; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .vg-head b { font-size: 19px; font-weight: 600; }
  .vg-head span { width: 24px; }
  .vg-date { display: flex; align-items: center; justify-content: center; gap: 30px; margin-top: 26px; }
  .vg-date b { font-size: 18px; font-weight: 600; }
  .vg-date svg { width: 22px; height: 22px; fill: none; stroke: #fff; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
  .vg-date svg.off { stroke: #6f74ad; }
  .vg-info { position: absolute; right: 26px; top: 170px; width: 24px; height: 24px; border-radius: 12px; border: 1.8px solid #9ea3cf; color: #9ea3cf; font-size: 13px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
  .vg-info.sm { position: static; width: 20px; height: 20px; font-size: 11px; }
  .vg-gauge { margin-top: 6px; }
  .vg-msg { margin: 4px 26px 0; text-align: center; font-size: 15px; line-height: 22px; color: #d7d9f0; }
  .vg-sub { display: flex; align-items: center; justify-content: space-between; margin: 28px 22px 4px; }
  .vg-sub b { font-size: 17px; font-weight: 500; color: #d7d9f0; }
</style>
