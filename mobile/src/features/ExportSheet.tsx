/**
 * Export data — one pill picker and a date range.
 *
 * BETA, and reached by holding the Settings row rather than tapping it: a tap
 * still runs the full JSON export it always did, with no extra decision in
 * front of it. Everything a plain tap would need is `openExportSheet`, so
 * making the sheet the tap destination later is a one-line change in
 * Settings.tsx.
 *
 * Two rules shape it.
 *
 * 1. **JSON is ALWAYS the whole journal.** Import REPLACES everything on the
 *    device, so a backup holding three months is a data-loss trap wearing a
 *    backup's name: restore it and the rest of the journal is gone. The range
 *    therefore belongs to the two CSV shapes alone — it is simply absent on
 *    JSON, and the line under the picker says why.
 * 2. **A failure is reported INSIDE the sheet.** The sheet stack is one RN
 *    Modal painted above the ToastProvider, so `toast()` from in here is
 *    invisible and a share that failed is indistinguishable from a dead
 *    button (see CLAUDE.md). The cycle confirm is an `Alert`, which is a
 *    native dialog and does paint above the Modal — the same thing the JSON
 *    path has always used.
 */
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { SheetControls, SheetFooter, useSheets } from '../components/Sheet';
import { Button, Segmented } from '../components/ui';
import { radius, usePalette } from '../theme';
import { getState, serializeState, useAppState } from '../store/store';
import type { AppState } from '../lib/types';
import { addDays, fmtSlashShort, keyOf, todayKey } from '../lib/dates';
import { profileCtx } from '../lib/scoring';
import { buildDailyCsv, buildEntriesCsv, dayKeysIn, rangeHasCycle } from '../lib/export/csv';
import { getUnits } from '../lib/units';
import { StoreError } from './Paywall';
import { Calendar } from './Calendar';
import { DateField } from './ProgressRange';

type Format = 'json' | 'daily' | 'entries';

const FORMATS: { val: Format; label: string }[] = [
  { val: 'json', label: 'JSON' },
  { val: 'daily', label: 'Daily CSV' },
  { val: 'entries', label: 'Entry CSV' },
];

/** One sentence each, in the slot under the picker — so only the chosen one is
 *  on screen, rather than three descriptions to read before choosing. */
const ABOUT: Record<Format, string> = {
  json: 'Your whole journal, in the format Import reads. Always every day, so restoring it can never lose any.',
  daily: 'A spreadsheet with one row per day: score, sleep, readings, symptoms, meds and more.',
  entries: 'A spreadsheet with one row per field of every entry. Longer, and a PivotTable can rebuild any view from it.',
};

type Preset = 'all' | '30' | '90' | 'custom';

const PRESETS: { val: Preset; label: string }[] = [
  { val: '30', label: 'Last 30 days' },
  { val: '90', label: 'Last 90' },
  { val: 'all', label: 'All time' },
];

/** The window a preset means. "All time" takes the journal's OWN first and
 *  last day rather than a round number, so the filename names the days the
 *  file actually holds. */
function rangeFor(preset: Preset, from: string, to: string, days: AppState['days']): { from: string; to: string } {
  if (preset === '30') return { from: addDays(todayKey(), -29), to: todayKey() };
  if (preset === '90') return { from: addDays(todayKey(), -89), to: todayKey() };
  // A backwards pair is a window, not a mistake: the picker can only be tapped
  // one field at a time, so "to before from" is a waypoint on the way to one.
  if (preset === 'custom') return from <= to ? { from, to } : { from: to, to: from };
  const keys = Object.keys(days || {}).sort();
  return keys.length ? { from: keys[0], to: keys[keys.length - 1] } : { from: todayKey(), to: todayKey() };
}

export function ExportSheet({ controls }: { controls: SheetControls }) {
  const p = usePalette();
  const { openSheet } = useSheets();
  const state = useAppState();
  const [format, setFormat] = useState<Format>('daily');
  const [preset, setPreset] = useState<Preset>('all');
  const [from, setFrom] = useState(() => addDays(todayKey(), -29));
  const [to, setTo] = useState(() => todayKey());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const csv = format !== 'json';
  const range = useMemo(() => rangeFor(preset, from, to, state.days), [preset, from, to, state.days]);
  const dayCount = useMemo(
    () => (csv ? dayKeysIn(state.days, range.from, range.to).length : 0),
    [csv, state.days, range.from, range.to],
  );

  // Picking a date is itself the choice of a custom window; nothing else has to
  // be tapped to say so.
  const pickDate = (which: 'from' | 'to') => openSheet(
    (c) => (
      <Calendar
        current={which === 'from' ? from : to}
        onPick={(k) => { if (which === 'from') setFrom(k); else setTo(k); setPreset('custom'); }}
        controls={c}
        title={which === 'from' ? 'Range starts' : 'Range ends'}
        showToday={false}
      />
    ),
    { fitContent: true },
  );

  const run = async () => {
    setError(null);
    if (format === 'json') { controls.closeAll(); exportJson(); return; }
    setBusy(true);
    // Building a year of rows is synchronous and blocks the JS thread, so hand
    // React a frame to paint "Preparing…" before it starts.
    await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
    const message = await exportCsv(format, range.from, range.to);
    setBusy(false);
    if (message) setError(message);
    else controls.closeAll();
  };

  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, lineHeight: 32, paddingRight: 58, marginBottom: 16 }}>
        Export data
      </Text>

      <Segmented options={FORMATS} value={format} onChange={(f) => { setFormat(f); setError(null); }} />
      <Text style={{ fontSize: 13, lineHeight: 19, color: p.textDim, marginTop: 12 }}>{ABOUT[format]}</Text>

      {csv ? (
        <View style={{ marginTop: 20 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {PRESETS.map((opt) => {
              const on = preset === opt.val;
              return (
                <Pressable
                  key={opt.val}
                  onPress={() => setPreset(opt.val)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  style={({ pressed }) => [{
                    flex: 1, height: 36, borderRadius: radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center',
                    borderColor: on ? p.accent : p.border, backgroundColor: on ? p.accentSoft : 'transparent',
                  }, pressed && { opacity: 0.6 }]}
                >
                  <Text numberOfLines={1} style={{ color: on ? p.accent : p.text, fontSize: 13, fontWeight: '600' }}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: 12 }}>
            <DateField label="FROM" value={range.from} onPress={() => pickDate('from')} />
            <Text style={{ color: p.textDim, fontSize: 15, height: 50, lineHeight: 50 }}>to</Text>
            <DateField label="TO" value={range.to} onPress={() => pickDate('to')} />
          </View>
          {/* The one thing the dates above cannot say: how many of those days
              the journal actually holds. An empty window is why a file would
              come out with nothing but a header row. */}
          <Text style={{ fontSize: 13, lineHeight: 19, color: dayCount ? p.textDim : p.accent, marginTop: 12 }}>
            {dayCount
              ? `${dayCount} logged day${dayCount === 1 ? '' : 's'} in this range.`
              : 'No logged days in this range.'}
          </Text>
        </View>
      ) : null}

      {error ? <View style={{ marginTop: 16 }}><StoreError text={error} /></View> : null}

      <SheetFooter>
        <Button
          title={busy ? 'Preparing…' : 'Export'}
          variant="primary"
          disabled={busy || (csv && !dayCount)}
          onPress={() => { void run(); }}
        />
      </SheetFooter>
    </View>
  );
}

/** The hidden entry point, and the only thing a plain tap would need. It is a
 *  CARD — one picker, one range, one button — so it rises from the bottom of
 *  the device sized to its own content, like every other one-answer sheet. */
export const openExportSheet = (openSheet: ReturnType<typeof useSheets>['openSheet']) =>
  openSheet((c) => <ExportSheet controls={c} />, { fitContent: true });

/* ────────────────────────────── writing files ────────────────────────────── */

/** The export is the whole journal in plain text. When it holds cycle data,
 *  the most sensitive thing in it, say so before the share sheet opens. */
export function exportJson() {
  const days = getState().days;
  const hasCycle = Object.keys(days).some((k) => !!days[k]?.cycle);
  if (!hasCycle) { void writeJson(); return; }
  Alert.alert(
    'This file includes your cycle data',
    'The export is your whole journal as plain text, period days included. Anyone you share it with can read it.',
    [{ text: 'Cancel', style: 'cancel' }, { text: 'Export', onPress: () => { void writeJson(); } }],
  );
}

async function writeJson() {
  // Raised from the Settings row and from a sheet that has already closed, so
  // there is no sheet content to report into: Alert is the only surface left,
  // and it is what this path has always used.
  const message = await share(`autonomic-journal-${keyOf(new Date())}.json`, () => serializeState(true), 'application/json', 'public.json');
  if (message) Alert.alert('Export failed', message);
}

/** Builds the CSV, asks about cycle data if the RANGE holds any, and shares it.
 *  Resolves with a message to show inside the sheet, or null on success. */
async function exportCsv(format: 'daily' | 'entries', from: string, to: string): Promise<string | null> {
  const state = getState();
  if (rangeHasCycle(state, from, to)) {
    const ok = await new Promise<boolean>((resolve) => {
      Alert.alert(
        'This file includes your cycle data',
        `The export covers ${fmtSlashShort(from)} to ${fmtSlashShort(to)} as plain text, period days included. Anyone you share it with can read it.`,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Export', onPress: () => resolve(true) },
        ],
        { onDismiss: () => resolve(false) },
      );
    });
    if (!ok) return null;
  }
  const name = `autonomic-${format === 'daily' ? 'daily' : 'entries'}-${from}-to-${to}.csv`;
  const build = () => {
    const s = getState();
    const ctx = profileCtx(s.profile);
    const units = getUnits();
    return format === 'daily' ? buildDailyCsv(s, ctx, from, to, units) : buildEntriesCsv(s, ctx, from, to, units);
  };
  return share(name, build, 'text/csv', 'public.comma-separated-values-text');
}

/**
 * Write, share, delete. The file is the user's own plaintext health data, so it
 * never stays in the cache once the share sheet has had it — the same contract
 * the JSON export has always kept.
 */
async function share(name: string, build: () => string, mimeType: string, UTI: string): Promise<string | null> {
  const uri = `${FileSystem.cacheDirectory}${name}`;
  try {
    await FileSystem.writeAsStringAsync(uri, build());
    if (!(await Sharing.isAvailableAsync())) return 'This device has no way to share the exported file.';
    await Sharing.shareAsync(uri, { mimeType, UTI, dialogTitle: 'Export Autonomic data' });
    return null;
  } catch (e) {
    return (e as Error).message || 'The file could not be written.';
  } finally {
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
  }
}
