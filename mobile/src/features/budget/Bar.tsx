/**
 * The spend bar, and the pace marker that is the design's one new idea.
 *
 * Shared by the Journal strip and the pacing sheet, so the two can never drift
 * apart. Three rules it exists to hold:
 *
 *   FILLING IS NEVER AN ACHIEVEMENT. The fill starts green and moves to gold
 *   as it approaches the ceiling, so the visual reward runs BACKWARDS from a
 *   progress bar. There is no completion state and nothing turns green at 100
 *   percent.
 *
 *   THE MARKER IS WHERE AN EVEN DAY WOULD BE BY NOW. Fill to its left is room,
 *   fill past it is running ahead. It is the only thing that lets a static bar
 *   answer "how fast", and without it a remaining figure at 9am and at 6pm
 *   would mean opposite things while looking identical.
 *
 *   IT ANIMATES ONLY WHEN OVER. Under budget the bar is still. The ember drift
 *   and its glow are the whole of the CONTINUOUS motion in the Outlook card,
 *   which is why they cannot be confused with loading and why they read as a
 *   caution rather than an alarm. A movement is the exception that proves it:
 *   the fill travels once to its new length and stops.
 *
 *   LENGTH AND COLOUR ARE THE WHOLE VOCABULARY. Minutes spent or bought back
 *   move the end of the bar; crossing the pace marker or the ceiling
 *   crossfades the fill itself, and the ember fades with it rather than
 *   snapping off. Nothing is ever drawn in a colour that is not a STATE.
 */
import React from 'react';
import { View } from 'react-native';
import Reanimated, {
  Easing, interpolateColor, runOnJS, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { hexA } from '../../lib/color';
import { EMBER_GLOW_INSET, EMBER_GLOW_MAX, EMBER_GLOW_MIN, EMBER_GLOW_MS, EMBER_MS, emberStops } from '../../lib/ember';
import { SCORE_COLORS } from '../../lib/scoring';
import { CAUTION_GOLD, usePalette } from '../../theme';
import { PULSE_GROW_MS, PULSE_TINT_MS } from './style';
import type { BudgetPulse } from './pulse';
import type { BudgetState } from '../../lib/budget';


/* A provisional reading used to wear a diagonal hatch over the whole bar. It
   is gone: it never tiled cleanly to the bar's real width, and the grey fill
   plus the softened "About 3h" figure plus the "Low confidence" label already
   say the same thing three times without adding texture to a card whose whole
   argument is restraint. */

/** The placeholder grey the Outlook card's ghost bars use, so the strip and the
 *  tiles below it are the same object while both are waiting. */
const SKELETON_FILL = '#34343a';

/**
 * `hexA(mixHex(...))`, on the UI thread.
 *
 * The halo's colour crossfades AND carries an alpha that moves with it, so it
 * has to be built inside the animated style — and a worklet cannot call the
 * plain helpers in lib/color. Both palettes here are `#rrggbb`; anything else
 * passes through as the destination colour rather than throwing mid-frame.
 */
function mixRgba(from: string, to: string, t: number, a: number): string {
  'worklet';
  if (from.length !== 7 || to.length !== 7) return to;
  const f = parseInt(from.slice(1), 16), g = parseInt(to.slice(1), 16);
  const ch = (sh: number) => Math.round((((f >> sh) & 255) * (1 - t)) + (((g >> sh) & 255) * t));
  return `rgba(${ch(16)},${ch(8)},${ch(0)},${a})`;
}

/** The fill's colour, mid-crossfade. Two colours and a 0..1 mix, shared by the
 *  fill and the halo so the two can never be caught in different states. */
type Tint = {
  from: SharedValue<string>;
  to: SharedValue<string>;
  mix: SharedValue<number>;
};

export function fillColorFor(state: BudgetState, p: ReturnType<typeof usePalette>): string {
  if (state === 'over' || state === 'final-over') return p.accent;
  if (state === 'ahead') return CAUTION_GOLD;
  if (state === 'low') return p.textDim;
  return SCORE_COLORS.good;
}

/**
 * The drifting heat on an over-budget bar.
 *
 * `period` is the bar's own measured width, which is exactly one cycle of the
 * doubled gradient — see ../../components/ember for why that is the whole
 * trick. Until the bar has been measured the drift does not run at all, rather
 * than running against a guess and jolting once a cycle.
 */
function Ember({ height, color, period }: { height: number; color: string; period: number }) {
  const shift = useSharedValue(0);
  React.useEffect(() => {
    if (!period) return;
    shift.value = 0;
    shift.value = withRepeat(withTiming(1, { duration: EMBER_MS, easing: Easing.linear }), -1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);
  const drift = useAnimatedStyle(() => ({ transform: [{ translateX: -shift.value * period }] }));
  const stops = React.useMemo(() => emberStops(color), [color]);
  const gid = React.useMemo(() => `pbEmber${Math.random().toString(36).slice(2, 8)}`, []);

  if (!period) return null;
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 999, overflow: 'hidden' }}>
      <Reanimated.View style={[{ width: period * 2, height: '100%' }, drift]}>
        <Svg width={period * 2} height={height}>
          <Defs>
            <LinearGradient id={gid} x1="0" y1="0" x2="1" y2="0">
              {stops.map((st) => <Stop key={st.offset} offset={st.offset} stopColor={st.color} />)}
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={period * 2} height={height} fill={`url(#${gid})`} />
        </Svg>
      </Reanimated.View>
    </View>
  );
}

/**
 * The soft halo behind the fill.
 *
 * Present in EVERY state, not just the hot one: it is the same object the
 * Outlook gauge above draws under its arc (a wider, low-alpha copy of itself),
 * and having it on one and not the other made the two read as different kinds
 * of thing. Only its BREATHING is reserved for over budget.
 */
function Glow({ tint, shadow, breathing }: { tint: Tint; shadow: string; breathing: boolean }) {
  const glow = useSharedValue(breathing ? EMBER_GLOW_MIN : 1);
  React.useEffect(() => {
    if (!breathing) { glow.value = 1; return; }
    glow.value = EMBER_GLOW_MIN;
    glow.value = withRepeat(
      withTiming(EMBER_GLOW_MAX, { duration: EMBER_GLOW_MS, easing: Easing.inOut(Easing.quad) }),
      -1, true,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breathing]);
  // The halo's alpha travels with the colour rather than stepping: leaving the
  // hot state is one gesture, and a halo that thins in the same frame the fill
  // starts crossfading reads as two.
  const alpha = useSharedValue(breathing ? 0.33 : 0.16);
  React.useEffect(() => {
    alpha.value = withTiming(breathing ? 0.33 : 0.16, { duration: PULSE_TINT_MS, easing: Easing.inOut(Easing.quad) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breathing]);
  const style = useAnimatedStyle(() => ({
    opacity: glow.value,
    backgroundColor: mixRgba(tint.from.value, tint.to.value, tint.mix.value, alpha.value),
  }));
  return (
    <Reanimated.View
      pointerEvents="none"
      style={[{
        position: 'absolute',
        left: -EMBER_GLOW_INSET, right: -EMBER_GLOW_INSET,
        top: -EMBER_GLOW_INSET, bottom: -EMBER_GLOW_INSET,
        borderRadius: 999,
        // Matches the gauge's own halo: a wider copy of the shape at a low
        // alpha, in the shape's colour (animated with the fill's, below).
        shadowColor: shadow, shadowOpacity: breathing ? 0.9 : 0.5, shadowRadius: 5, shadowOffset: { width: 0, height: 0 },
      }, style]}
    />
  );
}

export function BudgetBar({ state, fill, expected, still, skeleton, pulse, height = 12 }: {
  state: BudgetState;
  /** 0..1, may exceed 1 when over. */
  fill: number;
  /** 0..1 marker position, or null to draw no marker. */
  expected: number | null;
  /** Breathe the empty track, the way the placeholder bars in the tiles below
   *  the strip do. Same 1600ms in and out, so a card that is waiting on a first
   *  reading pulses as ONE object rather than as a still bar over three moving
   *  tiles. */
  skeleton?: boolean;
  /** Draw the hot state without its drift. A finished day is a record, not a
   *  live warning, so it keeps the red and the halo and loses the motion. */
  still?: boolean;
  /** A movement to narrate. The bar simply travels to its new length, over the
   *  longer beat the phrase under it is on screen for, and crossfades its whole
   *  fill if that length changed the state (green → gold → red, and back). No
   *  slice in a colour of its own. */
  pulse?: BudgetPulse | null;
  height?: number;
}) {
  const p = usePalette();
  const over = state === 'over' || state === 'final-over';
  // The DRIFT and the breathing halo are the live warning, so they belong to
  // today alone: a finished day keeps the red and loses the motion. Derived
  // from the state as well as from `still` so a caller that forgets the prop
  // still cannot set last Tuesday on fire.
  const hot = over && !still && state !== 'final-over';
  const pct = Math.max(0, Math.min(1, fill));
  const color = fillColorFor(state, p);
  // What the bar draws. Past the ceiling the fill is pinned full and the
  // overshoot is told by the colour and the ember instead, so a pulse that
  // crosses the line travels to the end and stops there.
  const target = over ? 1 : pct;

  // Matches GhostBar in features/DaySummary: 0.45 to 1 and back, 1600ms each
  // way, quad in-out. Copied deliberately rather than shared — the two live in
  // different layers, and the alternative was exporting an animation.
  const breathe = useSharedValue(1);
  React.useEffect(() => {
    if (!skeleton) { breathe.value = 1; return; }
    breathe.value = 0.45;
    breathe.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.45, { duration: 1600, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skeleton]);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: breathe.value }));
  // The fill's own width in points, which is one full cycle of the ember's
  // doubled gradient. Measured rather than assumed: a fixed guess is what made
  // the loop jolt, and a bar in a sheet is a different width from one in the
  // Journal card anyway.
  const [fillW, setFillW] = React.useState(0);

  /* ---------------- the movement ----------------
     A movement is told by the bar's LENGTH and its COLOUR, and by nothing
     else. It used to grow a slice in a colour of its own — red for minutes
     spent, green for minutes bought back — which made a plain green bar wear a
     red chip for two seconds on a day that was never over anything, and read
     as a verdict on the minutes rather than as the bar arriving somewhere new.
     So the fill simply travels to its new length, and if that length crosses
     the pace marker or the ceiling the whole fill CROSSFADES to the colour
     that state wears: green to gold on running ahead, gold to red on going
     over, and back the same way when minutes are bought back. The colour is
     the state, so it is the colour that changes when the state does.

     A pulse (a build the app can attribute to a spend row) is given the longer
     travel, because the phrase naming it is on screen for that whole time;
     anything else — a ceiling that moved, a range switch — eases more briskly.
     A bar that jumps is what both replace. */
  const w = useSharedValue(target);
  const pulseId = pulse ? pulse.id : 0;

  React.useEffect(() => {
    w.value = withTiming(target, {
      duration: pulse ? PULSE_GROW_MS : 420,
      easing: Easing.out(Easing.cubic),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, pulseId]);

  // The crossfade. `to` is where the colour is going and `from` is where it
  // came from, so a state change mid-fade never snaps: it starts from the
  // colour already on screen's own endpoint rather than from the palette.
  const cFrom = useSharedValue(color);
  const cTo = useSharedValue(color);
  const cMix = useSharedValue(1);
  React.useEffect(() => {
    if (cTo.value === color) return;
    cFrom.value = cTo.value;
    cTo.value = color;
    cMix.value = 0;
    cMix.value = withTiming(1, { duration: PULSE_TINT_MS, easing: Easing.inOut(Easing.quad) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color]);
  const tint: Tint = { from: cFrom, to: cTo, mix: cMix };

  /* The ember is the hot state's own texture, so it fades with the colour
     rather than switching off the instant the state does: a bar that goes from
     the red fire to gold in one frame is the jump this whole gesture exists to
     avoid. It keeps burning in the colour it was lit in while it leaves. */
  const [emberOn, setEmberOn] = React.useState(hot);
  const [emberColor, setEmberColor] = React.useState(color);
  const emberO = useSharedValue(hot ? 1 : 0);
  React.useEffect(() => {
    if (hot) {
      setEmberOn(true);
      setEmberColor(color);
      emberO.value = withTiming(1, { duration: PULSE_TINT_MS, easing: Easing.inOut(Easing.quad) });
      return;
    }
    emberO.value = withTiming(0, { duration: PULSE_TINT_MS, easing: Easing.inOut(Easing.quad) }, (done) => {
      if (done) runOnJS(setEmberOn)(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hot, color]);
  const emberStyle = useAnimatedStyle(() => ({ opacity: emberO.value }));

  const fillStyle = useAnimatedStyle(() => ({
    width: `${Math.max(0, Math.min(1, w.value)) * 100}%`,
    backgroundColor: interpolateColor(cMix.value, [0, 1], [cFrom.value, cTo.value]),
  }));

  return (
    <View style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      {/* While it is a placeholder it wears the placeholder's own tone, not the
          track's. At 6% white the pulse was technically running and visually
          absent, so it read as a still bar over three breathing tiles. */}
      <Reanimated.View
        style={[
          { height, borderRadius: 999, backgroundColor: skeleton ? SKELETON_FILL : hexA(p.text, 0.06), overflow: 'visible' },
          skeleton && pulseStyle,
        ]}
      >
        <Reanimated.View
          onLayout={(e) => setFillW(Math.round(e.nativeEvent.layout.width))}
          style={[{
            position: 'absolute', left: 0, top: 0, bottom: 0, zIndex: 2,
            // The state's colour flat, under the animated one that crossfades
            // over it: the fill must have a colour even in a frame where the
            // animated style has not been applied yet.
            borderRadius: 999, backgroundColor: color,
          }, fillStyle]}
        >
          {/* Always, once there is a fill for it to sit behind. The halo is
              what the gauge above already wears and the two are the same kind
              of object, so only the BREATHING is the hot state's own. Below a
              sliver of fill it is skipped: the halo is inset outward, so on a
              zero-width fill it renders as a small blob floating at the left
              end of an empty track. */}
          {pct > 0.01 || over ? <Glow tint={tint} shadow={color} breathing={hot} /> : null}
          {emberOn ? (
            <Reanimated.View
              pointerEvents="none"
              style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }, emberStyle]}
            >
              <Ember height={height} color={emberColor} period={fillW} />
            </Reanimated.View>
          ) : null}
        </Reanimated.View>
        {/* The pace marker. Never drawn when over: past the ceiling the
            question "are you ahead of an even day" has stopped mattering. */}
        {expected != null && !over ? (
          <>
            <View
              pointerEvents="none"
              style={{
                position: 'absolute', left: `${Math.max(0, Math.min(1, expected)) * 100}%`,
                top: -4, bottom: -4, width: 2, marginLeft: -1, zIndex: 4,
                borderRadius: 999, backgroundColor: hexA(p.text, 0.84),
              }}
            />
            <View
              pointerEvents="none"
              style={{
                position: 'absolute', left: `${Math.max(0, Math.min(1, expected)) * 100}%`,
                top: height + 2, marginLeft: -5, zIndex: 4,
                width: 0, height: 0,
                borderLeftWidth: 5, borderRightWidth: 5, borderBottomWidth: 6,
                borderLeftColor: 'transparent', borderRightColor: 'transparent',
                borderBottomColor: hexA(p.text, 0.84),
              }}
            />
          </>
        ) : null}
      </Reanimated.View>
    </View>
  );
}
