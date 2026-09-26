/**
 * HRV setup sheet — the entry point for a live 5-minute capture. It is opened
 * for ONE kind of reading and says what that kind is for and when to take it:
 * Baseline (breathe normally; the day's first one is its snapshot and sets the
 * score and pacing budget) or Training (paced breathing, any time). The two used
 * to share this sheet behind a picker, and people could not tell which one they
 * were meant to take; each entry point now names its own. Confirm the signal
 * source on one line, and Start. The time-of-day tag is stamped at Start.
 *
 * There is no breathing-pattern picker: training readings are always 4/6
 * (resonant-frequency) pacing. Offering box breathing or 4/7/8 invited choices
 * that flatten RSA and broke day-to-day comparability, which is the whole point
 * of a daily measure. Legacy readings keep whatever style they were saved with.
 */
import React, { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { SheetControls, useSheets } from '../../components/Sheet';
import { Button } from '../../components/ui';
import { Icon, type IconName } from '../../components/Icon';
import { useToast } from '../../components/Toast';
import { radius, usePalette } from '../../theme';
import { getState, save, useStore } from '../../store/store';
import { todayKey } from '../../lib/dates';
import { hasBaselineReadingOn } from '../../lib/hrvQuality';
import { health } from '../../lib/health';
import { defaultPeriod } from '../../lib/period';
import { ppg } from '../../lib/ppg/camera';
import { BREATH_STYLE, HrvSession, type SessionConfig } from './Session';
import { CameraSetup } from './CameraSetup';
import { DevicesScreen } from '../Devices';
import { GarminPrep } from './GarminPrep';
import { WatchPrep } from './WatchPrep';
import { HealthRrImportSheet } from './HealthImport';
import { garminDevices } from '../../lib/garmin/receiver';
import { SOURCE_META, SourcePicker, sourceSub, type Source } from './SourcePicker';

/** The sheet opener, as `useSheets()` hands it out. */
type OpenSheet = ReturnType<typeof useSheets>['openSheet'];

// The sheet's ✕ pill floats top-right; inset the title + subtitle so neither
// runs underneath it (was clipped on narrower screens).
const CLOSE_CLEARANCE = 58;

export type Kind = 'unstructured' | 'breath';

/**
 * What each kind is for and when to take it, in the few words the setup sheet,
 * the Add reading list and the morning card all share. Two entry points with
 * two descriptions of the same reading would be the confusion this split exists
 * to end.
 */
export const KIND_COPY: Record<Kind, { title: string; row: string; why: string; chips: { icon: IconName; label: string }[] }> = {
  unstructured: {
    title: 'Baseline HRV reading',
    row: 'Breathe normally. Your first one each day sets your score',
    why: 'Lie still and breathe normally for five minutes, ideally soon after you wake. Your first one each day sets your score and pacing budget. Take one any time paced breathing feels strained.',
    chips: [{ icon: 'wind', label: 'Breathe normally' }, { icon: 'clock', label: 'Morning' }],
  },
  breath: {
    title: 'Training HRV reading',
    row: 'Paced breathing practice, any time of day',
    why: 'Five minutes of paced breathing. It exercises your autonomic system and helps calm your sympathetic/fight-or-flight response. Best in the morning after your baseline. Like any workout, overdoing it can cause strain.',
    chips: [{ icon: 'wind', label: '4 / 6 Breathing Pace' }, { icon: 'clock', label: 'Any time' }],
  },
};

/** When the morning card stops asking. Past this the day is well underway and
 *  a reading taken now is not the snapshot the card is asking for. */
export const MORNING_CUTOFF_HOUR = 13;

/**
 * The kind an entry point that does not name one should open: a baseline while
 * the day has none and it is still morning, otherwise training. Used by the
 * widget deep link and the pacing Todo, which only know "take a reading".
 */
export function suggestedKind(now: Date = new Date()): Kind {
  const today = getState().days[todayKey()];
  return !hasBaselineReadingOn(today) && now.getHours() < MORNING_CUTOFF_HOUR ? 'unstructured' : 'breath';
}

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
  // Garmin never streams to the phone — the whole series arrives in one message
  // at the end — so there is no live session card to open. A prep card that
  // explains what to do on the wrist, and then waits, is the honest UI.
  if (config.source === 'garmin') {
    openSheet((c) => <GarminPrep config={config} controls={c} />);
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
  const last = s.lastHrvSource;
  // Garmin outranks a remembered strap: linking a watch is a deliberate act
  // and it is the thing the user just set up. Guarded on a device actually
  // being linked, so an old preference cannot select a source that is not there.
  if (last === 'garmin' && garminDevices().length) return 'garmin';
  if (s.lastBleDeviceId) return 'polar';
  if (last === 'watch' && Platform.OS === 'ios' && health().available) return 'watch';
  if (last === 'camera' && ppg().available) return 'camera';
  return ppg().available ? 'camera' : 'polar';
}

/** Time-of-day tag for a reading of this kind, stamped silently at Start —
 *  there's no picker in the sheet anymore (shared rules in src/lib/period.ts;
 *  training and baseline each get their own morning/evening; extras
 *  fall through to Other). */
export const defaultPeriodFor = (kind: Kind) => defaultPeriod(kind === 'breath' ? 'breathHrv' : 'hrv', todayKey());

export function HrvSetup({ kind, controls }: { kind: Kind; controls: SheetControls }) {
  const p = usePalette();
  const toast = useToast();
  const { openSheet } = useSheets();
  const copy = KIND_COPY[kind];
  const [source, setSource] = useState<Source>(defaultSource);
  // Reactive so the summary row updates the moment a strap is saved from the
  // source picker stacked on top of this one.
  const savedName = useStore((s) => s.state.settings.lastBleDeviceName);

  const changeSource = () => openSheet((c) => <SourcePicker value={source} onPick={setSource} controls={c} />);

  const start = () => {
    // Straight to the strap scanner rather than the picker: the picker no longer
    // scans, so detouring through it would only add a tap before the same card.
    if (source === 'polar' && !getState().settings.lastBleDeviceId) {
      openSheet((c) => <DevicesScreen controls={c} />);
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
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 6, paddingRight: CLOSE_CLEARANCE }}>{copy.title}</Text>
      <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 20, paddingRight: CLOSE_CLEARANCE, marginBottom: 16 }}>{copy.why}</Text>
      <KindChips kind={kind} />

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

/** The two how-to chips a kind carries (the morning card's design): sunk
 *  tiles, icon and one short instruction each. */
export function KindChips({ kind }: { kind: Kind }) {
  const p = usePalette();
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {KIND_COPY[kind].chips.map((c) => (
        <View key={c.label} style={{ flexGrow: 1, flexShrink: 1, flexBasis: 'auto', flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: p.sunk, borderRadius: 13, paddingVertical: 15, paddingHorizontal: 12 }}>
          <Icon name={c.icon} size={18} color={p.textDim} strokeWidth={1.8} />
          <Text numberOfLines={1} style={{ color: p.textDim, fontSize: 13, fontWeight: '600', flexShrink: 1 }}>{c.label}</Text>
        </View>
      ))}
    </View>
  );
}
