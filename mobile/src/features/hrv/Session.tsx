/**
 * Live HRV capture — the CARD. Everything it shows lives in `sessionStore`; this
 * file is a view over it, which is what lets the same reading be folded into a
 * pill (`SessionPill`) and brought back without the capture noticing.
 *
 * Choosing settings opens this card with a "Start reading" button; the breathing
 * guide animates immediately so you can settle into the rhythm, but the timer
 * and RR/HR collection do not begin until Start is pressed. Once running, a
 * single "Finish now" ends early; it also auto-finishes at the full duration. On
 * finish the store stamps a result and `SessionHost` raises either the results
 * card (strap/camera) or the Apple-Health watch sync card over this one.
 *
 * Camera (PPG) source: this card never shows a pre-start state — the
 * camera-setup card (CameraSetup.tsx) owns the camera view + torch, locks the
 * pulse, and opens this card with autoStart the moment a finger is detected,
 * staying mounted underneath so the stream survives the handoff. That mounted
 * camera view is also why a camera reading cannot be minimized: folding the card
 * away closes the sheet stack, and the stream would go with it.
 *
 * Three states, one layout:
 *
 * - **Live data** (strap, camera): the timer is followed by heart rate, SDNN and
 *   the beat-to-beat trace (`LiveStats`), which is the card's real answer to "is
 *   this working".
 * - **Apple Watch**: no live data exists to show — the wrist does not stream —
 *   so the tiles are replaced by one honest line beside the Mindfulness mark
 *   rather than three dashes pretending to be a connection.
 * - **Hidden** (the eye button): rings, phase word and a dimmed timer on black.
 *   Nothing moves when it is toggled — the rings stay exactly where they were,
 *   because a breathing guide that jumps position mid-reading is the same
 *   problem as one that jumps phase.
 */
import React, { useEffect } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { SheetControls, SheetFooter, SheetPill, SheetPillButton } from '../../components/Sheet';
import { Button } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { fonts, usePalette, GRADE_COLORS } from '../../theme';
import { BreathingViz } from './BreathingViz';
import { BREATH_STYLE, styleTitle } from '../../lib/breathStyle';
import { LiveStats } from './LiveStats';
import { MindfulnessIcon } from './MindfulnessIcon';
import {
  beginCollection, canMinimize, endSession, finishSession, minimizeSession,
  setSessionHidden, startSession, useSession, type SessionConfig, type SessionSnapshot,
} from './sessionStore';

export { BREATH_STYLE, styleTitle };
export { durationFor } from './sessionStore';
export type { SessionConfig } from './sessionStore';

/**
 * Mounted by the pickers (and by `SessionPill` on restore). Opening the card is
 * what STARTS a session; `startSession` is idempotent, so coming back from the
 * pill re-attaches to the reading already running instead of restarting it.
 */
export function HrvSession({ config, controls, autoStart }: {
  config?: SessionConfig; controls: SheetControls; autoStart?: boolean;
}) {
  useEffect(() => {
    if (config) startSession(config, autoStart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <SessionCard controls={controls} />;
}

// Tightened from the pre-live-stats card (R 108 / stroke 9): three data cards
// now sit under the timer, and at the old size the "Connecting to strap" line
// and the footer fell off the bottom of the sheet. A reading you sit in front
// of for five minutes must not need scrolling.
const R = 96, SW = 8, C = 2 * Math.PI * R;
const RING_SIZE = 2 * (R + SW);
/**
 * The header is a FIXED height rather than two rows that happen to measure the
 * same. Focus mode swaps a pair of pill buttons for one wide pill, and the pill
 * chrome's own padding and border made the two differ by a couple of points —
 * which the eye reads as the rings twitching upward the moment you hide the
 * numbers. Nothing above the rings may move.
 */
const HEADER_H = 52;
/** The rings sit just inside the progress ring, at the same ratio as before. */
const VIZ_SIZE = 168;

/** Exported for the dev-only screenshot scenes, which mount it over a
 *  fabricated snapshot (`__devMockSession`). The app reaches it via HrvSession. */
export function SessionCard({ controls }: { controls: SheetControls }) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const s = useSession((x) => x);

  // Minimizing dismisses the card and leaves the reading running; the pill in
  // the root layout takes over. Restoring re-opens this same component.
  //
  // closeAll, not close: the picker that launched the reading is still sitting
  // underneath (WatchPrep deliberately stays mounted so its ✕ backs out here),
  // and dismissing only the top card would leave the user staring at a setup
  // sheet for a reading that is already running. Minimize means "get out of my
  // way" — it should land on the journal with the pill, nothing else.
  useEffect(() => { if (s.minimized) controls.closeAll(); }, [s.minimized, controls]);

  if (!s.config) return null;
  const { config, hidden, status } = s;
  const started = status === 'running' || status === 'finished';
  const finished = status === 'finished';
  const frac = started ? s.elapsed / s.durationSec : 0;
  const remain = s.durationSec - s.elapsed;
  const mmss = `${Math.floor(remain / 60)}:${String(remain % 60).padStart(2, '0')}`;
  // The strap connects while this card sits open; don't start until it's live.
  const strapPending = config.source === 'polar' && !started && !s.connected;
  const phaseWord = finished ? 'Done' : s.phase === 'in' ? 'Breathe in' : s.phase === 'out' ? 'Breathe out' : 'Hold';

  return (
    <View style={{ alignItems: 'center', paddingTop: 8, flexGrow: hidden ? 1 : 0 }}>
      {/* Focus mode blacks the card out rather than dimming it: the sheet's own
          surface is set at the provider, so the only way to take it to black is
          to lay a full-bleed panel over it. Negative insets cover the sheet's
          padding; the tail is clipped by the sheet's overflow: hidden. */}
      {hidden ? (
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: -18, right: -18, top: -24, bottom: -600, backgroundColor: '#000' }}
        />
      ) : null}

      <Header
        config={config}
        hidden={hidden}
        width={width}
        hint={statusHint(s)}
        onMinimize={minimizeSession}
        onHide={() => setSessionHidden(!hidden)}
      />

      <View style={{ width: RING_SIZE, height: RING_SIZE, marginTop: 12, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={RING_SIZE} height={RING_SIZE} style={{ position: 'absolute' }}>
          <Circle cx={R + SW} cy={R + SW} r={R} stroke={hidden ? '#141416' : p.surface2} strokeWidth={SW} fill="none" />
          <Circle
            cx={R + SW} cy={R + SW} r={R} stroke={s.artifact ? GRADE_COLORS.bad : p.accent} strokeWidth={SW} fill="none"
            strokeLinecap="round" strokeDasharray={`${C}`} strokeDashoffset={C * (1 - frac)}
            transform={`rotate(-90 ${R + SW} ${R + SW})`}
          />
        </Svg>
        {config.kind === 'breath' ? (
          <BreathingViz pattern={s.pattern} startMs={s.breathStartMs} running={!finished} size={VIZ_SIZE} frozenProgress={s.frozenBreath} />
        ) : (
          <Text style={{ color: p.textDim, fontSize: 16, textAlign: 'center', paddingHorizontal: 40 }}>
            Stay still,{'\n'}breathe normally
          </Text>
        )}
      </View>

      {config.kind === 'breath' ? (
        <Text style={{ color: p.accent, fontSize: 18, fontWeight: '700', letterSpacing: 0.3, marginTop: 12 }}>{phaseWord}</Text>
      ) : null}
      <Text style={{
        color: hidden ? '#5a5a62' : p.text, fontFamily: fonts.numHeavy, fontSize: 46,
        fontVariant: ['tabular-nums'], marginTop: config.kind === 'breath' ? 4 : 14,
      }}>{mmss}</Text>

      {hidden ? null : (
        <View style={{ width: '100%', marginTop: 14 }}>
          {config.source === 'watch' ? <WatchNote /> : (
            <LiveStats
              hr={s.hr} sdnn={s.sdnn} beats={s.beats} artifact={s.artifact}
              hrTrace={s.hrTrace} sdnnTrace={s.sdnnTrace} rrTrace={s.rrTrace}
            />
          )}
        </View>
      )}

      {/* Hidden mode pins its own outlined button to the bottom of the (grown)
          card instead of using the sheet's fixed footer — the footer paints the
          sheet's own surface colour, which would leave a grey band across the
          blacked-out screen. */}
      {hidden ? (
        <View style={{ marginTop: 'auto', width: '100%', paddingTop: 28, paddingBottom: insets.bottom }}>
          <Pressable
            onPress={() => void finishSession()}
            style={{ height: 54, borderRadius: 16, borderWidth: 1, borderColor: '#ffffff1f', alignItems: 'center', justifyContent: 'center' }}
            accessibilityRole="button"
          >
            <Text style={{ color: p.textDim, fontSize: 16, fontWeight: '700' }}>Finish now</Text>
          </Pressable>
        </View>
      ) : (
        <SheetFooter>
          {started ? (
            <Button title="Finish now" variant="primary" onPress={() => void finishSession()} />
          ) : (
            <>
              <Button title="Cancel" variant="ghost" onPress={() => { endSession(); controls.close(); }} />
              {/* A 5-minute reading must not start before the strap answers. */}
              <Button title="Start reading" variant="primary" onPress={beginCollection} disabled={strapPending} />
            </>
          )}
        </SheetFooter>
      )}
    </View>
  );
}

/**
 * Minimize (left) and hide (right) flank the reading's own title. They are the
 * sheet's pill chrome rather than bespoke buttons, so they read as the same kind
 * of control as the ✕ every other sheet carries — this one has none, because a
 * reading in progress is not something to dismiss by accident.
 */
function Header({ config, hidden, width, hint, onMinimize, onHide }: {
  config: SessionConfig; hidden: boolean; width: number; hint: Hint | null;
  onMinimize: () => void; onHide: () => void;
}) {
  const p = usePalette();
  if (hidden) {
    return (
      <View style={{ width: '100%', height: HEADER_H, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' }}>
        <Pressable
          onPress={onHide}
          accessibilityRole="button"
          accessibilityLabel="Show numbers"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 7, height: 36, paddingHorizontal: 14, borderRadius: 999, backgroundColor: '#ffffff0d' }}
        >
          <Icon name="eye" size={15} color={p.textDim} />
          <Text style={{ color: p.textDim, fontSize: 13, fontWeight: '600' }}>Show numbers</Text>
        </Pressable>
      </View>
    );
  }
  const showMinimize = canMinimize(config);
  return (
    <View style={{ width: '100%', height: HEADER_H, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      {showMinimize ? (
        <SheetPill lone><SheetPillButton icon="minimize" size={16} onPress={onMinimize} label="Minimize reading" /></SheetPill>
      ) : <View style={{ width: 48 }} />}
      {/* The status pill takes the title's slot rather than sitting under the
          charts. "Training" never changes and the reader chose it two cards ago;
          whether the strap is answering is the only thing up here they might
          actually need, and it belongs at the top of the card, not below the
          fold. One word when there is nothing to report — the pattern
          ("4 / 6 breathing") is visible in the rings themselves. */}
      {hint ? (
        <HintPill {...hint} maxWidth={width - 132} />
      ) : (
        <Text
          numberOfLines={1}
          style={{ color: p.textDim, fontSize: 16, textTransform: 'uppercase', letterSpacing: 1.4, fontWeight: '800', maxWidth: width - 190, textAlign: 'center' }}
        >
          {config.kind === 'breath' ? 'Training' : 'Baseline'}
        </Text>
      )}
      <SheetPill lone><SheetPillButton icon="eyeOff" size={16} onPress={onHide} label="Hide numbers" /></SheetPill>
    </View>
  );
}

/**
 * The Apple Watch case. Nothing streams from the wrist mid-reading, so the card
 * says exactly that instead of showing empty tiles — and says it beside the
 * Mindfulness mark, since that is the app the wearer is looking at.
 */
function WatchNote() {
  const p = usePalette();
  return (
    <View style={{ backgroundColor: p.sunk, borderRadius: 20, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 13 }}>
      {/* The app icon itself, at app-icon size and with no tile behind it — it
          is already a filled circle, and boxing it made it read as our glyph
          rather than as the thing they are about to open on their wrist. */}
      <MindfulnessIcon size={46} />
      <Text style={{ flex: 1, color: p.textDim, fontSize: 13.5, lineHeight: 20 }}>
        Apple Watch does not share data in real time. Your reading syncs in when it finishes.
      </Text>
    </View>
  );
}

/**
 * What the header says instead of the title, if anything.
 *
 * Every one of these is transient and every one of them displaces a word the
 * reader already knows, which is the whole argument for putting them there: a
 * status line under the charts sat below the fold on a small phone, and the one
 * time it mattered ("the strap never connected") was the one time it was not
 * seen. Ordered by urgency — a noisy signal outranks a connection state,
 * because it is the one that invalidates the reading in progress.
 *
 * Nothing for the watch source: `WatchNote` already says the only thing there is
 * to say, and repeating it in the header would be the same sentence twice.
 */
interface Hint { tone: string | null; icon: React.ComponentProps<typeof Icon>['name']; text: string }

function statusHint(s: SessionSnapshot): Hint | null {
  const started = s.status === 'running' || s.status === 'finished';
  const finished = s.status === 'finished';
  const src = s.config?.source;
  if (finished) return null;
  if (s.artifact) {
    return {
      tone: GRADE_COLORS.bad, icon: 'triangle',
      text: src === 'camera' ? 'Signal noisy, steady your finger' : 'Signal noisy, adjust the strap',
    };
  }
  // Finger lifted mid-reading: warn instead of silently collecting junk.
  if (src === 'camera' && started && !s.signal.locked) {
    return { tone: GRADE_COLORS.bad, icon: 'triangle', text: 'Pulse lost, cover the lens' };
  }
  if (src === 'polar' && !s.connected) return { tone: GRADE_COLORS.ok, icon: 'triangle', text: 'Connecting to strap…' };
  if (src === 'polar' && !started) return { tone: GRADE_COLORS.good, icon: 'check', text: 'Strap connected' };
  return null;
}

/** A tinted pill rather than loose coloured text: mid-reading these are the only
 *  words on the card that change, and a bare orange sentence read as an error to
 *  be decoded rather than a state to be glanced at. */
function HintPill({ tone, icon, text, maxWidth }: Hint & { maxWidth: number }) {
  const p = usePalette();
  const color = tone || p.textDim;
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 7, paddingLeft: 11, paddingRight: 14, height: 34, maxWidth,
      borderRadius: 999, borderWidth: 1, borderColor: color + '4d', backgroundColor: color + '1f',
    }}>
      <Icon name={icon} size={14} color={color} strokeWidth={2.2} />
      <Text numberOfLines={1} style={{ color, fontSize: 13.5, fontWeight: '600' }}>{text}</Text>
    </View>
  );
}
