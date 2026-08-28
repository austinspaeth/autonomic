/**
 * The two halves of a reading that must outlive the card showing it: the
 * floating pill it folds into, and the hand-off to the results sheet when it
 * ends.
 *
 * Both are here rather than in `Session.tsx` for the same reason the engine is
 * in `sessionStore`: the card can be closed mid-reading, so nothing that has to
 * survive that can live inside it. Mounted once in the root layout (inside
 * SheetProvider — it opens sheets), exactly like `WatchSyncPill`.
 *
 * The finish hand-off has one subtlety worth keeping. The results sheet is
 * opened HERE, not by the card, because a reading can finish while minimized
 * (the strap keeps streaming with the phone face down and the card gone). The
 * session is then torn down when the sheet stack empties again — not when the
 * results sheet unmounts, since its Done button calls closeAll() and the session
 * card beneath is still playing its exit; clearing the store a beat early would
 * blank that card out on its way down.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { useSheets } from '../../components/Sheet';
import { fonts, usePalette } from '../../theme';
import { BreathBars } from './BreathingViz';
import { HrvSession } from './Session';
import { HrvResults } from './Results';
import { GarminSyncSheet } from './GarminSync';
import { startGarminSync, stopGarminSync } from './garminSyncStore';
import { garminDevices, subscribeGarminArrivals } from '../../lib/garmin/receiver';
import { WatchSyncSheet } from './WatchSync';
import { startWatchSync } from './watchSyncStore';
import { setPillSlotClaim } from '../../store/pillSlot';
import {
  endSession, getSessionSnapshot, restoreSession, streamsLive, useSession,
} from './sessionStore';

export function HrvSessionHost() {
  const { openSheet, depth } = useSheets();
  const status = useSession((s) => s.status);
  // Opened once per reading; the flag also stops a re-render from raising a
  // second results card while the first is still animating in.
  const handed = useRef(false);
  const sawSheet = useRef(false);

  // The reading can land BEFORE the phone's countdown runs out, and routinely
  // does: the watch's clock starts when its sensor locks, while the phone's
  // starts when the user says they began — and they tap the phone after the
  // watch. So the session is still ticking when the result arrives.
  //
  // Without this the phone kept counting down over a reading it already had,
  // then raised "Finish on your watch" ON TOP of the results card. Ending the
  // session here stops the clock and, because the finish handler only runs on
  // a 'finished' status, prevents the sync card entirely.
  useEffect(() => subscribeGarminArrivals(() => {
    const s = getSessionSnapshot();
    if (s.config?.source === 'garmin' && s.status !== 'idle') {
      handed.current = true;   // the results card is already being raised
      endSession();
    }
    stopGarminSync();
  }), []);

  useEffect(() => {
    if (status !== 'finished') { handed.current = false; sawSheet.current = false; return; }
    if (handed.current) return;
    handed.current = true;
    const s = getSessionSnapshot();
    if (!s.config || !s.result) return;

    // Apple Watch path: the wearer took a reading on the watch (Mindfulness
    // breathing HRV or ECG) during the session. Stack a syncing card that pulls
    // it from Apple Health, evaluates it and shows the results. The window ends
    // when the reading did, not when the app came back to the foreground. The
    // poller lives outside the sheet (watchSyncStore) so "Continue using app"
    // can close the card while the sync keeps running.
    if (s.config.source === 'watch') {
      const startMs = s.startedAtMs || Date.now();
      startWatchSync({
        windowStartMs: startMs,
        windowEndMs: Math.min(Date.now(), startMs + s.durationSec * 1000),
        config: s.config,
      });
      openSheet((c) => <WatchSyncSheet controls={c} />, { hideClose: true });
      return;
    }

    // Garmin: the phone captured nothing, because nothing streams from the
    // wrist. Falling through to the Results path below would build a reading
    // out of an empty array and report "0 beats". The watch pushes the real one
    // over the Connect IQ link when the wearer finishes there.
    if (s.config.source === 'garmin') {
      startGarminSync(garminDevices()[0]?.name ?? null);
      openSheet((c) => <GarminSyncSheet controls={c} />, { hideClose: true });
      return;
    }

    // Strap and camera both finish with the RR array in hand — same Results
    // path. It rises OVER the session card, which recedes beneath it; Results'
    // Done calls closeAll(), so both animate out together.
    const { rr, segmentStarts, hrSamples, sdnnSamples, durationSec } = s.result;
    const config = s.config;
    openSheet((c) => (
      <HrvResults
        rr={rr} segmentStarts={segmentStarts} hrSamples={hrSamples} sdnnSamples={sdnnSamples}
        config={config} durationSec={durationSec} watchFallback={null} controls={c}
      />
    ), { hideClose: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Tear down once the stack the hand-off opened has emptied again. Waiting for
  // a sheet to have EXISTED matters: `depth` is still 0 on the render that opens
  // one, so ending on a bare `depth === 0` would clear the session instantly.
  useEffect(() => {
    if (status !== 'finished') return;
    if (depth > 0) { sawSheet.current = true; return; }
    if (sawSheet.current) endSession();
  }, [status, depth]);

  return <SessionPill />;
}

/* ---------- the minimized reading ---------- */

const DIAL = 28, DIAL_SW = 2.6;

/**
 * The reading, folded down to one pill above the tab bar: elapsed dial, the
 * countdown, the two live numbers, and the breathing indicator on the right.
 * Tapping it anywhere brings the card back — there is no caret, because the
 * whole pill is the target.
 *
 * It ranks FIRST in the pill stack (`lib/pillStack`). Everything else up there
 * is an offer or a notice; this is a five-minute measurement in progress that
 * the user deliberately set aside, and burying it behind a "What's new" prompt
 * would lose them the reading.
 */
function SessionPill() {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const { openSheet } = useSheets();
  const s = useSession((x) => x);
  const shown = s.minimized && s.status !== 'idle' && s.status !== 'finished';
  const opacity = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (shown) {
      setMounted(true);
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    } else if (mounted) {
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true })
        .start(({ finished }) => { if (finished) setMounted(false); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);

  // Own the floating slot while visible so every other pill recedes behind this
  // one. Released on unmount only — a cleanup keyed on visibility would drop and
  // retake the claim on each transition, bouncing the pills below it.
  useEffect(() => { setPillSlotClaim('hrv', shown); }, [shown]);
  useEffect(() => () => setPillSlotClaim('hrv', false), []);

  if (!mounted || !s.config) return null;

  const remain = Math.max(0, s.durationSec - s.elapsed);
  const mmss = `${Math.floor(remain / 60)}:${String(remain % 60).padStart(2, '0')}`;
  const frac = s.status === 'running' ? s.elapsed / s.durationSec : 0;
  const live = streamsLive(s.config.source);
  const reopen = () => {
    restoreSession();
    openSheet((c) => <HrvSession controls={c} />, { hideClose: true, grow: true });
  };

  return (
    <Animated.View pointerEvents="box-none" style={[styles.wrap, { bottom: insets.bottom + 88, opacity }]}>
      <Pressable onPress={reopen} accessibilityRole="button" accessibilityLabel="Reading in progress, tap to reopen">
        <BlurView intensity={40} tint="dark" style={[styles.pill, { borderColor: p.accent + '66' }]}>
          <View style={styles.row}>
            <Dial frac={frac} color={p.accent} track={p.surface2} />
            <Text style={[styles.time, { color: p.text }]}>{mmss}</Text>
            {live ? (
              <>
                <View style={[styles.rule, { backgroundColor: p.border }]} />
                <Metric value={s.hr != null ? String(s.hr) : '—'} unit="bpm" />
                {/* "HRV", not "SDNN": the pill has room for one short word and
                    the reader glancing at it wants to know which measurement it
                    is, not which estimator. The card spells out SDNN. */}
                <Metric value={s.sdnn != null ? String(s.sdnn) : '—'} unit="HRV" />
              </>
            ) : null}
            {/* A wrist reading has no metrics, so the breathing bars need the
                divider that the metric block would otherwise have provided —
                without it the pace sits flush against the clock. */}
            {!live && s.config.kind === 'breath' ? (
              <View style={[styles.rule, { backgroundColor: p.border }]} />
            ) : null}
            {s.config.kind === 'breath' ? (
              <View style={{ marginLeft: 4 }}>
                <BreathBars pattern={s.pattern} startMs={s.breathStartMs} running color={p.accent} />
              </View>
            ) : null}
          </View>
        </BlurView>
      </Pressable>
    </Animated.View>
  );
}

function Dial({ frac, color, track }: { frac: number; color: string; track: string }) {
  const r = (DIAL - DIAL_SW) / 2;
  const c = 2 * Math.PI * r;
  return (
    <Svg width={DIAL} height={DIAL}>
      <Circle cx={DIAL / 2} cy={DIAL / 2} r={r} stroke={track} strokeWidth={DIAL_SW} fill="none" />
      <Circle
        cx={DIAL / 2} cy={DIAL / 2} r={r} stroke={color} strokeWidth={DIAL_SW} fill="none" strokeLinecap="round"
        strokeDasharray={`${c}`} strokeDashoffset={c * (1 - frac)} transform={`rotate(-90 ${DIAL / 2} ${DIAL / 2})`}
      />
    </Svg>
  );
}

function Metric({ value, unit }: { value: string; unit: string }) {
  const p = usePalette();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
      <Text style={{ color: p.text, fontFamily: fonts.numBold, fontSize: 15, fontVariant: ['tabular-nums'] }}>{value}</Text>
      <Text style={{ color: p.textDim, fontSize: 11 }}>{unit}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // zIndex 3: above the watch-sync and health-import pills, which sit at 2.
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 3 },
  pill: {
    borderRadius: 999, overflow: 'hidden', borderWidth: 1,
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 8,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 9, paddingHorizontal: 13,
    backgroundColor: Platform.OS === 'ios' ? 'rgba(6,6,9,0.82)' : '#0a0a0d',
  },
  time: { fontFamily: fonts.numBold, fontSize: 17, fontVariant: ['tabular-nums'] },
  rule: { width: 1, height: 16 },
});
