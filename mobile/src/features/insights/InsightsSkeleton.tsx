/**
 * The placeholder Insights shows while its report is being built.
 *
 * THE ONE IDEA THAT MAKES IT FLUID: it does not try to reproduce a card's interior.
 * It reproduces the card's HEIGHT, from memory.
 *
 * Rebuilding the interior can never be exact. A headline wraps to one line or two
 * depending on the metric's name; a body to three or four; an observation title to
 * either. Every earlier version of this file guessed at that with sample strings and
 * per-line bars, and each guess was wrong for some real report — which showed up as
 * the list stepping up or down as the data landed. So each card now renders at
 * exactly the height the real one measured last time (`shape.heights`, written by
 * app/(tabs)/insights.tsx from `onLayout`), and the swap is dimensionally identical
 * rather than merely close.
 *
 * Inside that height it stays deliberately plain, the way `../ProgressSkeleton` is:
 *   · the card's title, its "?" and its description are REAL, since none of that copy
 *     depends on the data
 *   · a list card draws its BUBBLES, empty, at the remembered row height, so each one
 *     sits exactly where the real row will
 *   · the headline card draws its three stat tiles and its confidence track, because
 *     those are fixed-size, plus one ghost bar for the headline itself
 *   · nothing else, because nothing else can be right and the height is handled
 *
 * The fallback, used exactly once per install: with no remembered height it reserves
 * from `SAMPLE` in ./style, which `TextGhost` measures off invisible copies of real
 * strings and which ../../lib/insights/__tests__/skeleton.test.ts guards.
 */
import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ghost, HelpDot } from '../../components/ui';
import { Icon, type IconName } from '../../components/Icon';
import { fonts, usePalette } from '../../theme';
import { CardRow, FOOTER_COPY, InsightCard, NO_IMPACT_DESC, OBS_DESC, WATCH_DESC } from './Sections';
import * as S from './style';
import { INSIGHTS_HELP, INSIGHT_MIN_DAYS, type FactorProgress } from '../../lib/insights';
import { ZERO_HEIGHTS, ZERO_ROWS, type CardHeights, type InsightsShape, type RowHeights } from '../../lib/insights/shape';

/**
 * One placeholder card.
 *
 * The chrome is real — title, "?" and description — because none of it depends on the
 * data. `height` pins the frame when this install has measured the real card before,
 * with `overflow: hidden` so a height remembered at a different width clips rather
 * than pushing the page around.
 */
function CardGhost({ title, help, height, desc, chevron, children }: {
  title: string;
  help: keyof typeof INSIGHTS_HELP;
  height: number;
  desc?: string;
  /** Whether the real card is a button, and so carries a chevron in its title row.
   *  Chrome that never depends on the data, which means it is drawn for real: the
   *  Biggest change card is tappable, and having the chevron pop into existence at
   *  the swap was one of the two things that made this card flicker. */
  chevron?: boolean;
  children?: React.ReactNode;
}) {
  const p = usePalette();
  return (
    <View style={[S.CARD, { backgroundColor: p.surface, borderColor: p.border }, height > 0 && { height, overflow: 'hidden' }]}>
      <View style={S.CARD_HEAD}>
        <Text style={[S.CARD_TITLE, { color: p.textDim }]}>{title}</Text>
        {/* The real help dot, as `ProgressSkeleton` keeps its own. Its copy is fixed,
            so it works before the report exists, and reading it while the numbers
            land is a perfectly good use of the wait. */}
        <HelpDot title={title} text={INSIGHTS_HELP[help]} />
        {chevron ? (
          <>
            <View style={{ flex: 1 }} />
            <Icon name="chevronRight" size={16} color={p.textDim} />
          </>
        ) : null}
      </View>
      {desc ? <Text style={[S.CARD_DESC, { color: p.textDim }]}>{desc}</Text> : null}
      {children}
    </View>
  );
}

/**
 * The bubbles.
 *
 * Empty on purpose: the row's own chrome — the inset dark fill, the border, the
 * radius, the gap above it — IS the placeholder, and at the remembered row height it
 * occupies exactly the space the real row will. Drawing bars inside it would invent
 * an interior that cannot match, which is what every earlier version of this file got
 * wrong.
 *
 * `height` of 0 means this install has never measured a row, so it falls back to the
 * row style's own intrinsic padding around a single reserved line. That happens once,
 * on the very first open.
 */
function Bubbles({ count, heights, tall, fallback }: {
  count: number;
  /** One height per row, remembered from the real card. Falls back to the first
   *  entry, then to the measured sample, for any row not yet seen. */
  heights: number[];
  tall?: boolean;
  /**
   * What to reserve when `height` is 0, i.e. on the very first open. An invisible copy
   * of a real string in the real style, so even the once-per-install fallback is a
   * plausible row rather than a thin sliver.
   */
  fallback?: { style: object; sample: string };
}) {
  const p = usePalette();
  const base = tall ? S.ROW_TALL : S.ROW;
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const h = heights[i] || heights[0] || 0;
        return (
          <View key={i} style={[base, { backgroundColor: S.ROW_BG, borderColor: p.border }, h > 0 ? { height: h } : null]}>
            {h > 0 ? null : (
              <Text style={[fallback ? fallback.style : S.ROW_TITLE, { opacity: 0 }]}>
                {fallback ? fallback.sample : '\u00A0'}
              </Text>
            )}
          </View>
        );
      })}
    </>
  );
}

/* ---------- the empty screen ---------- */

/** The progress ring's diameter on the empty screen. */
const RING = 132;

/** An arc of `pct`, from twelve o'clock. Its own component rather than
 *  `ConfidenceRing`, which grades its colour — there is nothing to grade here,
 *  only distance covered. */
function ProgressRing({ size, stroke, pct, color, track }: {
  size: number; stroke: number; pct: number; color: string; track: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const done = Math.max(0, Math.min(1, pct));
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
      <Circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={`${c * done} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </Svg>
  );
}

/**
 * The fastest route to a first finding, in the order it pays off.
 *
 * An HRV reading leads because it is the outcome most correlations are tested
 * against; meds are the driver side of the same test; sleep is third because on
 * a watch it arrives by itself, which makes it the cheapest of the three.
 */
const WORTH_LOGGING: { title: string; icon: IconName }[] = [
  { title: 'An HRV reading', icon: 'heartPulse' },
  { title: 'Supplements & meds you took', icon: 'pill' },
  { title: 'Last night\'s sleep', icon: 'moon' },
];

/**
 * What the days buy, kept to what `INSIGHT_MIN_DAYS` can actually deliver.
 *
 * Every line has to name a card the reader will genuinely meet at fourteen
 * days, because they will come back and check. The list that shipped did not:
 * "metrics drifting up or down" is Trend Watch, which compares 30 days against
 * 30 and so needs about sixty, and "which days your HRV runs higher" describes
 * no card in this view at all. A screen that promises a finding at day fourteen
 * and then does not produce it is worse than one that promised less.
 *
 * So these four map one to one onto what arrives: the early-signals tier, the
 * correlation rows, the biggest-change headline and the confidence ring. What
 * needs two windows gets its own line underneath rather than being folded in,
 * because "around two months" is a different promise from "in a week".
 */
const COMING_UP = [
  'The first links between what you do and how you feel',
  'Which meds and habits line up with your better days',
  'How far you have come since day one',
  'A confidence score, so you know how much to trust it',
];

/** The honest tail on that promise: a windowed comparison needs two windows. */
const COMING_LATER = 'Around two months in: the trends worth watching, and which of your meds are doing nothing at all.';

/** Height of the ghost bar standing in for the headline card's headline. One line. */
const BAR_H = 13;
/** Where that bar sits inside the invisible headline it is laid over: past the
 *  headline style's own top margin, then centred in its first line. */
const HEADLINE_BAR_TOP = (S.HEADLINE.marginTop as number) + 4;

/**
 * The headline card.
 *
 * Unlike the list cards this one has no rows, but it does have three stat tiles and a
 * confidence bar — and both are FIXED SIZE, so they are drawn rather than left to the
 * card's remembered height. That is the same rule the list cards follow with their
 * bubbles: anything whose dimensions are known is worth showing, because a
 * placeholder that shows the card's structure tells the user what is coming, and
 * anything whose dimensions depend on the copy is not.
 */
function ChangeGhost({ height }: { height: number }) {
  const p = usePalette();
  // Has this install measured the real card? The frame is pinned to that height,
  // which is what makes the swap dimensionally identical — but only for the FRAME.
  const pinned = height > 0;
  return (
    <CardGhost title="Biggest change" help="change" height={height} chevron>
      {/*
        The headline's space, and the one variable thing on this card.

        Everything below it — tile row, hairline, confidence strip — is fixed size,
        so the headline is the ONLY reason the real card is the height it is: one
        line for "Sleep is up since magnesium", two for a longer metric name. The
        skeleton cannot know which, and reserving the sample string (which wraps to
        two) put the tiles and the confidence bar a whole line low on every card
        whose real headline is one — inside a frame pinned with `overflow: hidden`,
        so they were pushed down and clipped rather than merely misplaced.

        So it does not guess: when the frame is pinned, this block simply ABSORBS
        the slack (`flex: 1`, basis 0), which lands the tiles and the strip exactly
        at the bottom of the remembered height — exactly where the real ones are.
        The bar floats at the top of whatever that region turns out to be. Only on
        the very first open, with no remembered height, does the invisible sample
        reserve the space instead.
      */}
      <View style={pinned ? { flex: 1 } : undefined}>
        {pinned ? null : <Text style={[S.HEADLINE, { color: p.textDim, opacity: 0 }]}>{S.SAMPLE.headline}</Text>}
        <Ghost w="72%" h={BAR_H} r={5} style={{ position: 'absolute', left: 0, top: HEADLINE_BAR_TOP }} />
      </View>

      {/* The three tiles, as the dark bubbles they are. Empty: the labels are real
          text on the card and reading "Before / After / Change" against three blank
          numerals invites the eye to look for values that are not there yet. The
          bubble's own shape at the right height is the whole placeholder. */}
      <View style={S.TILE_ROW}>
        {[0, 1, 2].map((i) => (
          // The tile's height is NOT a constant here. It was (62pt, "12 either side
          // of a 25pt numeral and a 12pt label"), and that arithmetic ignores font
          // metrics: the real tile measures nearer 70, so the confidence strip below
          // sat 8pt high in the placeholder. Invisible copies of the real value and
          // label in the real styles set the height exactly, the same trick
          // `TextGhost` plays.
          <View key={i} style={[S.TILE, { backgroundColor: p.bg, borderColor: p.border }]}>
            <Text style={[S.TILE_VALUE, { fontFamily: fonts.numHeavy, opacity: 0 }]}>0</Text>
            <Text style={[S.TILE_LABEL, { opacity: 0 }]}>Before</Text>
          </View>
        ))}
      </View>

      {/* And the confidence block: hairline, real label, empty track. */}
      <View style={{ borderTopWidth: 1, borderTopColor: p.border, paddingTop: S.CONF_TOP }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: S.CONF_GAP }}>
          <Text style={[S.CONF_LABEL, { color: p.textDim }]}>Confidence</Text>
          <Ghost w={72} h={11} r={5} />
        </View>
        <View style={{ height: S.CONF_BAR_H, borderRadius: 999, backgroundColor: p.bg }} />
      </View>
    </CardGhost>
  );
}

/** The full-width action the correlations card ends with. Its label is REAL: `shape`
 *  remembers the count, so the button says the true thing and then simply becomes
 *  tappable. The smoothest transition is the one where nothing has to transition. */
function ButtonGhost({ total }: { total: number }) {
  const p = usePalette();
  return (
    <View style={[S.CARD_BUTTON, { borderColor: p.border, backgroundColor: p.surface2 }]}>
      <Text style={[S.CARD_BUTTON_TEXT, { color: p.textDim }]}>{`Show all ${total} correlations`}</Text>
    </View>
  );
}

export function InsightsSkeleton({ shape }: { shape: InsightsShape }) {
  const p = usePalette();
  const h: CardHeights = shape.heights || ZERO_HEIGHTS;
  const r: RowHeights = shape.rows || ZERO_ROWS;
  return (
    <View accessibilityLabel="Working out your insights">
      {shape.change ? <ChangeGhost height={h.change} /> : null}

      {shape.correlations > 0 ? (
        <CardGhost title="Correlations" help="correlations" height={h.correlations}>
          {/* How many ROWS, which is not the same as how many findings: the real card
              folds a driver's findings into one row with a "+N" pill, so a report of
              six correlations can be four rows. The remembered row heights are one
              per rendered row, so their count is the truthful one; the stored
              `correlations` figure is the finding count and stays what the button
              says, because "Show all 6 correlations" is a claim about findings. */}
          <Bubbles
            count={Math.min(r.correlations.length || shape.correlations, S.VISIBLE_ROWS)}
            heights={r.correlations}
            fallback={{ style: S.PAIR_DRIVER, sample: S.SAMPLE.pair }}
          />
          {shape.correlations > S.VISIBLE_ROWS ? <ButtonGhost total={shape.correlations} /> : null}
        </CardGhost>
      ) : null}

      {shape.observations > 0 ? (
        <CardGhost title="Worth a look" help="observations" height={h.observations} desc={OBS_DESC}>
          <Bubbles count={shape.observations} heights={r.observations} fallback={{ style: S.ROW_TITLE, sample: S.SAMPLE.obsTitle }} />
        </CardGhost>
      ) : null}

      {shape.noImpact > 0 ? (
        <CardGhost title="No detected impact" help="noImpact" height={h.noImpact} desc={NO_IMPACT_DESC}>
          <Bubbles count={shape.noImpact} heights={r.noImpact} fallback={{ style: S.ROW_TITLE, sample: S.SAMPLE.obsTitle }} />
        </CardGhost>
      ) : null}

      {shape.watch > 0 ? (
        <CardGhost title="Trend watch" help="watch" height={h.watch} desc={WATCH_DESC}>
          <Bubbles count={shape.watch} heights={r.watch} fallback={{ style: S.ROW_TITLE, sample: S.SAMPLE.watchTitle }} />
        </CardGhost>
      ) : null}

      {/* Fixed copy, so it is rendered for real and never moves. */}
      <Text style={[S.FOOTER_TEXT, { color: p.textDim, marginTop: S.FOOTER_TOP, marginBottom: S.FOOTER_BOTTOM }]}>{FOOTER_COPY}</Text>
    </View>
  );
}

/**
 * What the view says when the engine genuinely found nothing.
 *
 * Distinct from the skeleton on purpose: "we are still looking" and "there is not
 * enough here yet" are different facts, and dressing the second as the first leaves
 * people waiting for a screen that will never fill in. It names the actual
 * requirement rather than asking vaguely for more data.
 *
 * A build that FAILED is the third fact, identical in the data and completely
 * different in what it should say, so it has its own component: see
 * ./BuildFailed.
 */
/**
 * The types closest to their first finding, with the distance: "Magnesium ·
 * 5 of 8 days". Turns "nothing yet" into a reason to keep logging the exact
 * things the user is already trying. Rows are not buttons — each is an
 * instruction, not a destination.
 *
 * No leading icon. Every row here is a med or supplement, so the pill glyph was the
 * same on all of them: it graded nothing and distinguished nothing, and the count on
 * the right is the only thing the row is really saying.
 */
function AlmostTestable({ progress }: { progress?: FactorProgress[] }) {
  const p = usePalette();
  if (!progress || !progress.length) return null;
  return (
    <InsightCard
      title="Almost testable"
      desc="Log these a few more days and the analysis can start comparing days with them against days without."
    >
      {progress.map((f) => (
        <CardRow key={f.driver}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={[S.ROW_TITLE, { color: p.text }]}>{f.driver}</Text>
          </View>
          <Text style={{ color: p.textDim, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
            {`${f.have} of ${f.need} days`}
          </Text>
        </CardRow>
      ))}
    </InsightCard>
  );
}

export function InsightsEmpty({ daysLogged, progress }: { daysLogged: number; progress?: FactorProgress[] }) {
  const p = usePalette();
  // Short of the two-week target, the honest thing to show is DISTANCE: how far
  // this journal is from the first testable pattern, then the fastest route
  // there, then what the effort buys. Past it, none of that is true any more —
  // the days exist and nothing separated from the noise, which is a real answer
  // and gets a sentence instead of a target.
  const short = daysLogged < INSIGHT_MIN_DAYS;
  const left = Math.max(0, INSIGHT_MIN_DAYS - daysLogged);
  if (!short) {
    return (
      <>
        <View style={{ paddingHorizontal: 8, paddingTop: 28, alignItems: 'center', marginBottom: 20 }}>
          <Text style={{ color: p.text, fontSize: 17, fontWeight: '700', textAlign: 'center', marginBottom: 8 }}>
            Nothing solid to report yet
          </Text>
          <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 21, textAlign: 'center' }}>
            {`You have ${daysLogged} days logged, which is enough to look. Nothing has separated itself from the noise yet, and an empty screen is a real answer rather than a missing one.`}
          </Text>
        </View>
        <AlmostTestable progress={progress} />
      </>
    );
  }

  return (
    <>
      {/* The count is what the reader came for, so the ring opens the screen and
          the method sits under it in grey. Untitled: a card headed "PROGRESS"
          over a number that large is labelling the obvious. */}
      <InsightCard>
        <View style={{ alignItems: 'center', paddingTop: 6, paddingBottom: 2 }}>
          <View style={{ width: RING, height: RING, marginBottom: 16 }}>
            <ProgressRing size={RING} stroke={9} pct={daysLogged / INSIGHT_MIN_DAYS} color={p.accent} track={p.surface2} />
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: fonts.numHeavy, fontSize: 34, lineHeight: 38, color: p.text, fontVariant: ['tabular-nums'] }}>
                {daysLogged}
              </Text>
              <Text style={{ fontSize: 12, fontWeight: '600', color: p.textDim }}>{`of ${INSIGHT_MIN_DAYS} days`}</Text>
            </View>
          </View>
          <Text style={{ fontSize: 19, fontWeight: '700', letterSpacing: -0.3, color: p.text, textAlign: 'center' }}>
            {left === 1 ? '1 more day of logging' : `${left} more days of logging`}
          </Text>
          <Text style={{ fontSize: 13.5, lineHeight: 21, color: p.textDim, textAlign: 'center', marginTop: 6 }}>
            A pattern needs a couple of weeks of days to compare against each other. Nothing is being held back, there simply is not enough yet.
          </Text>
        </View>
      </InsightCard>

      <AlmostTestable progress={progress} />

      {/* The fastest route to fourteen. Bubbles, not divided lines, because that
          is what a row is everywhere else in this view — and no chevrons, since
          these rows are telling rather than going. */}
      <InsightCard title="Worth logging daily">
        {WORTH_LOGGING.map((w) => (
          <CardRow key={w.title}>
            <View style={{ width: S.TONE_BOX, height: S.TONE_BOX, borderRadius: 9, backgroundColor: p.bg, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={w.icon} size={14} color={p.accent} strokeWidth={2.2} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              {/* The title alone. Each of these is a single instruction, and the
                  line under it was explaining a phrase that needs no explaining. */}
              <Text style={[S.ROW_TITLE, { color: p.text, fontSize: 15.5 }]}>{w.title}</Text>
            </View>
          </CardRow>
        ))}
      </InsightCard>

      {/* What the effort buys. Deliberately the plainest card on the screen: it is
          a promise about later, so it must not out-dress the two cards about now. */}
      <InsightCard
        title={`What shows up at ${INSIGHT_MIN_DAYS} days`}
        desc="Autonomic compares your own logged days against each other and reports only what stands up. All of it computed on this phone."
      >
        <View style={{ marginTop: 12 }}>
          {COMING_UP.map((line) => (
            <View key={line} style={{ flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 9 }}>
              {/* Accent dots and full-strength text: this is the one card on the
                  screen making a case, and the dim treatment read as fine print. */}
              <View style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: p.accent }} />
              <Text style={{ flex: 1, fontSize: 14, color: p.text }}>{line}</Text>
            </View>
          ))}
        </View>
        <Text style={{ fontSize: 13, lineHeight: 19, color: p.textDim, marginTop: 10 }}>{COMING_LATER}</Text>
      </InsightCard>
    </>
  );
}
