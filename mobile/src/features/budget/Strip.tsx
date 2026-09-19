/**
 * The pacing strip, inside the Autonomic Outlook card.
 *
 * The gauge stays the hero. This sits below the guidance paragraph and above
 * the three sunk tiles, uses 11pt uppercase where the gauge uses a 57pt
 * figure, and carries no colour fill unless something is wrong — so on a
 * healthy day the eye passes over it.
 *
 * THE WHOLE STRIP IS ONE TAP TARGET. Label, bar and subtext live inside one
 * Pressable, so there is no separate chevron to hit one-handed on a small
 * phone. The chevron sits beside the bar rather than up in the label row,
 * because the bar is the thing being opened and the label row needs its full
 * width for the figure.
 *
 * Five states, all drawn from the design: healthy, ahead, over, suppressed,
 * locked. CONFIDENCE IS NOT ONE OF THEM. Low confidence used to be a sixth,
 * drawn in the placeholder grey, and a user who hand-entered a night of sleep
 * with no overnight HR met a faded-out budget that reads as a broken feature.
 * How sure the app is is said in words — the softened "About 3h" figure, the
 * right-hand label ("Low confidence" / "Medium confidence" / "Learning · day
 * 3") and the Todo on the subtext line — and never by weakening the graphic.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Reanimated, {
  Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming,
} from 'react-native-reanimated';
import { hexA, mixHex } from '../../lib/color';
import { SCORE_COLORS } from '../../lib/scoring';
import { CAUTION_GOLD, fonts, usePalette } from '../../theme';
import { Icon } from '../../components/Icon';
import type { BudgetView } from '../../lib/budget';
import { PAUSE_ADVICE } from '../../lib/budget/pause';
import { BudgetBar } from './Bar';
import type { BudgetPulse } from './pulse';
import { PULSE_COLOR_MS, PULSE_TEXT_IN_MS, PULSE_TEXT_OUT_MS } from './style';

/** The near-black the warning tints sit on. Copied from DaySummary's own
 *  flags so a paused card and the crash flag it absorbs are the same red. */
const WARN_BASE = '#0d0d0f';

/** Gap above the subtext. Tighter when over, where the bar has grown a glow
 *  and the extra air reads as a gap rather than as breathing room. */
const SUB_GAP = 14;
const SUB_GAP_OVER = 10;

function Mark({ tone }: { tone: 'amber' | 'red' }) {
  const p = usePalette();
  return <Icon name="info" size={12} color={tone === 'red' ? p.accent : CAUTION_GOLD} />;
}

/** Two rounded bars. There is no pause glyph in the icon set, and a moon read
 *  as bedtime rather than as "deliberately stopped". */
function PauseGlyph({ color }: { color: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {[0, 1].map((i) => (
        <View key={i} style={{ width: 3.4, height: 15, borderRadius: 2, backgroundColor: color }} />
      ))}
    </View>
  );
}

/**
 * The one exception to "the whole strip is one tap target".
 *
 * A paused card has two different things a reader wants and they are not the
 * same tap: WHY (the sheet, which is the card itself) and SHOW IT ANYWAY. The
 * second cannot live only in the sheet — a user who has met this card three
 * mornings running is not going to open a sheet to look for a way out of it,
 * they are going to conclude the feature is broken, which is the exact
 * reading ./pause exists to prevent. So it is a play button beside the pause
 * mark: the two glyphs together say what the control does without a word of
 * copy, and it is the only place in the strip where a second target earns its
 * cost.
 *
 * It is deliberately quiet — outlined, not filled. It is a way out of a
 * warning, and a prominent button would read as the app's own suggestion.
 */
function ShowAnywayButton({ onPress }: { onPress: () => void }) {
  const p = usePalette();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Show today's budget anyway"
      accessibilityHint="The app still advises resting today"
      // The tap target survives the ring's removal: 34pt of hit area around a
      // 20pt glyph, so nothing got harder to press one-handed.
      hitSlop={14}
      style={({ pressed }) => [{
        width: 34, height: 34,
        alignItems: 'center', justifyContent: 'center',
      }, pressed && { opacity: 0.55 }]}
    >
      {/* Solid, with rounded corners, and no ring. The outlined glyph in a
          circle read as a bordered control competing with the card's own
          border; filled, it reads as a mark. The corners are rounded by
          STROKING the same path in the same colour rather than by drawing a
          rounded triangle, which keeps it one shape at any size. */}
      <Svg width={20} height={20} viewBox="0 0 24 24">
        <Path
          d="M7 4.5l13 7.5-13 7.5z"
          fill={hexA(p.text, 0.8)}
          stroke={hexA(p.text, 0.8)}
          strokeWidth={3.2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </Svg>
    </Pressable>
  );
}


/**
 * The app is not getting this user's steps.
 *
 * A mark rather than a sentence: the strip has one line of subtext and it is
 * already spoken for by the day's own state or its single Todo. This says
 * "something is missing here" and the sheet it opens says what and why, which
 * is the right split for a thing that is a setup gap rather than a reading.
 */
function StepsMark() {
  const p = usePalette();
  // The chevron's own colour, not a warning colour. It sits in the chevron's
  // slot and means "there is something to open here", which is what the
  // chevron meant; gold would have made a setup gap look like a reading.
  const c = hexA(p.textDim, 0.8);
  return (
    <View
      accessibilityLabel="Steps are not connected"
      style={{
        width: 22, height: 22, borderRadius: 999,
        borderWidth: 1.6, borderColor: c,
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: 14, fontWeight: '800', lineHeight: 17, color: c }}>!</Text>
    </View>
  );
}

export function BudgetStrip({ budget, locked, pulse, onPress, onShowAnyway, tone }: {
  budget: BudgetView;
  locked: boolean;
  /** A movement to narrate. The bar animates it; this row lends it the one
   *  line of subtext for as long as the moved slice keeps its own colour. */
  pulse?: BudgetPulse | null;
  onPress: () => void;
  /** Reveal a paused day's number. Absent on the surfaces where the choice
   *  does not belong (a locked tier, a finished day). */
  onShowAnyway?: () => void;
  /**
   * The colour a paused card is drawn in: the DAY'S OWN score colour, so a
   * pause on a Moderate day is that day's yellow and a pause on a crash day
   * is its red. A pause is a statement about the day, and drawing every one
   * of them in crash red said the same thing about two days the gauge above
   * had just graded differently. Falls back to the caution gold where there
   * is no score to read (the unscored and baseline-waiting cards).
   */
  tone?: string;
}) {
  const p = usePalette();

  /* The subtext steps aside for the phrase and comes back. One timeline in
     ./style, shared with the bar, so the words are never on screen a beat
     after the slice they name has become part of the bar. */
  const subO = useSharedValue(1);
  const msgO = useSharedValue(0);
  const pulseId = pulse ? pulse.id : 0;
  React.useEffect(() => {
    if (!pulse) { subO.value = 1; msgO.value = 0; return; }
    const t = { duration: PULSE_TEXT_IN_MS, easing: Easing.inOut(Easing.quad) };
    subO.value = withSequence(
      withTiming(0, { duration: PULSE_TEXT_OUT_MS, easing: Easing.inOut(Easing.quad) }),
      withDelay(PULSE_COLOR_MS + PULSE_TEXT_IN_MS - PULSE_TEXT_OUT_MS, withTiming(1, t)),
    );
    msgO.value = withDelay(PULSE_TEXT_OUT_MS, withSequence(
      withTiming(1, t),
      withDelay(PULSE_COLOR_MS - PULSE_TEXT_OUT_MS - PULSE_TEXT_IN_MS, withTiming(0, t)),
    ));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulseId]);
  const subStyle = useAnimatedStyle(() => ({ opacity: subO.value }));
  const msgStyle = useAnimatedStyle(() => ({ opacity: msgO.value }));

  const frame = {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: p.border,
    marginTop: 14,
    paddingTop: 12,
  } as const;

  /* ---------- locked: one row, the same height, no fake value ---------- */
  if (locked) {
    return (
      <View style={frame}>
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel="Pacing budget, included with Pro. See what it does."
          hitSlop={6}
          style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 11 }, pressed && { opacity: 0.75 }]}
        >
          <Icon name="lock" size={14} color={p.textDim} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 13.5, fontWeight: '700', color: hexA(p.text, 0.8) }}>Pacing budget</Text>
            <Text style={{ fontSize: 11.5, color: p.textDim, marginTop: 2 }}>Included with Pro</Text>
          </View>
          <Text style={{ fontSize: 12.5, fontWeight: '700', color: p.accent }}>See what it does</Text>
        </Pressable>
      </View>
    );
  }

  /* ---------- suppressed: a pause, not a small number ----------
     RED, not gold. A pause is the app withholding a number because it thinks
     the reader should rest, which is the same register as the crash flag it
     sits under, and gold read as a hint next to it. When the day IS crash
     grade the two are ONE object: the caller hands its warning down and the
     card grows a divider and a second row, rather than stacking two bordered
     boxes saying related things in different colours. */
  if (budget.state === 'suppressed') {
    const c = tone || CAUTION_GOLD;
    return (
      <View style={frame}>
        <View style={{
          backgroundColor: mixHex(c, WARN_BASE, 0.14),
          borderWidth: 1, borderColor: hexA(c, 0.55),
          borderRadius: 15, overflow: 'hidden',
        }}>
          <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={`${budget.figure}. ${budget.sub}.`}
            style={({ pressed }) => [{
              flexDirection: 'row', alignItems: 'center', gap: 12,
              paddingVertical: 12, paddingLeft: 13, paddingRight: 12,
            }, pressed && { opacity: 0.8 }]}
          >
            <View style={{
              width: 38, height: 38, borderRadius: 13,
              backgroundColor: hexA(c, 0.16),
              alignItems: 'center', justifyContent: 'center',
            }}>
              <PauseGlyph color={c} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 13.5, fontWeight: '700', color: p.text }}>{budget.figure}</Text>
              <Text style={{ fontSize: 11.5, color: hexA(p.text, 0.66), marginTop: 2 }} numberOfLines={1}>{budget.sub}</Text>
            </View>
            {/* On today only. A finished day's pause is a record, and there is
                nothing to unpause about last Tuesday. */}
            {onShowAnyway && !budget.past
              ? <ShowAnywayButton onPress={onShowAnyway} />
              : <Icon name="chevronRight" size={13} color={p.textDim} />}
          </Pressable>
          {/* ALWAYS, not conditionally. The advice and the pause are one
              notice (../../lib/budget/pause's `PAUSE_ADVICE`), so rendering
              it here rather than taking it as a prop is what makes "they
              cannot appear without each other" a property of the component
              instead of a rule three callers have to remember.

              The divider is faint and in the container's own colour: it
              separates two statements inside one notice, and a full-strength
              rule would make them two notices again. */}
          <View style={{ height: 1, backgroundColor: hexA(c, 0.28) }} />
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', paddingVertical: 11, paddingHorizontal: 13 }}>
            <Icon name="alert" size={15} color={c} />
            <Text style={{ flex: 1, fontSize: 13, lineHeight: 17, fontWeight: '600', color: c }}>{PAUSE_ADVICE}</Text>
          </View>
        </View>
      </View>
    );
  }

  /* ---------- a finished day the app never saw ---------- */
  if (budget.state === 'unknown') {
    return (
      <View style={frame}>
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel="No pacing data for this day"
          hitSlop={4}
          style={({ pressed }) => [{ paddingVertical: 10 }, pressed && { opacity: 0.85 }]}
        >
          {/* No PACING label here, unlike every other state. The label's job is
              to introduce a figure, and there is no figure — leaving it in made
              a sentence about absent data read as a heading over a blank. The
              line is centred and given air for the same reason: it is standing
              in for the whole strip, not sitting in a corner of it. */}
          <Text
            style={{ fontSize: 13.5, lineHeight: 19, color: p.textDim, textAlign: 'center' }}
            numberOfLines={1}
          >
            {budget.sub}
          </Text>
        </Pressable>
      </View>
    );
  }

  /* ---------- the live and finished states that carry a bar ---------- */
  const over = budget.state === 'over' || budget.state === 'final-over';

  return (
    <View style={frame}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Pacing budget. ${budget.figure} ${budget.figureSub}. ${budget.sub}`}
        hitSlop={4}
        style={({ pressed }) => [pressed && { opacity: 0.85 }]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 7, marginBottom: 9 }}>
          {/* Same size as the figure beside it: the two read as one line
              rather than as a caption over a number. Colour is what keeps it
              in the background. */}
          <Text style={{ fontSize: 14.5, fontWeight: '700', letterSpacing: 0.9, textTransform: 'uppercase', color: p.textDim }}>
            Pacing
          </Text>
          <Text
            style={{
              fontFamily: fonts.numHeavy, fontSize: 14.5,
              fontVariant: ['tabular-nums'],
              color: over ? p.accent : p.text,
            }}
          >
            {budget.figure}
          </Text>
          <Text style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: p.textDim }} numberOfLines={1}>
            {budget.figureSub}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
          <BudgetBar
            state={budget.state}
            fill={budget.fill}
            expected={budget.pace ? budget.pace.expected : null}
            still={budget.past}
            skeleton={budget.skeleton}
            pulse={pulse}
          />
          {/* The mark takes the chevron's slot rather than sitting beside the
              figure. It IS the affordance while it is there: the strip still
              opens, and what it opens onto is the ask. */}
          {budget.stepsMissing
            ? <StepsMark />
            : <Icon name="chevronRight" size={18} color={hexA(p.textDim, 0.8)} />}
        </View>

        <View style={{ position: 'relative', marginTop: over ? SUB_GAP_OVER : SUB_GAP }}>
          <Reanimated.View style={[{ flexDirection: 'row', alignItems: 'center', gap: 7 }, subStyle]}>
            {budget.flag ? <Mark tone={budget.flag} /> : null}
            <Text
              style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: budget.flag ? hexA(p.text, 0.8) : p.textDim }}
              numberOfLines={1}
            >
              {budget.sub}
            </Text>
            {budget.rightLabel ? (
              // Flush to the card's own right edge, NOT inset under the
              // chevron. It is a label on the strip, not on the bar, and
              // ending it short of the margin left a ragged gutter beside
              // every other right-aligned thing on the card.
              <Text style={{ fontSize: 12.5, color: p.textDim }} numberOfLines={1}>
                {budget.rightLabel}
              </Text>
            ) : null}
          </Reanimated.View>
          {/* Sits exactly on top of the line it replaces, so nothing below the
              strip moves while the two cross over. */}
          {pulse ? (
            <Reanimated.View
              pointerEvents="none"
              style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'center' }, msgStyle]}
            >
              <Text
                style={{
                  fontSize: 12.5, fontWeight: '700',
                  fontVariant: ['tabular-nums'],
                  color: pulse.dir === 'up' ? p.accent : SCORE_COLORS.good,
                }}
                numberOfLines={1}
              >
                {pulse.text}
              </Text>
            </Reanimated.View>
          ) : null}
        </View>
      </Pressable>
    </View>
  );
}
