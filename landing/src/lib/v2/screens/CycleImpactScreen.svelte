<!-- Drawn: the cycle history sheet, "Cycle impact", opened from the Journal's
     Cycle card. Sample data: a 29-day cycle on day 24, four past cycles that dip
     about 9 points on days 21 to 28, and this cycle down 7 so far, landing on the
     Journal's 74. From the app: features/cycle/CycleHistory.tsx (the title, the
     ring card with chipLabel and forecastLine) and ScoreByCycleDay in
     features/cycle/CycleCharts.tsx (past cycles in white at .17, the current one
     on the score's grade gradient, the dashed USUAL DIP box, today's dashed
     line and dot, the legend and the two CardRows). Sheet as PacingSheetScreen. -->
<script lang="ts">
  import JournalScreen from './JournalScreen.svelte';
  import PhoneChrome from './PhoneChrome.svelte';
  export let time = '9:41';
  export let battery = 1;

  const LEN = 29, TODAY = 24, DIP_FROM = 21, DIP_TO = 28;
  let seed = 5;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const dipAt = (d: number) => (d >= DIP_FROM - 2 ? 9 * Math.exp(-((d - 25) ** 2) / 10) : 0);
  const cycleRow = (base: number, wobble: number) => Array.from({ length: LEN }, (_, i) => base - dipAt(i + 1) + (rnd() - 0.5) * wobble);
  const past = [cycleRow(80, 7), cycleRow(82, 7), cycleRow(79, 7), cycleRow(81, 7)];
  const current = cycleRow(81, 5).slice(0, TODAY);
  current[TODAY - 1] = 74;

  // Score grades (SCORE_CATS), low to high, for the current line's gradient.
  const ZONES = [{ to: 25, c: '#b91c1c' }, { to: 40, c: '#ef4444' }, { to: 55, c: '#f97316' }, { to: 70, c: '#eab308' }, { to: 85, c: '#16a34a' }, { to: 101, c: '#2ee06a' }];
  const gradeAt = (v: number) => (ZONES.find((z) => v < z.to) || ZONES[ZONES.length - 1]).c;

  const W = 330, H = 176, PAD_L = 26, PAD_R = 8, top = 10, bottom = 150, LO = 60, HI = 95;
  const xAt = (d: number) => PAD_L + ((d - 1) / (LEN - 1)) * (W - PAD_L - PAD_R);
  const yAt = (v: number) => top + (1 - (v - LO) / (HI - LO)) * (bottom - top);
  const path = (row: number[]) => row.map((v, i) => `${i ? 'L' : 'M'}${xAt(i + 1).toFixed(1)} ${yAt(v).toFixed(1)}`).join(' ');
  const stops = (() => {
    const out: { o: number; c: string }[] = [{ o: 0, c: gradeAt(HI) }];
    const off = (v: number) => 1 - (v - LO) / (HI - LO);
    [85, 70].forEach((m) => { out.push({ o: off(m), c: gradeAt(m) }, { o: off(m), c: gradeAt(m - 0.01) }); });
    out.push({ o: 1, c: gradeAt(LO) });
    return out;
  })();
  const dipHigh = 84, dipLow = 66;

  // The hero ring at 56 / 4.6, as the Journal card's ring.
  const RS = 56, RW = 4.6, RR = (RS - RW) / 2, RC = 2 * Math.PI * RR;
  const ovStart = LEN - 15;
  const segs = [{ d: 5, a: 1, c: '#e03127' }, { d: ovStart - 5, a: 0.16, c: '#fff' }, { d: 3, a: 0.4, c: '#fff' }, { d: LEN - ovStart - 3, a: 0.27, c: '#fff' }];
  let at = 0;
  const arcs = segs.map((g) => { const arc = (g.d / LEN) * RC; const o = { ...g, len: arc - RC * 0.035, off: -at }; at += arc; return o; });
  const ang = ((TODAY - 0.5) / LEN) * 2 * Math.PI - Math.PI / 2;
  const dot = [RS / 2 + RR * Math.cos(ang), RS / 2 + RR * Math.sin(ang)];
</script>

<div class="ci" aria-hidden="true">
  <JournalScreen {time} {battery} score={74} grade="Good" gradeRgb="22,163,74" delta={-3} confidence={90} notice={null} cycle={{ day: 24, length: 29, label: 'Day 24 · Premenstrual', symptoms: 'Cramps, Bloating' }} />
  <div class="ci-top">
    <div class="ci-dim"></div>
    <PhoneChrome tabs={false} {time} {battery} />
    <div class="ci-sheet">
      <div class="ci-pill"><span><svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12" /></svg></span></div>
      <b class="ci-title">Cycle impact</b>

      <div class="ci-hero">
        <svg viewBox="0 0 {RS} {RS}" width={RS} height={RS}>
          {#each arcs as a}<circle cx={RS / 2} cy={RS / 2} r={RR} fill="none" stroke={a.c} stroke-opacity={a.a} stroke-width={RW} stroke-dasharray="{a.len} {RC}" stroke-dashoffset={a.off} transform="rotate(-90 {RS / 2} {RS / 2})" />{/each}
          <circle cx={dot[0]} cy={dot[1]} r={RW * 0.95} fill="#fff" stroke="#000" stroke-width={RW * 0.55} />
        </svg>
        <span><b>Day 24 · Premenstrual</b><small>Next period predicted Oct 19 to Oct 21</small></span>
      </div>

      <div class="ci-card">
        <div class="ci-ctitle">Score by cycle day<i>?</i></div>
        <p class="ci-desc">Your last 4 cycles in grey, this one coloured by its grade.</p>
        <svg class="ci-chart" viewBox="0 0 {W} {H}" width={W} height={H}>
          <defs>
            <linearGradient id="ciGrade" x1="0" y1={top} x2="0" y2={bottom} gradientUnits="userSpaceOnUse">
              {#each stops as st}<stop offset={st.o} stop-color={st.c} />{/each}
            </linearGradient>
          </defs>
          {#each [70, 80, 90] as t}
            <line x1={PAD_L} x2={W - PAD_R} y1={yAt(t)} y2={yAt(t)} stroke="#fff" stroke-opacity=".06" />
            <text x={PAD_L - 6} y={yAt(t) + 3} text-anchor="end" font-size="9" class="mono" fill="#6a6a72">{t}</text>
          {/each}
          <rect x={xAt(DIP_FROM)} y={yAt(dipHigh)} width={xAt(DIP_TO) - xAt(DIP_FROM)} height={yAt(dipLow) - yAt(dipHigh)} rx="6" fill="#fff" fill-opacity=".08" stroke="#fff" stroke-opacity=".18" stroke-dasharray="3 3" />
          <text x={(xAt(DIP_FROM) + xAt(DIP_TO)) / 2} y={yAt(dipLow) + 13} text-anchor="middle" font-size="8.5" letter-spacing=".5" class="mono" fill="#9a9aa0">USUAL DIP</text>
          {#each past as row}<path d={path(row)} fill="none" stroke="#fff" stroke-opacity=".17" stroke-width="1.2" stroke-linejoin="round" />{/each}
          <line x1={xAt(TODAY)} x2={xAt(TODAY)} y1={top} y2={bottom} stroke="#fff" stroke-opacity=".22" stroke-dasharray="2 3" />
          <path d={path(current)} fill="none" stroke="url(#ciGrade)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
          <circle cx={xAt(TODAY)} cy={yAt(74)} r="4.5" fill={gradeAt(74)} stroke="#000" stroke-width="2.5" />
          {#each [1, 7, 14, 21, 28] as d}<text x={xAt(d)} y={H - 7} text-anchor="middle" font-size="9" class="mono" fill="#6a6a72">{d}</text>{/each}
        </svg>
        <div class="ci-legend">
          <span><i class="line" style="background:#16a34a;height:2.6px"></i>This cycle</span>
          <span><i class="line" style="background:rgba(255,255,255,.35);height:1.2px"></i>Last 4</span>
          <span><i class="box"></i>Usual dip</span>
        </div>
        <div class="ci-row"><span><b>Usual dip</b><small>Days 21 to 28, last 4 cycles</small></span><em>−9 points</em></div>
        <div class="ci-row"><span><b>This cycle so far</b><small>Day 24</small></span><em>−7 points</em></div>
      </div>
    </div>
  </div>
</div>

<style>
  .ci { position: absolute; inset: 0; overflow: hidden; }
  .ci-top { position: absolute; left: 0; top: 0; width: 390px; height: 842px; transform: scale(.62051); transform-origin: 0 0; color: #f2f2f5; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased; }
  .ci-top svg { display: block; }
  .mono { font-family: Menlo, 'SF Mono', ui-monospace, monospace; }
  .ci-dim { position: absolute; inset: 0; background: rgba(0,0,0,.38); }
  .ci-sheet { position: absolute; left: 0; right: 0; bottom: 0; height: 775px; padding: 22px 16px 0; background: #1a1a1c; border: 1px solid #303034; border-bottom: 0; border-radius: 18px 18px 0 0; overflow: hidden; box-shadow: 0 -10px 40px rgba(0,0,0,.5); }
  .ci-pill { position: absolute; top: 10px; right: 14px; padding: 5px; border-radius: 999px; border: 1px solid #46464e; }
  .ci-pill span { width: 36px; height: 36px; border-radius: 18px; background: #242427; display: flex; align-items: center; justify-content: center; }
  .ci-pill svg { width: 18px; height: 18px; fill: none; stroke: #9a9aa0; stroke-width: 2; stroke-linecap: round; }
  .ci-title { display: block; margin-bottom: 14px; font-size: 21px; font-weight: 700; }
  /* The ring card: sunk, 20 / 18 padding, ring 56 beside the chip and forecast. */
  .ci-hero { display: flex; align-items: center; gap: 16px; padding: 20px 18px; margin-bottom: 14px; border-radius: 14px; background: #141416; border: 1px solid #303034; }
  .ci-hero > span { flex: 1; display: flex; flex-direction: column; }
  .ci-hero b { font-size: 20px; font-weight: 700; }
  .ci-hero small { margin-top: 4px; font-size: 14px; line-height: 19px; color: #9a9aa0; }
  .ci-card { padding: 16px; border-radius: 14px; background: #141416; border: 1px solid #303034; }
  .ci-ctitle { display: flex; align-items: center; font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #9a9aa0; }
  .ci-ctitle i { width: 19px; height: 19px; margin-left: 8px; border-radius: 10px; border: 1.2px solid #9a9aa0; opacity: .75; display: flex; align-items: center; justify-content: center; font-style: normal; font-size: 11px; letter-spacing: 0; }
  .ci-desc { margin: 8px 0 8px; font-size: 13px; line-height: 19px; color: #9a9aa0; }
  .ci-chart { width: 100%; height: auto; }
  .ci-legend { display: flex; gap: 16px; margin: 4px 0 12px; }
  .ci-legend span { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #9a9aa0; }
  .ci-legend .line { width: 16px; border-radius: 2px; }
  .ci-legend .box { width: 12px; height: 10px; border-radius: 3px; background: rgba(255,255,255,.08); border: 1px dashed rgba(255,255,255,.3); }
  .ci-row { display: flex; align-items: center; gap: 12px; margin-top: 8px; padding: 12px 13px; border-radius: 14px; background: #232326; border: 1px solid #303034; }
  .ci-row > span { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .ci-row b { font-size: 14.5px; font-weight: 700; }
  .ci-row small { margin-top: 2px; font-size: 12px; color: #9a9aa0; }
  .ci-row em { font-style: normal; font-family: Manrope, sans-serif; font-weight: 800; font-size: 16px; font-variant-numeric: tabular-nums; }
</style>
