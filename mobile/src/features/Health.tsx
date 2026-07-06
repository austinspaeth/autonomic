/** Apple Health settings: permission, "Sync today from Health", and a
 *  bedtime-confirmation flow that reads last night's sleep + overnight HR and
 *  lets you review/edit it before it lands in the journal. */
import React, { useState } from 'react';
import { ActivityIndicator, Platform, Text, View } from 'react-native';
import { Button } from '../components/ui';
import { SheetControls, SheetFooter, useSheets } from '../components/Sheet';
import { TimeField } from '../components/Field';
import { useToast } from '../components/Toast';
import { usePalette } from '../theme';
import { health, SleepImport } from '../lib/health';
import { ecgAvailable, readEcgSince, requestEcgAuth } from '../lib/health/ecg';
import { ensureDay, getState, save } from '../store/store';
import { getCurrentKey } from '../store/nav';
import { computeScores } from '../lib/scoring';
import { fmtTime12, keyOf, pad, uid } from '../lib/dates';

export function HealthScreen() {
  const p = usePalette();
  const toast = useToast();
  const { openSheet } = useSheets();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const api = health();

  if (Platform.OS !== 'ios' || !api.available) {
    return (
      <View>
        <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 8 }}>Apple Health</Text>
        <Text style={{ color: p.textDim, fontSize: 15, lineHeight: 20 }}>
          Apple Health is only available on iOS with a development build. On this platform it is disabled.
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

  const sync = async () => {
    setBusy(true);
    try {
      const dk = getCurrentKey();
      const s = await api.readDay(dk);
      const d = ensureDay(dk);
      const ctx = { sex: getState().profile.sex, height: getState().profile.height };
      let added = 0;
      // Weight -> profile + a weight reading if none exists
      if (s.weightLb != null) { getState().profile.weight = String(s.weightLb); added++; }
      const mk = (type: string, fields: Record<string, unknown>) => {
        const r = { id: uid(), type, time: '09:00', note: 'From Apple Health', source: 'watch', ...fields } as never;
        (r as { scores?: unknown }).scores = computeScores(r as never, ctx);
        return r as never;
      };
      const has = (type: string) => d.readings.some((r) => r.type === type && r.note === 'From Apple Health');
      if (s.restingHr != null && !has('restingHr')) { d.readings.push(mk('restingHr', { hr: String(s.restingHr), position: 'Laying' })); added++; }
      if (s.systolic != null && s.diastolic != null && !has('bp')) { d.readings.push(mk('bp', { sys: String(s.systolic), dia: String(s.diastolic) })); added++; }
      if (s.spo2 != null && !has('bloodO2')) { d.readings.push(mk('bloodO2', { value: String(s.spo2) })); added++; }
      if (s.hrvSdnn != null && !has('hrv')) { d.readings.push(mk('hrv', { sdnn: String(s.hrvSdnn), avgHr: s.restingHr != null ? String(s.restingHr) : '' })); added++; }
      save();
      toast(added ? `Synced ${added} item${added === 1 ? '' : 's'}` : 'Nothing new to sync');
    } catch {
      toast('Sync failed');
    }
    setBusy(false);
  };

  const importEcg = async () => {
    setBusy(true);
    try {
      const ok = await requestEcgAuth();
      if (!ok) { setBusy(false); toast('ECG permission denied'); return; }
      // Pull ECGs from the last 30 days, place each on the day it was recorded.
      const items = await readEcgSince();
      let added = 0;
      for (const e of items) {
        const start = new Date(e.startISO);
        const dk = keyOf(start);
        const d = ensureDay(dk);
        if (d.readings.some((r) => r.type === 'ecg' && r.hkUuid === e.uuid)) continue;
        const ctx = { sex: getState().profile.sex, height: getState().profile.height };
        const r = {
          id: uid(),
          type: 'ecg',
          time: `${pad(start.getHours())}:${pad(start.getMinutes())}`,
          hkUuid: e.uuid,
          source: 'watch',
          ...e.fields,
        } as never;
        (r as { scores?: unknown }).scores = computeScores(r as never, ctx);
        d.readings.push(r as never);
        added++;
      }
      save();
      setBusy(false);
      toast(added ? `Imported ${added} ECG${added === 1 ? '' : 's'}` : 'No new ECGs found');
    } catch {
      setBusy(false);
      toast('Could not read ECG');
    }
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
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 6 }}>Apple Health</Text>
      <Text style={{ color: p.textDim, fontSize: 14, marginBottom: 16, lineHeight: 19 }}>
        {"Grant permission, then pull the current day's resting HR, HRV, blood pressure, SpO₂, weight and sleep into your journal. New readings you log are also written back to Health automatically. Existing manual entries are never overwritten."}
      </Text>
      <Button title={authed ? 'Health connected' : 'Connect Apple Health'} variant="primary" onPress={connect} />
      <View style={{ height: 12 }} />
      <Button title="Sync today from Health" onPress={sync} />
      <View style={{ height: 12 }} />
      <Button title="Import sleep from Health" onPress={importSleep} />
      {ecgAvailable() ? (
        <>
          <View style={{ height: 12 }} />
          <Button title="Import ECG from Health" onPress={importEcg} />
          <Text style={{ color: p.textDim, fontSize: 12, marginTop: 8, lineHeight: 16 }}>
            HR, HRV and rhythm come straight from Apple Health. QRS, QTc and PR are single-lead estimates — not clinical values.
          </Text>
        </>
      ) : null}
      {busy ? <View style={{ alignItems: 'center', marginTop: 14 }}><ActivityIndicator color={p.accent} /></View> : null}
      <View style={{ height: 24 }} />
    </View>
  );
}

/** Review/edit the night Health reported before writing it into the day. */
function SleepConfirmSheet({ dk, data, controls, onDone }: {
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
    save();
    controls.closeAll();
    onDone();
  };

  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 6 }}>Confirm sleep</Text>
      <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 20, marginBottom: 16 }}>
        {`Apple Health shows you were asleep from ${fmtTime12(data.bed)} to ${fmtTime12(data.wake)}`}
        {data.minutesAsleep > 0 ? ` (${hours}h ${mins}m` : ''}
        {data.minutesAsleep > 0 ? (data.interrupted ? ', interrupted).' : ').') : '.'}
        {' Adjust the times if that’s not right.'}
      </Text>
      <TimeField label="Bedtime" value={bed} onChange={setBed} />
      <TimeField label="Wake time" value={wake} onChange={setWake} />
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
