/**
 * HRV setup sheet — the entry point for a live 5-minute capture. Choose kind
 * (Unstructured vs Structured), a breathing pattern (4/4, 4/5, 4/6 recommended,
 * 5/5), and a signal source (Bluetooth strap or Apple Watch), then Start.
 */
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SheetControls, useSheets } from '../../components/Sheet';
import { Button, HelpDot, Segmented } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { useToast } from '../../components/Toast';
import { radius, usePalette } from '../../theme';
import { getState, useAppState } from '../../store/store';
import { getCurrentKey } from '../../store/nav';
import { health } from '../../lib/health';
import { DevicesScreen } from '../Devices';
import { HrvSession, type SessionConfig } from './Session';

const STYLES = [
  { val: '4/4', label: '4 / 4' },
  { val: '4/5', label: '4 / 5' },
  { val: '4/6', label: '4 / 6 · Recommended' },
  { val: '5/5', label: '5 / 5' },
];

const HELP = {
  main:
    'A 5 minute read of how your nervous system is balancing stress and recovery. Same time daily shows your trend.',
  kind:
    'Unstructured is a 2.5 minute reading that captures your current baseline while you rest and breathe naturally. Structured guides you through a slow, paced breathing pattern for 5 minutes. This trains your baroreflex and helps build stronger autonomic responses.',
  breath:
    'The two numbers are seconds to inhale then exhale. For most people 4 / 6 matches their resonant frequency, the breathing rate where the baroreflex (your body’s blood pressure regulator) swings in sync with each breath and HRV peaks. That makes it the most effective pattern to train.',
  period:
    'Tagging the time of day keeps like readings comparable. Morning readings taken right after waking are the most consistent baseline; evening readings show how the day wound down.',
  source:
    'Where the heartbeat signal comes from. A Bluetooth chest strap is the most accurate. Apple Watch uses an ECG you record on your watch during the reading, which syncs in afterward.',
};

export function HrvSetup({ controls }: { controls: SheetControls }) {
  const p = usePalette();
  const toast = useToast();
  const { openSheet } = useSheets();
  const [kind, setKind] = useState<'unstructured' | 'breath'>('breath');
  const [style, setStyle] = useState('4/6');
  const [source, setSource] = useState<'polar' | 'watch'>('polar');
  // Default the time-of-day from the clock: before 11am (and no morning reading
  // yet today) → Morning, after 7pm → Evening, else Other.
  const [period, setPeriod] = useState<'Morning' | 'Evening' | 'Other'>(() => {
    const h = new Date().getHours();
    if (h >= 19) return 'Evening';
    if (h < 11) {
      const day = getState().days[getCurrentKey()];
      const hasMorning = (day?.readings || []).some(
        (r) => (r.type === 'hrv' || r.type === 'breathHrv') && r.period === 'Morning',
      );
      if (!hasMorning) return 'Morning';
    }
    return 'Other';
  });
  // Reactive so the "Paired: …" subtitle updates the moment a strap is saved
  // from the pairing sheet stacked on top of this one.
  const savedName = useAppState().settings.lastBleDeviceName;

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
    if (source === 'watch' && !health().available) {
      toast('Apple Watch readings need an iOS build');
      return;
    }
    const config: SessionConfig = { kind, source, period, style: kind === 'breath' ? style : undefined };
    openSheet((c) => <HrvSession config={config} controls={c} />, { hideClose: true });
    controls.close();
  };

  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 6 }}>Capture an HRV reading</Text>
      <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 20, marginBottom: 18 }}>{HELP.main}</Text>

      <Label text="How will you breathe?" help={HELP.kind} />
      <Segmented options={[{ val: 'unstructured', label: 'Unstructured' }, { val: 'breath', label: 'Structured' }]} value={kind} onChange={setKind} />

      <Label text="When is this reading?" help={HELP.period} top />
      <Segmented options={[{ val: 'Morning', label: 'Morning' }, { val: 'Evening', label: 'Evening' }, { val: 'Other', label: 'Other' }]} value={period} onChange={setPeriod} />

      {kind === 'breath' ? (
        <>
          <Label text="Breathing pattern" help={HELP.breath} top />
          <View style={{ gap: 8 }}>
            {STYLES.map((s) => {
              const active = s.val === style;
              return (
                <Pressable key={s.val} onPress={() => setStyle(s.val)} style={{ flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: radius.control, borderWidth: 1, borderColor: active ? p.accent : p.border, backgroundColor: active ? p.accentSoft : p.surface2 }}>
                  <Text style={{ flex: 1, color: active ? p.accent : p.text, fontWeight: active ? '700' : '500' }}>{s.label}</Text>
                  {active ? <Icon name="check" size={18} color={p.accent} /> : null}
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      <Label text="Signal source" help={HELP.source} top />
      <View style={{ gap: 8 }}>
        <SourceOption icon="bluetooth" title="Bluetooth device" sub={savedName ? `Paired: ${savedName}` : 'Tap to pair a device'} active={source === 'polar'} onPress={pickBluetooth} />
        <SourceOption icon="watch" title="Apple Watch" sub="Record an ECG on your watch during the reading, it syncs in after" active={source === 'watch'} onPress={() => setSource('watch')} />
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

function SourceOption({ icon, title, sub, active, onPress }: { icon: 'bluetooth' | 'watch'; title: string; sub: string; active: boolean; onPress: () => void }) {
  const p = usePalette();
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.control, borderWidth: 1, borderColor: active ? p.accent : p.border, backgroundColor: active ? p.accentSoft : p.surface2 }}>
      <Icon name={icon} size={22} color={active ? p.accent : p.textDim} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: active ? p.accent : p.text, fontWeight: '700' }}>{title}</Text>
        <Text style={{ color: p.textDim, fontSize: 12 }}>{sub}</Text>
      </View>
      {active ? <Icon name="check" size={18} color={p.accent} /> : null}
    </Pressable>
  );
}
