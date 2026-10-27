/**
 * Settings → Cycle. Reachable whatever the profile says: profile sex only ever
 * drove the HRV norms, and nobody should need to change it to reach this.
 * The rows are the Settings list's own silhouette, and the switches are the
 * Notifications sheet's `NotifRow`.
 */
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { SheetFooter, useSheets, type SheetControls } from '../../components/Sheet';
import { Button } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { usePalette } from '../../theme';
import { MODE_LABEL } from '../../lib/cycle/copy';
import type { CycleMode } from '../../lib/types';
import { health, healthAppName } from '../../lib/health';
import { getState, useAppState, useCycleModel } from '../../store/store';
import { disableCycle, enableCycle, requestCycleHealth, setCycleMode, setCycleOption, setTypicalLength, syncCycleFromHealth } from '../../store/cycle';
import { NotifRow } from '../Reminders';
import { CycleHistorySheet } from './CycleHistory';
import { CycleSetupSheet, ModeOptions } from './CycleSetup';
import { PrivacyLine, TypicalLengthField } from './parts';

export function CycleSettingsSheet({ controls }: { controls: SheetControls }) {
  void controls;
  const p = usePalette();
  const state = useAppState();
  const model = useCycleModel();
  const { openSheet } = useSheets();
  const c = state.settings.cycle;

  if (!c?.enabled) {
    return (
      <View>
        <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 8 }}>Cycle</Text>
        <Text style={{ fontSize: 15, lineHeight: 21, color: p.textDim, marginBottom: 16 }}>
          Your HRV, heart rate and symptoms shift across a menstrual cycle. With cycle-aware tracking on, Autonomic
          compares each day with the same point in your past cycles, so a pre-period dip is not read as a crash every month.
        </Text>
        <Button
          title={c ? 'Turn cycle tracking back on' : 'Set up cycle tracking'}
          variant="primary"
          onPress={() => (c ? enableCycle(c.mode) : openSheet((cc) => <CycleSetupSheet controls={cc} />))}
        />
        <PrivacyLine />
      </View>
    );
  }

  const canSync = health().available;
  const syncOn = c.healthSync !== false && !!state.settings.healthEnabled;
  const toggleSync = async () => {
    if (syncOn) { setCycleOption('healthSync', false); return; }
    const ok = await requestCycleHealth();
    if (!ok) return;
    setCycleOption('healthSync', true);
    void syncCycleFromHealth();
  };
  const cycles = model?.cycles.length ?? 0;

  const row = (icon: 'clipboard' | 'calendar', title: string, value: string, onPress: () => void) => (
    <Pressable onPress={onPress} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15, borderTopWidth: 1, borderTopColor: p.border }, pressed && { opacity: 0.5 }]}>
      <Icon name={icon} size={22} color={p.textDim} />
      <Text style={{ flex: 1, color: p.text, fontSize: 17 }}>{title}</Text>
      <Text style={{ color: p.textDim, fontSize: 15 }}>{value}</Text>
      <Icon name="chevronRight" size={18} color={p.textDim} />
    </Pressable>
  );

  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 16 }}>Cycle</Text>
      {row('clipboard', 'Cycle type', MODE_LABEL[c.mode], () => openSheet((cc) => <ModeSheet controls={cc} />, { fitContent: true }))}
      {canSync ? (
        <NotifRow icon="heart" title={`Sync with ${healthAppName()}`} sub="Reads and writes period days" on={syncOn} onToggle={toggleSync} />
      ) : null}
      <NotifRow
        icon="bell"
        title="Heads-up before your period"
        sub="A discreet note two days ahead"
        on={c.headsUp !== false}
        onToggle={() => setCycleOption('headsUp', c.headsUp === false)}
      />
      {c.mode === 'regular' ? row('calendar', 'Typical cycle length', c.typicalLength ? `${c.typicalLength} days` : 'Learning', () => openSheet((cc) => <TypicalLengthSheet controls={cc} />, { fitContent: true })) : null}
      {row('calendar', 'Cycle impact', cycles ? `${cycles} cycle${cycles === 1 ? '' : 's'}` : 'None yet', () => openSheet((cc) => <CycleHistorySheet controls={cc} />))}
      <View style={{ marginTop: 20 }}>
        <Button title="Turn off cycle tracking" variant="default" onPress={() => disableCycle()} />
      </View>
      <Text style={{ fontSize: 13, color: p.textDim, lineHeight: 18, marginTop: 8, textAlign: 'center' }}>
        Turning it off keeps your logged days. Scores stop adjusting by phase.
      </Text>
      <PrivacyLine />
    </View>
  );
}

/** Settings → Cycle → Typical cycle length: the setup field on its own. */
function TypicalLengthSheet({ controls }: { controls: SheetControls }) {
  const p = usePalette();
  const [v, setV] = React.useState<number | null>(getState().settings.cycle?.typicalLength ?? null);
  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 4 }}>Typical cycle length</Text>
      <Text style={{ fontSize: 14, color: p.textDim, lineHeight: 20 }}>Used to predict your next period until two cycles are logged. After that, your logged cycles take over.</Text>
      <TypicalLengthField value={v} onChange={setV} />
      <SheetFooter>
        <Button title="Clear" variant="default" onPress={() => { setTypicalLength(null); controls.close(); }} />
        <Button title="Save" variant="primary" onPress={() => { setTypicalLength(v); controls.close(); }} disabled={v == null} />
      </SheetFooter>
    </View>
  );
}

/** Settings → Cycle → Cycle type: only the choice of situation. Changing it never
 *  re-runs setup or the import. */
function ModeSheet({ controls }: { controls: SheetControls }) {
  const p = usePalette();
  const cur = getState().settings.cycle?.mode || 'regular';
  const [mode, setMode] = React.useState<CycleMode>(cur);
  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 14 }}>Cycle type</Text>
      <ModeOptions value={mode} onChange={setMode} />
      <SheetFooter>
        <Button title="Save" variant="primary" disabled={mode === cur} onPress={() => { setCycleMode(mode); controls.close(); }} />
      </SheetFooter>
    </View>
  );
}
