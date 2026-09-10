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
 * Six states, all drawn from the design: healthy, ahead, over, low
 * confidence, suppressed, locked. Learning is not a seventh — it is whichever
 * of the first four applies, wearing "Learning · day 3" where the confidence
 * word would sit.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Reanimated, {
  Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming,
} from 'react-native-reanimated';
import { hexA } from '../../lib/color';
import { SCORE_COLORS } from '../../lib/scoring';
import { CAUTION_GOLD, fonts, usePalette } from '../../theme';
import { Icon } from '../../components/Icon';
import type { BudgetView } from '../../lib/budget';
import { BudgetBar } from './Bar';
import type { BudgetPulse } from './pulse';
import { PULSE_COLOR_MS, PULSE_TEXT_IN_MS, PULSE_TEXT_OUT_MS } from './style';

/** Gap above the subtext. Tighter when over, where the bar has grown a glow
 *  and the extra air reads as a gap rather than as breathing room. */
const SUB_GAP = 14;
const SUB_GAP_OVER = 10;
/** The chevron's own width plus its gap, so the right-hand label ends under it
 *  rather than beside it. */
const CHEVRON_INSET = 29;

function Mark({ tone }: { tone: 'amber' | 'red' }) {
  const p = usePalette();
  return <Icon name="info" size={12} color={tone === 'red' ? p.accent : CAUTION_GOLD} />;
}

/** Two rounded bars. There is no pause glyph in the icon set, and a moon read
 *  as bedtime rather than as "deliberately stopped". */
function PauseGlyph() {
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {[0, 1].map((i) => (
        <View key={i} style={{ width: 3.4, height: 15, borderRadius: 2, backgroundColor: CAUTION_GOLD }} />
      ))}
    </View>
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

export function BudgetStrip({ budget, locked, pulse, onPress }: {
  budget: BudgetView;
  locked: boolean;
  /** A movement to narrate. The bar animates it; this row lends it the one
   *  line of subtext for as long as the moved slice keeps its own colour. */
  pulse?: BudgetPulse | null;
  onPress: () => void;
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

  /* ---------- suppressed: a pause, not a small number ---------- */
  if (budget.state === 'suppressed') {
    return (
      <View style={frame}>
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel="Budget paused for today. Take it easy, resume tomorrow."
          style={({ pressed }) => [{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            backgroundColor: hexA(CAUTION_GOLD, 0.08),
            borderWidth: 1, borderColor: hexA(CAUTION_GOLD, 0.22),
            borderRadius: 15, paddingVertical: 12, paddingLeft: 13, paddingRight: 12,
          }, pressed && { opacity: 0.8 }]}
        >
          <View style={{
            width: 38, height: 38, borderRadius: 13,
            backgroundColor: hexA(CAUTION_GOLD, 0.12),
            alignItems: 'center', justifyContent: 'center',
          }}>
            <PauseGlyph />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 13.5, fontWeight: '700', color: p.text }}>{budget.figure}</Text>
            <Text style={{ fontSize: 11.5, color: hexA(p.text, 0.66), marginTop: 2 }} numberOfLines={1}>{budget.sub}</Text>
          </View>
          <Icon name="chevronRight" size={13} color={p.textDim} />
        </Pressable>
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
              <Text style={{ fontSize: 12.5, color: p.textDim, marginRight: CHEVRON_INSET }} numberOfLines={1}>
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
