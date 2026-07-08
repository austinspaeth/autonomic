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
import { ensureDay, getState, save } from '../store/store';
import { getCurrentKey } from '../store/nav';
import { computeScores } from '../lib/scoring';
import { fmtTime12, uid } from '../lib/dates';

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
      const d = ensureDay(dk);
      const ctx = { sex: getState().profile.sex, height: getState().profile.height };
      let added = 0;

      // Weight -> profile (aggregate is fine; it's not a timestamped journal entry).
      const day = await api.readDay(dk);
      if (day.weightLb != null) { getState().profile.weight = String(day.weightLb); added++; }

      // Timestamped readings, each at its real clock time (no more 9am placeholder).
      const imports = await api.readImports(dk);
      const toMin = (t?: string) => { const [h, m] = String(t || '').split(':').map(Number); return isNaN(h) ? null : h * 60 + m; };
      const valueKey = (type: string, get: (k: string) => unknown) =>
        type === 'bp' ? `${get('sys')}/${get('dia')}` : type === 'restingHr' ? String(get('hr')) : String(get('sdnn'));

      for (const imp of imports) {
        // Troubleshooting bulk pull is intentionally "smart": it brings HR, BP and
        // weight, but NOT the noisy per-sample sources (HRV, ECG) — those are
        // imported one-at-a-time from the reading picker instead.
        if (imp.type === 'hrv') continue;
        // Skip anything this app authored (our own write-backs, round-tripped).
        if (imp.ownApp) continue;
        // Backstop: skip if an equal reading of the same type already sits within
        // 5 minutes of this one (covers manual entries that were pushed to Health
        // and prior syncs of the same sample).
        const impMin = toMin(imp.time);
        const impVal = valueKey(imp.type, (k) => imp.fields[k]);
        const dup = d.readings.some((r) => {
          if (r.type !== imp.type) return false;
          if (valueKey(imp.type, (k) => r[k]) !== impVal) return false;
          const rm = toMin(r.time as string);
          return rm != null && impMin != null && Math.abs(rm - impMin) <= 5;
        });
        if (dup) continue;

        const r = { id: uid(), type: imp.type, time: imp.time, note: 'From Apple Health', source: 'watch', ...imp.fields } as Record<string, unknown>;
        if (imp.rr) r.rrRaw = imp.rr;
        if (imp.rrClean) r.rrClean = imp.rrClean;
        r.scores = computeScores(r as never, ctx);
        d.readings.push(r as never);
        added++;
      }
      save();
      toast(added ? `Synced ${added} item${added === 1 ? '' : 's'}` : 'Nothing new to sync');
    } catch {
      toast('Sync failed');
    }
    setBusy(false);
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
        {"Grant permission, then import readings one at a time from the reading picker (tap a reading type to choose a sample from Health, or enter it manually). New readings you log are also written back to Health automatically. Existing entries are never overwritten."}
      </Text>
      <Button title={authed ? 'Health connected' : 'Connect Apple Health'} variant="primary" onPress={connect} />
      <View style={{ height: 20 }} />
      <Text style={{ color: p.textDim, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Troubleshooting</Text>
      <Text style={{ color: p.textDim, fontSize: 13, marginBottom: 10, lineHeight: 18 }}>
        {"Bulk-pull the current day's resting HR, blood pressure and weight in one go. Skips HRV and ECG (import those individually to avoid noise)."}
      </Text>
      <Button title="Sync day from Health" onPress={sync} />
      <View style={{ height: 12 }} />
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
