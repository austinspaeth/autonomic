<!-- Drawn: the Insights tab as the app renders it, led by its Biggest change
     card ("RMSSD is up since you started magnesium"). Sample data. Authored in
     iPhone POINTS (390 wide) and scaled into the frame's 242px screen, like
     JournalScreen. Every size and colour is the app's own: the header claim and
     confidence ring from app/(tabs)/insights.tsx, the cards from
     features/insights/Card.tsx + Sections.tsx over features/insights/style.ts
     (InsightCard, FindingCard, Tile, Bar, CardRow, CardButton, ConfidenceRing),
     the headline from lib/insights/change.ts's onset template, and the Ask AI
     pill from features/insights/AskAi.tsx. Use it inside a `.hs-layer.real`. -->
<script lang="ts">
  import PhoneChrome from './PhoneChrome.svelte';
  export let time = '9:41';
  export let battery = 1;
  /** The Biggest change card: which metric moved, before and after (ms), and
   *  the change as a percentage. Defaults are the home page's RMSSD sample. */
  export let change = { metric: 'RMSSD', before: 22, after: 28, pct: 27 };
  /** When set, the tab leads with the Barometric pressure card instead
   *  (Sections.tsx PressureCard: pressureHeadline, then low pressure days,
   *  other days and the difference, red when the link is a worse outcome). */
  export let pressure: { metric: string; unit: string; low: string; other: string; delta: string; confidence: string; conf: number } | null = null;
  // ConfidenceRing at 26: r = size/2 - 2, stroke 3, green from 70%.
  const RING = 26, RR = RING / 2 - 2, CIRC = 2 * Math.PI * RR, CONF = 78;
  const rows = [
    { driver: 'Electrolytes', metric: 'Score', delta: '+5 pts', good: true },
    { driver: 'Legs up', metric: 'RMSSD', delta: '+6 ms', good: true, lag: true },
    { driver: 'Late bedtime', metric: 'Score', delta: '−8 pts', good: false },
  ];
</script>

<div class="it" aria-hidden="true">
  <PhoneChrome tab="insight" {time} {battery} />

  <div class="it-head">
    <span class="it-claim"><b>16 pts</b><span>better than day one</span><svg class="it-chev" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" /></svg></span>
    <span class="it-days">57 days
      <svg viewBox="0 0 {RING} {RING}" width={RING} height={RING}>
        <circle cx={RING / 2} cy={RING / 2} r={RR} fill="none" stroke="#242427" stroke-width="3" />
        <circle cx={RING / 2} cy={RING / 2} r={RR} fill="none" stroke="#3ec46d" stroke-width="3" stroke-linecap="round" stroke-dasharray={CIRC} stroke-dashoffset={CIRC * (1 - CONF / 100)} transform="rotate(-90 {RING / 2} {RING / 2})" />
      </svg>
    </span>
  </div>

  <div class="it-body">
    <!-- FindingCard as the Biggest change card: tappable, so a chevron rides its title row. -->
    {#if pressure}
    <div class="it-card">
      <div class="it-title">Barometric pressure<i>?</i><span class="it-sp"></span><svg class="it-go" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" /></svg></div>
      <p class="it-headline">Your {pressure.metric} runs higher on low pressure days</p>
      <div class="it-tiles">
        <div><b class="rd">{pressure.low}{#if pressure.unit}<small>{' ' + pressure.unit}</small>{/if}</b><span>Low pressure days</span></div>
        <div><b>{pressure.other}{#if pressure.unit}<small>{' ' + pressure.unit}</small>{/if}</b><span>Other days</span></div>
        <div><b class="rd">{pressure.delta}{#if pressure.unit}<small>{' ' + pressure.unit}</small>{/if}</b><span>Difference</span></div>
      </div>
      <div class="it-conf">
        <div class="it-conf-row"><span>Confidence</span><b>{pressure.confidence}</b></div>
        <span class="it-bar"><i style="width:{pressure.conf}%;background:#8e8e93"></i></span>
      </div>
    </div>
    {/if}
    <div class="it-card">
      <div class="it-title">Biggest change<i>?</i><span class="it-sp"></span><svg class="it-go" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" /></svg></div>
      <p class="it-headline">{change.metric} is up since you started magnesium</p>
      <div class="it-tiles">
        <div><b>{change.before}<small>{' ms'}</small></b><span>Before</span></div>
        <div><b class="g">{change.after}<small>{' ms'}</small></b><span>After</span></div>
        <div><b class="g">+{change.pct}<small>{' %'}</small></b><span>Change</span></div>
      </div>
      <div class="it-conf">
        <div class="it-conf-row"><span>Confidence</span><b>Strong</b></div>
        <span class="it-bar"><i style="width:80%"></i></span>
      </div>
    </div>

    <div class="it-card">
      <div class="it-title">Correlations<i>?</i></div>
      {#each rows as r}
        <div class="it-row">
          <span class="it-pair">
            <b>{r.driver}</b>
            <svg class="it-arrow" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            <em>{r.metric}{#if r.lag}<span>{' next day'}</span>{/if}</em>
          </span>
          <strong class:g={r.good} class:r={!r.good}>{r.delta}</strong>
          <svg class="it-go" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" /></svg>
        </div>
      {/each}
      <div class="it-btn">Show all 9 correlations</div>
    </div>
  </div>

  <!-- AskAiPill: always the layer behind the other pills, above the tab bar. -->
  <div class="it-ai">
    <svg class="it-ai-ic" viewBox="0 0 24 24"><path d="M12 3l1.4 4.1L17.5 8l-3.6 1.4L12 13l-1.9-3.6L6.5 8l4.1-.9zM18.5 14l.8 2.3 2.2.8-2.2.8-.8 2.3-.8-2.3-2.2-.8 2.2-.8zM5 15l.6 1.6L7 17l-1.4.4L5 19l-.6-1.6L3 17l1.4-.4z" /></svg>
    <span>Get AI Insights &amp; Reports</span>
    <svg class="it-ai-go" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" /></svg>
  </div>
</div>

<style>
  .it-tiles b.rd { color: #e03127; }
  .it { position: absolute; left: 0; top: 0; width: 390px; height: 842px; transform: scale(.62051); transform-origin: 0 0; background: #000; color: #f2f2f5; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased; overflow: hidden; }
  .it svg { display: block; }

  /* Header band (HEADER_CONTENT_HEIGHT 58): the claim on the left, days + ring on the right. */
  .it-head { height: 58px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 16px; background: #040406; border-bottom: 1px solid rgba(255,255,255,.07); }
  .it-claim { display: flex; align-items: center; min-width: 0; font-size: 17.5px; white-space: nowrap; }
  .it-claim b { font-weight: 800; color: #3ec46d; }
  .it-claim > span { margin-left: .27em; font-weight: 500; color: #9a9aa0; }
  .it-chev { width: 17px; height: 17px; margin-left: 2px; fill: none; stroke: #9a9aa0; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
  .it-days { display: flex; align-items: center; gap: 8px; font-size: 15px; line-height: 17px; font-weight: 700; letter-spacing: -.2px; color: #9a9aa0; }

  .it-body { padding: 14px 16px 0; }
  /* InsightCard on the screen: surface fill, hairline, 16 padding, 12 gutter. */
  .it-card { padding: 16px; margin-bottom: 12px; border-radius: 14px; background: #1a1a1c; border: 1px solid #303034; }
  .it-title { display: flex; align-items: center; font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #9a9aa0; }
  .it-title i { width: 19px; height: 19px; margin-left: 8px; border-radius: 10px; border: 1.2px solid #9a9aa0; opacity: .75; display: flex; align-items: center; justify-content: center; font-style: normal; font-size: 11px; line-height: 13px; letter-spacing: 0; }
  .it-sp { flex: 1; }
  .it-go { width: 16px; height: 16px; flex: none; fill: none; stroke: #9a9aa0; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
  .it-headline { margin: 10px 0 0; font-size: 17px; font-weight: 700; letter-spacing: -.2px; line-height: 22px; }

  /* Tile: black on the card, Manrope 25 with a 12/600 dim unit, 12 label. */
  .it-tiles { display: flex; gap: 6px; margin: 12px 0 6px; }
  .it-tiles div { flex: 1; min-width: 0; padding: 12px 14px; border-radius: 14px; background: #000; border: 1px solid #303034; }
  .it-tiles b { display: block; font-family: Manrope, sans-serif; font-weight: 800; font-size: 25px; line-height: 30px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .it-tiles small { font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', Inter, sans-serif; font-size: 12px; font-weight: 600; color: #9a9aa0; }
  .it-tiles span { display: block; font-size: 12px; margin-top: 2px; color: #9a9aa0; }
  .g { color: #3ec46d; } .r { color: #e03127; }

  .it-conf { border-top: 1px solid #303034; padding-top: 13px; }
  .it-conf-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 12.5px; color: #9a9aa0; }
  .it-conf-row b { color: #f2f2f5; font-weight: 700; }
  .it-bar { display: block; height: 6px; border-radius: 999px; background: #000; overflow: hidden; }
  .it-bar i { display: block; height: 100%; border-radius: 999px; background: #3ec46d; }

  /* CardRow: a bubble one step above the card (ROW_BG), min height 50. */
  .it-row { min-height: 50px; display: flex; align-items: center; gap: 12px; margin-top: 8px; padding: 12px 13px; border-radius: 14px; background: #232326; border: 1px solid #303034; }
  .it-title + .it-row { margin-top: 12px; }
  .it-pair { flex: 1; min-width: 0; display: flex; align-items: center; gap: 7px; white-space: nowrap; }
  .it-pair b { font-size: 14.5px; font-weight: 700; }
  .it-pair em { font-style: normal; font-size: 14.5px; font-weight: 600; }
  .it-pair em span { color: #9a9aa0; }
  .it-arrow { width: 14.5px; height: 14.5px; flex: none; fill: none; stroke: #9a9aa0; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
  .it-row strong { font-family: Manrope, sans-serif; font-weight: 800; font-size: 16px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .it-btn { margin-top: 10px; padding: 13px 0; border-radius: 10px; background: #e03127; text-align: center; font-size: 14.5px; font-weight: 600; color: #fff; }

  .it-ai { position: absolute; z-index: 5; left: 50%; bottom: 122px; transform: translateX(-50%); width: max-content; height: 54px; display: flex; align-items: center; gap: 10px; padding: 0 16px 0 20px; border-radius: 999px; border: 1px solid #34343b; background: rgba(6,6,9,.82); -webkit-backdrop-filter: blur(20px); backdrop-filter: blur(20px); box-shadow: 0 8px 32px rgba(0,0,0,.4); white-space: nowrap; }
  .it-ai > * { flex: none; }
  .it-ai span { font-size: 16px; font-weight: 600; color: #fff; }
  .it-ai-ic { width: 20px; height: 20px; fill: none; stroke: #e03127; stroke-width: 2; stroke-linejoin: round; }
  .it-ai-go { width: 18px; height: 18px; fill: none; stroke: #9a9aa0; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
</style>
