/**
 * HRV setup sheet — the entry point for a live 5-minute capture. Purpose-first:
 * pick what the reading is FOR (Training, which paces your breath at resonance,
 * or Baseline, which reads where you sit right now), confirm the signal source
 * on one line, and Start. The time-of-day tag is stamped automatically at Start.
 *
 * There is no breathing-pattern picker: training readings are always 4/6
 * (resonant-frequency) pacing. Offering box breathing or 4/7/8 invited choices
 * that flatten RSA and broke day-to-day comparability, which is the whole point
 * of a daily measure. Legacy readings keep whatever style they were saved with.
 */
import React, { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import Animated, { Easing, interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SheetControls, useSheets } from '../../components/Sheet';
import { Button } from '../../components/ui';
import { Icon, type IconName } from '../../components/Icon';
import { useToast } from '../../components/Toast';
import { radius, usePalette } from '../../theme';
import { getState, save, useStore } from '../../store/store';
import { todayKey } from '../../lib/dates';
import { health } from '../../lib/health';
import { defaultPeriod } from '../../lib/period';
import { ppg } from '../../lib/ppg/camera';
import { BREATH_STYLE, HrvSession, type SessionConfig } from './Session';
import { CameraSetup } from './CameraSetup';
import { WatchPrep } from './WatchPrep';
import { HealthRrImportSheet } from './HealthImport';
import { SOURCE_META, SourcePicker, sourceSub, type Source } from './SourcePicker';

/** The sheet opener, as `useSheets()` hands it out. */
type OpenSheet = ReturnType<typeof useSheets>['openSheet'];

// The sheet's ✕ pill floats top-right; inset the title + subtitle so neither
// runs underneath it (was clipped on narrower screens).
const CLOSE_CLEARANCE = 58;

export type Kind = 'unstructured' | 'breath';

/** The two things a reading can be for. `breath` is the daily default. */
const MODES: { val: Kind; icon: IconName; title: string; desc: string; daily?: boolean }[] = [
  {
    val: 'breath', icon: 'wind', title: 'Training HRV', daily: true,
    desc: 'We pace your breath so heart rate and breathing sync. The most sensitive, most repeatable daily measure, and the pacing itself helps train your autonomic system.',
  },
  {
    val: 'unstructured', icon: 'heartPulse', title: 'Baseline HRV',
    desc: 'Breathe however you normally do. Best for capturing where your nervous system actually sits right now.',
  },
];

/**
 * Why a source can't be used right now, as the sentence to toast, or null when
 * it can. Bluetooth's answer is deliberately absent: an unpaired strap is not a
 * refusal, it's a detour into the picker, which every caller handles itself.
 */
export function sourceBlocker(source: Source): string | null {
  if (source === 'watch' && (Platform.OS !== 'ios' || !health().available)) {
    return 'Apple Watch readings need an iOS build';
  }
  if (source === 'camera' && !ppg().available) return 'Camera readings need a device build';
  return null;
}

/**
 * Open the capture card a config calls for, and nothing else — no validation,
 * no state. The watch and the camera each get a prep card that opens the
 * session itself once it's ready; everything else opens the session directly.
 *
 * Shared by the HRV setup sheet and the welcome wizard's first-reading step so
 * the two can never drift into opening different cards for the same choice.
 */
export function openCapture(config: SessionConfig, openSheet: OpenSheet): void {
  // Watch readings are taken by the Mindfulness app on the wrist, so a prep
  // card walks through getting it ready first; its Start opens the session
  // already running.
  if (config.source === 'watch') {
    openSheet((c) => <WatchPrep config={config} controls={c} />);
    return;
  }
  // Camera readings get a setup card first (choose the module shape, mark the
  // flash, wait for the finger) — it opens the session card itself once the
  // pulse locks. `grow` lets that card center the module stage vertically and
  // bottom-pin the placement squircle above the footer.
  if (config.source === 'camera') {
    openSheet((c) => <CameraSetup config={config} controls={c} />, { grow: true });
    return;
  }
  openSheet((c) => <HrvSession config={config} controls={c} />, { hideClose: true, grow: true });
}

/** Default signal source: the paired strap when there is one (it's the most
 *  accurate option), else the user's last deliberate pick when it's still
 *  usable, else the camera (always on hand). Bluetooth is never defaulted
 *  while unpaired — Start would just bounce off the pairing sheet. */
export function defaultSource(): Source {
  const s = getState().settings;
  if (s.lastBleDeviceId) return 'polar';
  const last = s.lastHrvSource;
  if (last === 'watch' && Platform.OS === 'ios' && health().available) return 'watch';
  if (last === 'camera' && ppg().available) return 'camera';
  return ppg().available ? 'camera' : 'polar';
}

/** Time-of-day tag for a reading of this kind, stamped silently at Start —
 *  there's no picker in the sheet anymore (shared rules in src/lib/period.ts;
 *  training and baseline each get their own morning/evening; extras
 *  fall through to Other). */
export const defaultPeriodFor = (kind: Kind) => defaultPeriod(kind === 'breath' ? 'breathHrv' : 'hrv', todayKey());

export function HrvSetup({ controls }: { controls: SheetControls }) {
  const p = usePalette();
  const toast = useToast();
  const { openSheet } = useSheets();
  const [kind, setKind] = useState<Kind>('breath');
  const [source, setSource] = useState<Source>(defaultSource);
  // Reactive so the summary row updates the moment a strap is saved from the
  // source picker stacked on top of this one.
  const savedName = useStore((s) => s.state.settings.lastBleDeviceName);

  const changeSource = () => openSheet((c) => <SourcePicker value={source} onPick={setSource} controls={c} />);

  const start = () => {
    if (source === 'polar' && !getState().settings.lastBleDeviceId) {
      changeSource();
      return;
    }
    const blocked = sourceBlocker(source);
    if (blocked) { toast(blocked); return; }
    // Remember the pick so the next capture defaults to it.
    if (getState().settings.lastHrvSource !== source) { getState().settings.lastHrvSource = source; save(); }
    const config: SessionConfig = { kind, source, period: defaultPeriodFor(kind), style: kind === 'breath' ? BREATH_STYLE : undefined };
    openCapture(config, openSheet);
    // The watch and camera prep cards open over this sheet on purpose, so their
    // ✕ backs out here; only a session that started outright replaces it.
    if (source !== 'watch' && source !== 'camera') controls.close();
  };

  const srcMeta = SOURCE_META[source];

  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 6, paddingRight: CLOSE_CLEARANCE }}>Capture an HRV reading</Text>
      <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 20, paddingRight: CLOSE_CLEARANCE, marginBottom: 18 }}>Five minutes, same time each day. Choose what this reading is for.</Text>

      <View style={{ gap: 10 }}>
        {MODES.map((m) => (
          <ModeCard key={m.val} mode={m} active={kind === m.val} onPress={() => setKind(m.val)} />
        ))}
      </View>

      <Text style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.6, color: p.textDim, fontWeight: '700', marginTop: 22, marginBottom: 10 }}>Measuring with</Text>
      <Pressable
        onPress={changeSource}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.control, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface2 }}
      >
        <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: p.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={srcMeta.icon} size={19} color={p.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: p.text, fontWeight: '700' }}>{srcMeta.title}</Text>
          <Text style={{ color: p.textDim, fontSize: 12, marginTop: 3 }}>{sourceSub(source, savedName)}</Text>
        </View>
        <Text style={{ color: p.accent, fontSize: 13, fontWeight: '700' }}>Change</Text>
      </Pressable>

      <View style={{ height: 20 }} />
      <Button title="Start reading" variant="primary" onPress={start} />
      {/* Recovery path: a watch reading already sitting in Apple Health (taken
          without a live session, or one that never synced in) can be imported
          and evaluated after the fact. */}
      {Platform.OS === 'ios' && health().available ? (
        <>
          <View style={{ height: 10 }} />
          <Button
            title="Import reading from Apple Health"
            variant="ghost"
            onPress={() => openSheet(() => <HealthRrImportSheet kind={kind} />)}
          />
        </>
      ) : null}
      <View style={{ height: 20 }} />
    </View>
  );
}

/** One purpose card: icon tile, title (+ "Daily" tag on the recommended one),
 *  and a plain-language description of what the reading is for.
 *
 *  The selected card RECEDES rather than lighting up red: a translucent black
 *  overlay sinks it below the sheet surface and the accent moves to the border,
 *  icon, title and check. A red wash over the whole card (accentSoft) muddied
 *  the body copy — the description read as tinted rather than the card as
 *  chosen.
 *
 *  Selection eases in rather than snapping: the darkening is an overlay whose
 *  opacity animates, and the border color interpolates between two opaque greys/
 *  accent. Do NOT interpolate the card's own backgroundColor against a
 *  translucent color — one is opaque and the other has alpha, so the midpoint
 *  reads as a flash on every tap. Everything else (icon, title, radio) switches
 *  instantly; animating those too made the whole card shimmer. Reanimated
 *  because color can't use the native driver. */
const MODE_ANIM = { duration: 180, easing: Easing.out(Easing.quad) };
/** Sinks `surface2` (#242427) to roughly #1e0705 — near-black with the accent
 *  hue still in it. Not a tint of the bright accent (that washed the card) and
 *  not neutral grey. */
const MODE_SELECTED_SHADE = 'rgba(30,6,4,0.94)';

function ModeCard({ mode, active, onPress }: { mode: (typeof MODES)[number]; active: boolean; onPress: () => void }) {
  const p = usePalette();
  const t = useSharedValue(active ? 1 : 0);
  React.useEffect(() => { t.value = withTiming(active ? 1 : 0, MODE_ANIM); }, [active, t]);

  const borderStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(t.value, [0, 1], [p.border, p.accent]),
  }));
  const tintStyle = useAnimatedStyle(() => ({ opacity: t.value }));

  return (
    <Pressable onPress={onPress}>
      <Animated.View
        style={[{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: radius.control, borderWidth: 1, backgroundColor: p.surface2, overflow: 'hidden' }, borderStyle]}
      >
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: MODE_SELECTED_SHADE }, tintStyle]} />
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: active ? p.accentSoft : p.sunk, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={mode.icon} size={21} color={active ? p.accent : p.textDim} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ color: active ? p.accent : p.text, fontWeight: '700', fontSize: 15 }}>{mode.title}</Text>
            {mode.daily ? (
              <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, borderWidth: 1, borderColor: active ? p.accent : '#47474e' }}>
                <Text style={{ color: active ? p.accent : p.textDim, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 }}>Daily</Text>
              </View>
            ) : null}
          </View>
          <Text style={{ color: p.textDim, fontSize: 12.5, lineHeight: 17, marginTop: 5 }}>{mode.desc}</Text>
        </View>
        <View style={{ marginTop: 2 }}>
          {active ? (
            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: p.accent, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="check" size={13} color="#fff" strokeWidth={3.2} />
            </View>
          ) : (
            <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#4a4a52' }} />
          )}
        </View>
      </Animated.View>
    </Pressable>
  );
}
