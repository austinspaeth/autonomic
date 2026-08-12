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
import { Ghost, HelpDot } from '../../components/ui';
import { usePalette } from '../../theme';
import { FOOTER_COPY, OBS_DESC, WATCH_DESC } from './Sections';
import * as S from './style';
import { INSIGHTS_HELP } from '../../lib/insights';
import { ZERO_HEIGHTS, ZERO_ROWS, type CardHeights, type InsightsShape, type RowHeights } from '../../lib/insights/shape';

/**
 * One placeholder card.
 *
 * The chrome is real — title, "?" and description — because none of it depends on the
 * data. `height` pins the frame when this install has measured the real card before,
 * with `overflow: hidden` so a height remembered at a different width clips rather
 * than pushing the page around.
 */
function CardGhost({ title, help, height, desc, children }: {
  title: string;
  help: keyof typeof INSIGHTS_HELP;
  height: number;
  desc?: string;
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
          <View key={i} style={[base, { backgroundColor: p.bg, borderColor: p.border }, h > 0 ? { height: h } : null]}>
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

/** Height of the ghost bar standing in for the headline card's headline. One line. */
const BAR_H = 13;
/** The stat tile's height: 12pt padding either side of a 25pt numeral and a 12pt
 *  label. Deterministic, which is why the skeleton draws the tiles for real. */
const TILE_H = 62;

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
  return (
    <CardGhost title="Biggest change" help="change" height={height}>
      <Ghost w="72%" h={BAR_H} r={5} style={{ marginTop: 12 }} />
      {/* Reserved space for the body, drawn as nothing: its line count depends on
          the metric's name and any bar there would be a guess. */}
      <Text style={[S.BODY, { color: p.textDim, opacity: 0 }]}>{S.SAMPLE.body}</Text>

      {/* The three tiles, as the dark bubbles they are. Empty: the labels are real
          text on the card and reading "Before / After / Change" against three blank
          numerals invites the eye to look for values that are not there yet. The
          bubble's own shape at the right height is the whole placeholder. */}
      <View style={S.TILE_ROW}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[S.TILE, { backgroundColor: p.bg, borderColor: p.border, height: TILE_H }]} />
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
          <Bubbles
            count={Math.min(shape.correlations, S.VISIBLE_ROWS)}
            heights={r.correlations}
            fallback={{ style: S.ROW_NOTE, sample: S.SAMPLE.rowNote }}
          />
          {shape.correlations > S.VISIBLE_ROWS ? <ButtonGhost total={shape.correlations} /> : null}
        </CardGhost>
      ) : null}

      {shape.observations > 0 ? (
        <CardGhost title="Worth a look" help="observations" height={h.observations} desc={OBS_DESC}>
          <Bubbles count={shape.observations} heights={r.observations} tall fallback={{ style: S.ROW_SUB, sample: S.SAMPLE.obsBody }} />
        </CardGhost>
      ) : null}

      {shape.watch > 0 ? (
        <CardGhost title="Trend watch" help="watch" height={h.watch} desc={WATCH_DESC}>
          <Bubbles count={shape.watch} heights={r.watch} fallback={{ style: S.WATCH_SUB, sample: S.SAMPLE.watchSub }} />
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
export function InsightsEmpty({ daysLogged }: { daysLogged: number }) {
  const p = usePalette();
  return (
    <View style={{ paddingHorizontal: 8, paddingTop: 28, alignItems: 'center' }}>
      <Text style={{ color: p.text, fontSize: 17, fontWeight: '700', textAlign: 'center', marginBottom: 8 }}>
        Nothing solid to report yet
      </Text>
      <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 21, textAlign: 'center' }}>
        {`You have ${daysLogged} ${daysLogged === 1 ? 'day' : 'days'} logged. Finding a pattern needs at least eight days with a thing and eight without it, so this screen fills in as you go. Nothing is hidden behind a threshold: when there is something real here, it appears.`}
      </Text>
    </View>
  );
}
