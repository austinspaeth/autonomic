/** Health settings (Apple Health on iOS, Health Connect on Android):
 *  permission and a bedtime-confirmation flow that reads last night's sleep +
 *  overnight HR and lets you review/edit it before it lands in the journal. */
import React, { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Button } from '../components/ui';
import { SheetControls, SheetFooter, useSheets } from '../components/Sheet';
import { TimeField } from '../components/Field';
import { useToast } from '../components/Toast';
import { usePalette } from '../theme';
import { health, healthAppName, SleepImport } from '../lib/health';
import { ensureDay, getState, save } from '../store/store';
import { getCurrentKey } from '../store/nav';
import { fmtTime12 } from '../lib/dates';

export function HealthScreen() {
  const p = usePalette();
  const toast = useToast();
  const { openSheet } = useSheets();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const api = health();

  if (!api.available) {
    return (
      <View>
        <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 8 }}>{healthAppName()}</Text>
        <Text style={{ color: p.textDim, fontSize: 15, lineHeight: 20 }}>
          {`${healthAppName()} needs a full app build. On this platform it is disabled.`}
        </Text>
      </View>
    );
  }

  const connect = async () => {
    setBusy(true);
    const ok = await api.requestAuth();
    setAuthed(ok);
    setBusy(false);
    toast(ok ? 'Health connected' : 'Permission denied');
    if (ok) { getState().settings.healthEnabled = true; save(); }
  };

  const importSleep = async () => {
    setBusy(true);
    try {
      const dk = getCurrentKey();
      const s = await api.readSleep(dk);
      setBusy(false);
      if (!s) { toast('No sleep found for last night'); return; }
      openSheet((c) => <SleepConfirmSheet dk={dk} data={s} controls={c} onDone={() => toast('Sleep saved')} />);
    } catch {
      setBusy(false);
      toast('Could not read sleep');
    }
  };

  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 6 }}>{healthAppName()}</Text>
      <Text style={{ color: p.textDim, fontSize: 14, marginBottom: 16, lineHeight: 19 }}>
        {"Grant permission, then import readings one at a time from the reading picker (tap a reading type to choose a sample from Health, or enter it manually). Adding an activity offers the day's workouts the same way. New readings you log are also written back to Health automatically. Existing entries are never overwritten."}
      </Text>
      <Button title={authed ? 'Health connected' : `Connect ${healthAppName()}`} variant="primary" onPress={connect} />
      <View style={{ height: 20 }} />
      <Text style={{ color: p.textDim, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Troubleshooting</Text>
      <Button title="Import sleep from Health" onPress={importSleep} />
      {busy ? <View style={{ alignItems: 'center', marginTop: 14 }}><ActivityIndicator color={p.accent} /></View> : null}
      <View style={{ height: 24 }} />
    </View>
  );
}

/** Review/edit the night Health reported before writing it into the day.
 *  Also used by the Journal sleep widget's "Check for updates" flow. */
export function SleepConfirmSheet({ dk, data, controls, onDone }: {
  dk: string; data: SleepImport; controls: SheetControls; onDone: () => void;
}) {
  const p = usePalette();
  const [bed, setBed] = useState(data.bed);
  const [wake, setWake] = useState(data.wake);
  const existing = getState().days[dk]?.sleep;
  const hadSleep = !!(existing && (existing.bed || existing.wake));
  const hours = Math.floor(data.minutesAsleep / 60);
  const mins = data.minutesAsleep % 60;

  const confirm = () => {
    const d = ensureDay(dk);
    d.sleep = {
      ...d.sleep,
      bed,
      wake,
      quality: data.interrupted ? 'interrupted' : (d.sleep?.quality || 'good'),
      ...(data.hrLow != null ? { hrLow: data.hrLow } : {}),
      ...(data.hrHigh != null ? { hrHigh: data.hrHigh } : {}),
    };
    // Stages describe the imported night; drop any from a previous import
    // rather than mixing them with the new times.
    if (data.stages) d.sleep.stages = data.stages;
    else delete d.sleep.stages;
    save();
    controls.closeAll();
    onDone();
  };

  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 6 }}>Confirm sleep</Text>
      <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 20, marginBottom: 16 }}>
        {`${healthAppName()} shows you were asleep from ${fmtTime12(data.bed)} to ${fmtTime12(data.wake)}`}
        {data.minutesAsleep > 0 ? ` (${hours}h ${mins}m` : ''}
        {data.minutesAsleep > 0 ? (data.interrupted ? ', interrupted).' : ').') : '.'}
        {' Adjust the times if that’s not right.'}
      </Text>
      <TimeField label="Bed (last night)" value={bed} onChange={setBed} />
      <TimeField label="Woke (this morning)" value={wake} onChange={setWake} />
      {(data.hrLow != null || data.hrHigh != null) ? (
        <Text style={{ color: p.textDim, fontSize: 14, marginTop: 6 }}>
          {`Overnight heart rate ${data.hrLow ?? '–'}–${data.hrHigh ?? '–'} bpm`}
        </Text>
      ) : null}
      {hadSleep ? (
        <Text style={{ color: p.accent, fontSize: 13, marginTop: 10 }}>
          This will replace the sleep times already logged for this day.
        </Text>
      ) : null}
      <SheetFooter>
        <Button title="Use this" variant="primary" onPress={confirm} />
      </SheetFooter>
    </View>
  );
}
