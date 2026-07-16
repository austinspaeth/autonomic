/**
 * HRV setup sheet — the entry point for a live 5-minute capture. Choose kind
 * (Unstructured vs Structured), a breathing pattern (4/6 default; the row
 * opens a stacked picker sheet with box breathing and 4/7/8), and a signal
 * source (Bluetooth strap, Apple Watch, or the phone camera), then Start.
 * The time-of-day tag is stamped automatically at Start.
 */
import React, { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { SheetControls, useSheets } from '../../components/Sheet';
import { Button, HelpDot, Segmented } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { useToast } from '../../components/Toast';
import { radius, usePalette } from '../../theme';
import { getState, save, useStore } from '../../store/store';
import { todayKey } from '../../lib/dates';
import { health } from '../../lib/health';
import { defaultPeriod } from '../../lib/period';
import { ppg } from '../../lib/ppg/camera';
import { DevicesScreen } from '../Devices';
import { BREATH_STYLES, HrvSession, type SessionConfig } from './Session';
import { CameraSetup } from './CameraSetup';
import { WatchPrep } from './WatchPrep';

const HELP = {
  main:
    'A 5 minute read (shorter by phone camera) of how your nervous system is balancing stress and recovery. Same time daily shows your trend.',
  kind:
    'Both kinds run 5 minutes (shorter with the phone camera). Unstructured captures your current baseline while you rest and breathe naturally. Structured guides you through a paced breathing pattern, which trains your baroreflex and helps build stronger autonomic responses.',
  techniques:
    'The numbers are the seconds to inhale, hold, and exhale in each cycle.\n\n' +
    '4 / 6 breathing: in 4s, out 6s. For most people this matches their resonant frequency, the rate where the baroreflex (your body’s blood pressure regulator) swings in sync with each breath and HRV peaks. The longer exhale makes it the most effective pattern to train.\n\n' +
    'Box breathing: in 4s, hold 4s, out 4s, hold 4s. A steady, even square rhythm that is easy to hold and good for calm focus.\n\n' +
    '4 / 7 / 8 breathing: in 4s, hold 7s, out 8s. The long exhale leans hard into the vagal brake, making it the most deeply calming of the three.',
  source: Platform.OS === 'ios'
    ? 'Where the heartbeat signal comes from. A Bluetooth chest strap is the most accurate. Apple Watch uses a reading you take on your watch during the session, a Mindfulness breathing session or an ECG, which syncs in afterward. Phone camera reads your pulse through your fingertip over the rear camera and flash — no device needed, but it is the least accurate option.'
    : 'Where the heartbeat signal comes from. A Bluetooth chest strap is the most accurate. Phone camera reads your pulse through your fingertip over the rear camera and flash — no device needed, but it is the least accurate option.',
};

// The sheet's ✕ pill floats top-right; inset the title + subtitle so neither
// runs underneath it (was clipped on narrower screens).
const CLOSE_CLEARANCE = 58;

type Kind = 'unstructured' | 'breath';
type Source = 'polar' | 'watch' | 'camera';

/** Default signal source: the paired strap when there is one (it's the most
 *  accurate option), else the user's last deliberate pick when it's still
 *  usable, else the camera (always on hand). Bluetooth is never defaulted
 *  while unpaired — Start would just bounce off "Pair a strap first". */
function defaultSource(): Source {
  const s = getState().settings;
  if (s.lastBleDeviceId) return 'polar';
  const last = s.lastHrvSource;
  if (last === 'watch' && Platform.OS === 'ios' && health().available) return 'watch';
  if (last === 'camera' && ppg().available) return 'camera';
  return ppg().available ? 'camera' : 'polar';
}

/** Time-of-day tag for a reading of this kind, stamped silently at Start —
 *  there's no picker in the sheet anymore (shared rules in src/lib/period.ts;
 *  structured and unstructured each get their own morning/evening; extras
 *  fall through to Other). */
const defaultPeriodFor = (kind: Kind) => defaultPeriod(kind === 'breath' ? 'breathHrv' : 'hrv', todayKey());

export function HrvSetup({ controls }: { controls: SheetControls }) {
  const p = usePalette();
  const toast = useToast();
  const { openSheet } = useSheets();
  const [kind, setKind] = useState<Kind>('breath');
  const [style, setStyle] = useState('4/6');
  const [source, setSource] = useState<Source>(defaultSource);
  // Reactive so the "Paired: …" subtitle updates the moment a strap is saved
  // from the pairing sheet stacked on top of this one.
  const savedName = useStore((s) => s.state.settings.lastBleDeviceName);

  // With no strap saved yet, choosing Bluetooth opens the pairing sheet right
  // here; saving a device closes it and drops back onto this setup sheet.
  const pickBluetooth = () => {
    setSource('polar');
    if (!getState().settings.lastBleDeviceId) openSheet((c) => <DevicesScreen controls={c} />);
  };

  const start = () => {
    if (source === 'polar' && !getState().settings.lastBleDeviceId) {
      toast('Pair a strap first in Devices');
      return;
    }
    if (source === 'watch' && (Platform.OS !== 'ios' || !health().available)) {
      toast('Apple Watch readings need an iOS build');
      return;
    }
    if (source === 'camera' && !ppg().available) {
      toast('Camera readings need a device build');
      return;
    }
    // Remember the pick so the next capture defaults to it.
    if (getState().settings.lastHrvSource !== source) { getState().settings.lastHrvSource = source; save(); }
    const config: SessionConfig = { kind, source, period: defaultPeriodFor(kind), style: kind === 'breath' ? style : undefined };
    // Watch readings are taken by the Mindfulness app on the wrist, so a prep
    // card walks through getting it ready first; its Start opens the session
    // already running. This sheet stays underneath so ✕ backs out to it.
    if (source === 'watch') {
      openSheet((c) => <WatchPrep config={config} controls={c} />);
      return;
    }
    // Camera readings get a setup card first (choose the module shape, mark
    // the flash, wait for the finger) — it opens the session card itself once
    // the pulse locks. Like the watch prep, this sheet stays underneath so
    // its ✕ backs out here.
    if (source === 'camera') {
      // `grow` lets the card center the module stage vertically and bottom-pin
      // the placement squircle above the footer.
      openSheet((c) => <CameraSetup config={config} controls={c} />, { grow: true });
      return;
    }
    openSheet((c) => <HrvSession config={config} controls={c} />, { hideClose: true });
    controls.close();
  };

  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 6, paddingRight: CLOSE_CLEARANCE }}>Capture an HRV reading</Text>
      <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 20, marginBottom: 18, paddingRight: CLOSE_CLEARANCE }}>{HELP.main}</Text>

      <Label text="Breathing type" help={HELP.kind} />
      <Segmented options={[{ val: 'unstructured', label: 'Unstructured' }, { val: 'breath', label: 'Structured' }]} value={kind} onChange={setKind} />

      {kind === 'breath' ? (
        <>
          <Label text="Breathing pattern" help={HELP.techniques} top />
          <PatternRow
            pattern={BREATH_STYLES.find((s) => s.val === style) || BREATH_STYLES[0]}
            trailing="chevron"
            onPress={() => openSheet((c) => <BreathPatternSheet value={style} onPick={(v) => { setStyle(v); c.close(); }} />)}
          />
        </>
      ) : null}

      <Label text="Signal source" help={HELP.source} top />
      <View style={{ gap: 8 }}>
        <SourceOption icon="bluetooth" title="Bluetooth device" badge="Best accuracy" sub={savedName ? `Paired: ${savedName}` : 'Tap to pair a device'} active={source === 'polar'} onPress={pickBluetooth} />
        {Platform.OS === 'ios' ? (
          <SourceOption icon="watch" title="Apple Watch" badge="High accuracy" sub="Breathe or ECG on the watch, syncs in after" active={source === 'watch'} onPress={() => setSource('watch')} />
        ) : null}
        <SourceOption icon="camera" title="Phone camera" badge="Lower accuracy" sub="No device needed · quick fingertip reading" active={source === 'camera'} onPress={() => setSource('camera')} />
      </View>

      <View style={{ height: 20 }} />
      <Button title="Start reading" variant="primary" onPress={start} />
      <View style={{ height: 20 }} />
    </View>
  );
}

function Label({ text, help, top }: { text: string; help?: string; top?: boolean }) {
  const p = usePalette();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: top ? 22 : 0, marginBottom: 12 }}>
      <Text style={{ fontSize: 15, textTransform: 'uppercase', letterSpacing: 0.6, color: p.textDim, fontWeight: '700' }}>{text}</Text>
      {help ? <HelpDot title={text} text={help} /> : null}
    </View>
  );
}

/** One breathing-pattern card. On the setup sheet it's the collapsed picker
 *  button (trailing chevron); inside BreathPatternSheet it's a selectable
 *  option (accent tint + check when active). */
function PatternRow({ pattern, active, trailing, onPress }: { pattern: (typeof BREATH_STYLES)[number]; active?: boolean; trailing: 'chevron' | 'check'; onPress: () => void }) {
  const p = usePalette();
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.control, borderWidth: 1, borderColor: active ? p.accent : p.border, backgroundColor: active ? p.accentSoft : p.surface2 }}>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ color: active ? p.accent : p.text, fontWeight: '700' }}>{pattern.title}</Text>
          {pattern.badge ? (
            <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, borderWidth: 1, borderColor: active ? p.accent : '#47474e' }}>
              <Text style={{ color: active ? p.accent : p.textDim, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 }}>{pattern.badge}</Text>
            </View>
          ) : null}
        </View>
        <Text style={{ color: p.textDim, fontSize: 12, lineHeight: 17, marginTop: 5 }}>{pattern.sub}</Text>
      </View>
      {trailing === 'chevron' ? (
        <Icon name="chevronRight" size={18} color={p.textDim} />
      ) : active ? (
        <Icon name="check" size={18} color={p.accent} />
      ) : null}
    </Pressable>
  );
}

/** Stacked sheet listing every paced-breathing pattern; picking one reports
 *  back to the setup sheet and closes. */
function BreathPatternSheet({ value, onPick }: { value: string; onPick: (val: string) => void }) {
  const p = usePalette();
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6, paddingRight: CLOSE_CLEARANCE }}>
        <Text style={{ fontSize: 21, fontWeight: '700', color: p.text }}>Breathing pattern</Text>
        <HelpDot title="Breathing techniques" text={HELP.techniques} />
      </View>
      <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 20, marginBottom: 18, paddingRight: CLOSE_CLEARANCE }}>Choose the breathing pattern (seconds to inhale, hold and exhale) for your structured breathing.</Text>
      <View style={{ gap: 8 }}>
        {BREATH_STYLES.map((s) => (
          <PatternRow key={s.val} pattern={s} active={s.val === value} trailing="check" onPress={() => onPick(s.val)} />
        ))}
      </View>
      <View style={{ height: 8 }} />
    </View>
  );
}

function SourceOption({ icon, title, badge, sub, active, onPress }: { icon: 'bluetooth' | 'watch' | 'camera'; title: string; badge: string; sub: string; active: boolean; onPress: () => void }) {
  const p = usePalette();
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.control, borderWidth: 1, borderColor: active ? p.accent : p.border, backgroundColor: active ? p.accentSoft : p.surface2 }}>
      <Icon name={icon} size={22} color={active ? p.accent : p.textDim} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ color: active ? p.accent : p.text, fontWeight: '700' }}>{title}</Text>
          {/* Unselected rows wear a slightly lighter grey pill border so the
              accuracy tag stays legible without competing with the selection. */}
          <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, borderWidth: 1, borderColor: active ? p.accent : '#47474e' }}>
            <Text style={{ color: active ? p.accent : p.textDim, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 }}>{badge}</Text>
          </View>
        </View>
        <Text style={{ color: p.textDim, fontSize: 12, lineHeight: 17, marginTop: 5 }}>{sub}</Text>
      </View>
      {active ? <Icon name="check" size={18} color={p.accent} /> : null}
    </Pressable>
  );
}
