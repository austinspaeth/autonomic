/**
 * The card pieces Insights shares between its sections and its finding sheets:
 * the card shell, rows, stat tiles, the finding card, and the AI button.
 *
 * Their own module because ./Sections opens the sheets in ./FindingSheet and the
 * sheets draw these same pieces, so while they lived in ./Sections the two files
 * imported each other: a require cycle, which Metro flags on every dev launch
 * ("Open debugger to view warnings") and which can hand a module an
 * uninitialised export the day either file grows a top-level use of the other.
 * This file imports neither, so both can import it.
 */
import React from 'react';
import { Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import { Icon } from '../../components/Icon';
import { HelpDot } from '../../components/ui';
import { useSheets } from '../../components/Sheet';
import { fonts, radius, usePalette } from '../../theme';
import { getState } from '../../store/store';
import { useTier } from '../../store/tier';
import { usePaywall } from '../Paywall';
import { PromptSheet } from '../PromptSheet';
import { resolveProtocol } from '../../lib/scoring/day';
import { buildCorrelationsPrompt } from '../../lib/insights/prompt';
import { INSIGHTS_HELP } from '../../lib/insights';
import type { HelpContent } from '../../lib/help';
import type { BiggestChange, Correlation } from '../../lib/insights';
import * as S from './style';

const GOOD = S.GOOD;
const ROW_BG = S.ROW_BG;

/* ---------- the card shell ---------- */

/**
 * One Insights card: the shell every section wears.
 *
 * Deliberately the same header shape as `CardView`: title, help dot, right-hand
 * action.
 */
export function InsightCard({ title, help, helpText, desc, action, onAction, onPress, onLayout, bg, children }: {
  /** Omitted inside a sheet whose own title already names the thing: a card
   *  headed "CORRELATION" one line under "Correlation details" is a label for a
   *  label. Without it the card opens on the finding itself. */
  title?: string;
  /** Omitted inside a sheet the user opened FROM a card that already carried the
   *  help dot: explaining the same thing twice, one tap apart, is clutter. */
  help?: keyof typeof INSIGHTS_HELP;
  /** Help copy passed directly, for a card outside the Insights tab. The
   *  pacing sheet borrows this card grammar and keeps its copy in
   *  src/lib/budget/help.ts beside the engine it describes. */
  helpText?: HelpContent;
  /**
   * Measures the CARD, not a wrapper around it.
   *
   * This distinction was a real 12pt-per-card bug: `S.CARD` carries
   * `marginBottom: 12`, and a wrapper's frame includes a child's margin while the
   * child's own frame does not. Measuring the wrapper and then applying that height
   * to the card made every skeleton card 12pt too tall — 48pt of shift down the page.
   */
  onLayout?: (e: LayoutChangeEvent) => void;
  /** The card's plain-language sentence. Omitted by the Biggest change card, which
   *  leads with the finding itself rather than a standing description. */
  desc?: string;
  /** Red text action on the right of the title, e.g. "Show all". */
  action?: string;
  onAction?: () => void;
  /** Makes the WHOLE card a button, with a chevron in its title row. Used by the
   *  Biggest change card, whose finding opens the same sheet a correlation does. */
  onPress?: () => void;
  /** Overrides the card fill. A sheet's own background IS `surface`, so a card
   *  left at the default vanishes into it. */
  bg?: string;
  children?: React.ReactNode;
}) {
  const p = usePalette();
  const inner = (
    <>
      {title ? (
        <View style={S.CARD_HEAD}>
          <Text style={[S.CARD_TITLE, { color: p.textDim }]}>{title}</Text>
          {help || helpText ? <HelpDot title={title} text={helpText || INSIGHTS_HELP[help!]} /> : null}
          {action || onPress ? <View style={{ flex: 1 }} /> : null}
          {action ? (
            <Pressable onPress={onAction} hitSlop={8} accessibilityRole="button">
              <Text style={[S.CARD_ACTION, { color: p.accent }]}>{action}</Text>
            </Pressable>
          ) : null}
          {onPress && !action ? <Icon name="chevronRight" size={16} color={p.textDim} /> : null}
        </View>
      ) : null}
      {desc ? <Text style={[S.CARD_DESC, { color: p.textDim }]}>{desc}</Text> : null}
      {children}
    </>
  );
  const style = [S.CARD, { backgroundColor: bg || p.surface, borderColor: p.border }];
  if (!onPress) return <View onLayout={onLayout} style={style}>{inner}</View>;
  return (
    <Pressable onPress={onPress} onLayout={onLayout} accessibilityRole="button" style={({ pressed }) => [...style, pressed && { opacity: 0.75 }]}>
      {inner}
    </Pressable>
  );
}

/** A bubble row. Tappable only when it has somewhere to go — a chevron on a row
 *  that does nothing is a promise the app doesn't keep. Exported so the empty
 *  screen's rows are the same object as a correlation row rather than a copy. */
export function CardRow({ onPress, tall, bg, onLayout, children }: {
  onPress?: () => void;
  tall?: boolean;
  /** Overrides the bubble fill. The pacing sheet's cards are `sunk`, so their
   *  rows step DOWN to the screen background rather than up to ROW_BG, which
   *  on that darker card would read as a raised slab. */
  bg?: string;
  /** Reports this row's height, so the skeleton's bubble can sit exactly where it
   *  will. Every row, not just the first: observation rows genuinely differ in height. */
  onLayout?: (e: LayoutChangeEvent) => void;
  children: React.ReactNode;
}) {
  const p = usePalette();
  // `ROW_BG`, not `bg`: a near-black bubble on the card read as a hole rather than
  // an object, and the black track of the strength bar inside it disappeared into
  // its own row. A step above the card keeps the bar's remainder visible.
  const base = [tall ? S.ROW_TALL : S.ROW, { backgroundColor: bg || ROW_BG, borderColor: p.border }];
  if (!onPress) return <View onLayout={onLayout} style={base}>{children}</View>;
  return (
    <Pressable onPress={onPress} onLayout={onLayout} accessibilityRole="button" style={({ pressed }) => [...base, pressed && { opacity: 0.6 }]}>
      {children}
    </Pressable>
  );
}

/** The full-width action a card can end with. */
export function CardButton({ label, onPress }: { label: string; onPress: () => void }) {
  const p = usePalette();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [S.CARD_BUTTON, { borderColor: p.accent, backgroundColor: p.accent }, pressed && { opacity: 0.7 }]}
    >
      <Text style={[S.CARD_BUTTON_TEXT, { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

/** A solid fill on a dark track: the app's one strength notation, matching the
 *  milestone progress bar. Segmented pips were a chart type nothing else used. */
export function Bar({ pct, color, width, height = S.CONF_BAR_H }: { pct: number; color: string; width?: number; height?: number }) {
  const p = usePalette();
  return (
    <View style={{ width, height, borderRadius: 999, backgroundColor: p.bg, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(4, Math.min(100, pct))}%`, height: '100%', borderRadius: 999, backgroundColor: color }} />
    </View>
  );
}

/** A stat tile, exactly as Progress draws one. */
export function Tile({ value, unit, label, color }: { value: string; unit?: string; label: string; color?: string }) {
  const p = usePalette();
  return (
    <View style={[S.TILE, { backgroundColor: p.bg, borderColor: p.border }]}>
      <Text style={[S.TILE_VALUE, { fontFamily: fonts.numHeavy, color: color || p.text, fontVariant: ['tabular-nums'] }]}>
        {value}
        {unit ? <Text style={{ fontSize: 12, fontWeight: '600', color: p.textDim }}>{` ${unit}`}</Text> : null}
      </Text>
      <Text style={[S.TILE_LABEL, { color: p.textDim }]}>{label}</Text>
    </View>
  );
}

/* ---------- a finding, as a card ---------- */

export interface FindingTile { value: string; unit?: string; label: string; color?: string }

/**
 * ONE finding in card form: headline, three stat tiles, confidence strip.
 *
 * Exported because the detail sheet opens wearing this exact card, and two
 * hand-built versions of it drift the moment either is touched — which is how the
 * sheet ended up at the wrong type scale the first time. The Biggest change card
 * IS this component; a correlation's sheet is the same object with different
 * tiles.
 */
export function FindingCard({ title, help, headline, tiles, pips, confidence, note, good, onPress, onLayout, bg }: {
  title?: string;
  help?: keyof typeof INSIGHTS_HELP;
  headline: string;
  tiles: FindingTile[];
  /**
   * The confidence strip, omitted TOGETHER for a finding that has no statistical
   * test behind it. A Trend watch row is a comparison of two windowed medians,
   * not a hypothesis test, and a bar labelled "Confidence" over it would be a
   * number invented for the sake of the layout. Those cards carry `note` instead,
   * which states the coverage the medians were taken over.
   */
  pips?: number;
  confidence?: string;
  /** A dim line under the tiles, where the confidence strip would be. */
  note?: string;
  good: boolean;
  onPress?: () => void;
  onLayout?: (e: LayoutChangeEvent) => void;
  bg?: string;
}) {
  const p = usePalette();
  const color = good ? GOOD : p.accent;
  return (
    <InsightCard title={title} help={help} onLayout={onLayout} onPress={onPress} bg={bg}>
      {/* The finding leads and stands alone. This card has no standing description
          and no explanatory paragraph: the headline IS the sentence, and anything
          above or below it pushes the one thing worth reading down the card. */}
      <Text style={[S.HEADLINE, { color: p.text }, !title && { marginTop: 0 }]}>{headline}</Text>
      <View style={S.TILE_ROW}>
        {tiles.map((t) => <Tile key={t.label} value={t.value} unit={t.unit} label={t.label} color={t.color} />)}
      </View>
      {pips != null && confidence ? (
        <View style={{ borderTopWidth: 1, borderTopColor: p.border, paddingTop: S.CONF_TOP }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: S.CONF_GAP }}>
            <Text style={[S.CONF_LABEL, { color: p.textDim }]}>Confidence</Text>
            {/* The word grades the EVIDENCE, not the news, so it never wears the
                finding's red: "Very strong" in red read as alarm about the
                confidence itself. Full text on a good finding, dim on a bad one,
                and the bar follows the word: green stays green, but a full red
                bar under "Very strong" read as an alarm, so it goes grey too. */}
            <Text style={[S.CONF_LABEL, { color: good ? p.text : p.textDim, fontWeight: '700' }]}>{confidence}</Text>
          </View>
          <Bar pct={(pips / 5) * 100} color={good ? color : p.textDim} />
        </View>
      ) : null}
      {note ? (
        <View style={{ borderTopWidth: 1, borderTopColor: p.border, paddingTop: S.CONF_TOP }}>
          <Text style={[S.CONF_LABEL, { color: p.textDim, fontWeight: '600' }]}>{note}</Text>
        </View>
      ) : null}
    </InsightCard>
  );
}

/**
 * "Get AI Insights on these correlations" — the same row `src/components/summary`
 * puts under a reading, a workout and a POTS event, so the affordance is the one
 * the user has already met three times elsewhere.
 */
export function CorrelationsAiButton({ list, change, label }: {
  list: Correlation[];
  change: BiggestChange | null;
  /** Defaults to the plural. The detail sheet passes the singular, since it is
   *  handing over exactly one finding. */
  label?: string;
}) {
  const p = usePalette();
  const { openSheet } = useSheets();
  const tier = useTier();
  const openPaywall = usePaywall('insights-ai');
  const open = () => {
    if (tier === 'free') { openPaywall(); return; }
    // The user's own journal, always (see the note in app/(tabs)/insights.tsx):
    // this view has no sample-month fallback, so neither does the prompt.
    const state = getState();
    const ctx = {
      sex: state.profile.sex,
      height: state.profile.height,
      protocol: resolveProtocol(state.settings.protocol),
      customTypes: state.customTypes,
    };
    const { prompt, rangeText } = buildCorrelationsPrompt(state, ctx, list, change);
    openSheet((c) => <PromptSheet title="Correlation Insights" rangeText={rangeText} prompt={prompt} controls={c} />);
  };
  return (
    <Pressable
      onPress={open}
      accessibilityRole="button"
      style={({ pressed }) => [
        {
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
          borderWidth: 1, borderRadius: radius.control, backgroundColor: p.surface2, borderColor: p.border,
          paddingVertical: 13, marginBottom: 12,
        },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Icon name="ai" size={19} color={p.accent} />
      <Text style={{ color: p.text, fontSize: 16, fontWeight: '600' }}>{label || 'Get AI Insights on these correlations'}</Text>
    </Pressable>
  );
}
