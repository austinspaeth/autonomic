<!-- Drawn: the Journal tab as the app renders it, on a Good morning. Sample data.
     Authored in iPhone POINTS (390 wide) and scaled into the frame's 242px
     screen, so every size here is the app's own: the Outlook card, gauge, key
     figures and Trend card from mobile/src/features/DaySummary.tsx +
     TrendCard.tsx, colours from the dark palette and SCORE_COLORS, the tab bar
     from app/(tabs)/_layout.tsx. Use it inside a `.hs-layer.real` (or any
     full-bleed screen), since it carries its own status bar and tab bar. -->
<script lang="ts">
  import PhoneChrome from './PhoneChrome.svelte';
  export let time = '9:41';
  export let battery = 1;
  // The day being drawn. Defaults are the hero's Good morning; the four-answers
  // section passes a sliding day. Grade colours are SCORE_COLORS, the guidance
  // is OUTLOOK_GUIDE for the grade, a negative delta wears SCORE_COLORS.bad.
  export let score = 84;
  export let grade = 'Good';
  export let gradeRgb = '22,163,74';
  export let delta = 6;
  export let confidence = 92;
  export let guide = 'Solid baseline. Enough reserve for your protocol and a normal day. Keep anything demanding at a level you already know you handle well.';
  export let figs: { text: string; unit?: string; color: string; label: string }[] = [
    { text: '28', unit: 'ms', color: '#16a34a', label: 'HRV' },
    { text: '69', unit: 'bpm', color: '#16a34a', label: 'Resting HR' },
    { text: '8h 10m', color: '#2ee06a', label: 'Sleep' },
  ];
  /** The card under the Outlook: the Trend card (🎉, no chevron) or the
   *  warning card (⚠️ / 🛑, with a chevron, since its explain sheet is real). */
  export let notice: { emoji: string; text: string; chevron: boolean } | null = { emoji: '🎉', text: 'Your HRV is up 4 ms over the last week!', chevron: false };
  /** The pacing strip, drawn where the app draws it: inside the Outlook card,
   *  between the guidance and the tiles (features/budget/Strip.tsx). `fill` and
   *  `pace` are shares of the budget; `color` is the state's (green under pace,
   *  gold ahead of it, red over). Off unless passed. */
  /** The Journal's Cycle card (features/cycle/Cycle.tsx CycleSection) in the
   *  notice slot: the phase ring, "Cycle" with its Beta tag, where the day sits,
   *  and today's cycle symptoms. Off unless passed. */
  export let cycle: { day: number; length: number; label: string; symptoms: string } | null = null;
  // CycleRing at 34 / 3.4: four arcs sized from the cycle (period 5, ovulatory
  // 3 around day length - 15, luteal the rest), white at PHASE_ALPHA, the period
  // in the accent red, a 3.5% gap, and the dot on today.
  const RS = 34, RW = 3.4, RR = (RS - RW) / 2, RC = 2 * Math.PI * RR;
  $: ring = (() => {
    if (!cycle) return { arcs: [], dot: [0, 0] };
    const len = cycle.length, period = 5, ovStart = len - 14 - 1;
    const segs = [
      { days: period, a: 1, c: '#e03127' },
      { days: ovStart - period, a: 0.16, c: '#fff' },
      { days: 3, a: 0.4, c: '#fff' },
      { days: len - ovStart - 3, a: 0.27, c: '#fff' },
    ];
    let at = 0;
    const arcs = segs.map((g) => { const arc = (g.days / len) * RC; const out = { ...g, len: Math.max(0.5, arc - RC * 0.035), off: -at }; at += arc; return out; });
    const ang = ((cycle.day - 0.5) / len) * 2 * Math.PI - Math.PI / 2;
    return { arcs, dot: [RS / 2 + RR * Math.cos(ang), RS / 2 + RR * Math.sin(ang)] };
  })();
  export let budget: { figure: string; figureSub: string; fill: number; pace: number; color: string; sub: string; right?: string } | null = null;
  // ScoreGauge geometry: 176 box, r 74, stroke 12, a 270° sweep from 135°.
  const SIZE = 176, R = 74, SW = 12, START = 135, SWEEP = 270;
  const pol = (deg: number) => { const a = (deg * Math.PI) / 180; return [SIZE / 2 + R * Math.cos(a), SIZE / 2 + R * Math.sin(a)]; };
  const arc = (frac: number) => {
    const [x0, y0] = pol(START), [x1, y1] = pol(START + SWEEP * frac);
    return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${R} ${R} 0 ${SWEEP * frac > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  };
  const track = arc(1);
  $: value = arc(score / 100);
  $: gradeColor = `rgb(${gradeRgb})`;
</script>

<div class="js" aria-hidden="true">
  <PhoneChrome tab="journal" {time} {battery} />

  <div class="js-head">
    <svg class="js-chev" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg>
    <div class="js-date">Tue, Oct 14</div>
    <svg class="js-chev" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" /></svg>
  </div>

  <div class="js-body">
    <div class="js-outlook" style="--gc:{gradeRgb}">
      <div class="js-row">
        <span class="js-sec">Autonomic Outlook</span>
        <span class="js-tags">
          <svg class="js-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" /></svg>
          <span class="js-grade" style="background:{gradeColor}">{grade}</span>
        </span>
      </div>
      <div class="js-gauge">
        <svg viewBox="0 0 {SIZE} {SIZE}" width={SIZE} height={SIZE}>
          <path d={track} fill="none" stroke="rgba(0,0,0,.4)" stroke-width={SW} stroke-linecap="round" />
          <path d={value} fill="none" stroke={gradeColor} stroke-width={SW + 7} stroke-linecap="round" opacity=".16" />
          <path d={value} fill="none" stroke={gradeColor} stroke-width={SW} stroke-linecap="round" />
        </svg>
        <div class="js-gauge-in">
          <b>{score}</b>
          {#if delta}<span class="js-delta"><i style="color:{delta > 0 ? '#16a34a' : '#f97316'}">{delta > 0 ? '▲' : '▼'} {Math.abs(delta)}</i>vs 7d avg</span>{/if}
        </div>
      </div>
      <p class="js-conf">{confidence}% confidence</p>
      <p class="js-guide">{guide}</p>
      {#if budget}
        <div class="js-pace">
          <div class="js-pace-top"><span>Pacing</span><b>{budget.figure}</b><small>{budget.figureSub}</small></div>
          <div class="js-pace-row">
            <div class="js-bar">
              <span class="js-fill" style="width:{budget.fill * 100}%;background:{budget.color};--glow:{budget.color}"></span>
              <span class="js-mark" style="left:{budget.pace * 100}%"></span>
            </div>
            <svg class="js-go" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" /></svg>
          </div>
          <div class="js-pace-sub"><span>{budget.sub}</span>{#if budget.right}<span>{budget.right}</span>{/if}</div>
        </div>
      {/if}
      <div class="js-figs">
        {#each figs as f}
          <div><span class="js-fig"><b style="color:{f.color}">{f.text}</b>{#if f.unit}<small>{f.unit}</small>{/if}</span><span class="js-lab">{f.label}</span></div>
        {/each}
      </div>
    </div>

    {#if notice}
    <div class="js-trend">
      <span class="js-trend-ic">{notice.emoji}</span>
      <b>{notice.text}</b>
      {#if notice.chevron}<svg class="js-go" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" /></svg>{/if}
    </div>
    {/if}

    {#if cycle}
      <div class="js-cy">
        <div class="js-cy-top">
          <svg viewBox="0 0 {RS} {RS}" width={RS} height={RS}>
            {#each ring.arcs as a}<circle cx={RS / 2} cy={RS / 2} r={RR} fill="none" stroke={a.c} stroke-opacity={a.a} stroke-width={RW} stroke-dasharray="{a.len} {RC}" stroke-dashoffset={a.off} transform="rotate(-90 {RS / 2} {RS / 2})" />{/each}
            <circle cx={ring.dot[0]} cy={ring.dot[1]} r={RW * 0.95} fill="#fff" />
          </svg>
          <span class="js-cy-name"><span><b>Cycle</b><i>Beta</i></span><small>{cycle.label}</small></span>
          <svg class="js-go" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" /></svg>
        </div>
        <div class="js-cy-log">
          <span class="js-cy-ic"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></svg></span>
          <span class="js-cy-txt"><b>Cycle symptoms</b><small>{cycle.symptoms}</small></span>
          <svg class="js-go" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" /></svg>
        </div>
      </div>
    {/if}

    <div class="js-card">
      <span class="js-ms-ic"><svg viewBox="0 0 24 24"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" /></svg></span>
      <span class="js-ms"><b>Milestones</b><small>52 of 75 achieved</small><i><em></em></i></span>
      <svg class="js-go" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" /></svg>
    </div>
  </div>

</div>

<style>
  /* 390pt iPhone, scaled to the frame's 242px screen (242 / 390). */
  .js { position: absolute; left: 0; top: 0; width: 390px; height: 842px; transform: scale(.62051); transform-origin: 0 0; background: #000; color: #f2f2f5; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased; overflow: hidden; }
  .js svg { display: block; }

  .js-head { height: 58px; display: flex; align-items: center; gap: 12px; padding: 0 14px; background: #040406; border-bottom: 1px solid rgba(255,255,255,.07); }
  .js-chev { width: 24px; height: 24px; fill: none; stroke: #f2f2f5; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; flex: none; }
  .js-date { flex: 1; height: 40px; border-radius: 14px; background: #1a1a1c; border: 1px solid #303034; display: flex; align-items: center; justify-content: center; font-size: 17px; font-weight: 600; }

  .js-body { padding: 14px 16px 0; }
  /* GradientBorderCard: dark surface, a hairline lit from the top-left in the
     grade colour, and a low wash bleeding out of the same corner (peak .10). */
  .js-outlook { position: relative; border-radius: 14px; padding: 16px; margin-bottom: 12px; border: 1px solid transparent;
    background:
      radial-gradient(80% 90% at 0 0, rgba(var(--gc),.10), rgba(var(--gc),.032) 40%, rgba(var(--gc),0) 100%) padding-box,
      linear-gradient(#1a1a1c, #1a1a1c) padding-box,
      linear-gradient(135deg, rgba(var(--gc),.95), rgba(var(--gc),.35) 30%, #303034 62%) border-box; }
  .js-row { display: flex; justify-content: space-between; align-items: center; }
  .js-sec { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: .6px; color: #9a9aa0; }
  .js-tags { display: flex; align-items: center; gap: 8px; }
  .js-info { width: 20px; height: 20px; margin: 0 3px; fill: none; stroke: rgba(242,242,245,.72); stroke-width: 2; stroke-linecap: round; }
  .js-grade { height: 26px; display: flex; align-items: center; padding: 0 12px; border-radius: 999px; background: #16a34a; color: #fff; font-size: 13px; font-weight: 800; text-transform: uppercase; }
  .js-gauge { position: relative; width: 176px; height: 176px; margin: 8px auto; }
  .js-gauge-in { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .js-gauge-in b { font-family: Manrope, sans-serif; font-weight: 800; font-size: 57px; line-height: 62px; letter-spacing: -1px; margin-top: 13px; font-variant-numeric: tabular-nums; }
  .js-delta { display: flex; gap: 4px; margin-top: 2px; font-size: 12px; line-height: 14px; font-weight: 600; color: #9a9aa0; }
  .js-delta i { font-style: normal; font-weight: 800; }
  .js-conf { margin: -14px 0 0; text-align: center; font-size: 14px; font-weight: 600; color: #9a9aa0; }
  .js-guide { margin: 14px 0 0; font-size: 15px; line-height: 21px; }
  /* Strip.tsx: label and figure on one line at the same size, the bar with its
     white pace mark beside the chevron, then the sub line. */
  .js-pace { margin-top: 14px; }
  .js-pace-top { display: flex; align-items: baseline; gap: 7px; margin-bottom: 9px; }
  .js-pace-top span { font-size: 14.5px; font-weight: 700; letter-spacing: .9px; text-transform: uppercase; color: #9a9aa0; }
  .js-pace-top b { font-family: Manrope, sans-serif; font-weight: 800; font-size: 14.5px; font-variant-numeric: tabular-nums; }
  .js-pace-top small { flex: 1; font-size: 12.5px; color: #9a9aa0; }
  .js-pace-row { display: flex; align-items: center; gap: 11px; }
  .js-bar { position: relative; flex: 1; height: 10px; border-radius: 999px; background: rgba(242,242,245,.06); }
  .js-fill { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 999px; box-shadow: 0 0 5px color-mix(in srgb, var(--glow) 50%, transparent); }
  .js-mark { position: absolute; top: -4px; bottom: -4px; width: 2px; margin-left: -1px; border-radius: 999px; background: rgba(242,242,245,.84); }
  .js-pace-sub { display: flex; justify-content: space-between; gap: 7px; margin-top: 10px; font-size: 12.5px; color: #9a9aa0; }
  .js-figs { display: flex; gap: 8px; margin-top: 16px; padding-top: 14px; border-top: .5px solid #303034; }
  .js-figs > div { flex: 1; background: #141416; border: 1px solid #303034; border-radius: 14px; padding: 11px 9px 7px; }
  .js-fig { display: flex; align-items: baseline; height: 26px; padding-top: 2px; }
  .js-fig b { font-family: Manrope, sans-serif; font-weight: 800; font-size: 21px; line-height: 21px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .js-fig small { font-size: 11px; font-weight: 600; color: #9a9aa0; margin-left: 2px; }
  .js-lab { display: block; font-size: 11.5px; line-height: 15px; color: #9a9aa0; }

  /* TrendCard: neutral surface, sunk emoji tile, the headline and nothing else. */
  .js-trend { display: flex; align-items: center; gap: 13px; padding: 15px; margin-bottom: 12px; border-radius: 14px; background: #1a1a1c; border: 1px solid #303034; }
  .js-trend b { flex: 1; font-size: 15px; font-weight: 700; line-height: 20px; }
  .js-trend-ic { width: 42px; height: 42px; flex: none; display: flex; align-items: center; justify-content: center; border-radius: 9px; background: #141416; border: 1px solid #303034; font-size: 21px; }

  /* CycleSection: a Card holding the ring row (17/600 name, the Beta pill, the
     day in 13 dim) over the logged box on surface2. */
  .js-cy { margin-bottom: 12px; padding: 14px; border-radius: 14px; background: #1a1a1c; border: 1px solid #303034; display: flex; flex-direction: column; gap: 12px; }
  .js-cy-top { display: flex; align-items: center; gap: 12px; }
  .js-cy-name { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .js-cy-name > span { display: flex; align-items: center; gap: 8px; }
  .js-cy-name b { font-size: 17px; font-weight: 600; }
  .js-cy-name i { font-style: normal; padding: 1.5px 7px; border: 1px solid #303034; border-radius: 999px; font-size: 10.5px; font-weight: 700; letter-spacing: .5px; text-transform: uppercase; color: #9a9aa0; }
  .js-cy-name small { margin-top: 1px; font-size: 13px; color: #9a9aa0; }
  .js-cy-log { display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: 12px; background: #242427; }
  .js-cy-ic { width: 58px; display: flex; justify-content: center; }
  .js-cy-ic svg { width: 18px; height: 18px; fill: none; stroke: #9a9aa0; stroke-width: 2; stroke-linecap: round; }
  .js-cy-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .js-cy-txt b { font-size: 16px; font-weight: 600; }
  .js-cy-txt small { margin-top: 2px; font-size: 13px; color: #9a9aa0; }
  .js-card { display: flex; align-items: center; gap: 13px; padding: 16px; border-radius: 14px; background: #1a1a1c; border: 1px solid #303034; }
  .js-ms-ic { width: 46px; height: 46px; flex: none; display: flex; align-items: center; justify-content: center; border-radius: 10px; background: rgba(224,49,39,.16); }
  .js-ms-ic svg { width: 22px; height: 22px; fill: none; stroke: #e03127; stroke-width: 1.8; stroke-linejoin: round; }
  .js-ms { flex: 1; display: flex; flex-direction: column; gap: 2px; }
  .js-ms b { font-size: 17px; font-weight: 600; }
  .js-ms small { font-size: 15px; color: #9a9aa0; }
  .js-ms i { display: block; height: 4px; margin-top: 8px; border-radius: 9px; background: #2a2a2e; }
  .js-ms em { display: block; width: 69%; height: 100%; border-radius: 9px; background: #e03127; }
  .js-go { width: 20px; height: 20px; fill: none; stroke: #9a9aa0; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }

</style>
