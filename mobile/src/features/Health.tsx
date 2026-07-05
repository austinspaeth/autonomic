/** Apple Health settings: permission + "Sync today from Health" into the day. */
import React, { useState } from 'react';
import { ActivityIndicator, Platform, Text, View } from 'react-native';
import { Button } from '../components/ui';
import { useToast } from '../components/Toast';
import { usePalette } from '../theme';
import { health } from '../lib/health';
import { ensureDay, getState, save } from '../store/store';
import { getCurrentKey } from '../store/nav';
import { computeScores } from '../lib/scoring';
import { uid } from '../lib/dates';

export function HealthScreen() {
  const p = usePalette();
  const toast = useToast();
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
      // Sleep (never overwrite manual edits)
      if (s.sleep && !d.sleep.bed && !d.sleep.wake) {
        d.sleep = { bed: s.sleep.bed || '', wake: s.sleep.wake || '', quality: s.sleep.interrupted ? 'interrupted' : 'good' };
        added++;
      }
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

  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 6 }}>Apple Health</Text>
      <Text style={{ color: p.textDim, fontSize: 14, marginBottom: 16, lineHeight: 19 }}>
        {"Grant permission, then pull the current day's resting HR, HRV, blood pressure, SpO₂, weight and sleep into your journal. Existing manual entries are never overwritten."}
      </Text>
      <Button title={authed ? 'Health connected' : 'Connect Apple Health'} variant="primary" onPress={connect} />
      <View style={{ height: 12 }} />
      <Button title="Sync today from Health" onPress={sync} />
      {busy ? <View style={{ alignItems: 'center', marginTop: 14 }}><ActivityIndicator color={p.accent} /></View> : null}
      <View style={{ height: 24 }} />
    </View>
  );
}
