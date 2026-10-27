/**
 * Setting up cycle-aware tracking: which situation fits, when the last period
 * started, and (where a health store exists) bringing in the history. The same
 * walkthrough shape as the camera setup card — the WizardBar's back arrow and
 * progress pills under the sheet's own ✕ — so it reads as part of the app, not
 * as a feature with its own chrome.
 *
 * Tracking is switched on as the last-period step is left, BEFORE the import:
 * the import's whole point is to line up existing history with a model, and a
 * user who closes the sheet at the import step has still made their choice.
 */
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SheetFooter, type SheetControls } from '../../components/Sheet';
import { WizardBar } from '../../components/WizardBar';
import { Button, Checkbox } from '../../components/ui';
import { DateField } from '../../components/Field';
import { Icon } from '../../components/Icon';
import { fonts, radius, usePalette } from '../../theme';
import { MODES, MODE_LABEL, MODE_SUB } from '../../lib/cycle/copy';
import { health, healthAppName } from '../../lib/health';
import { addDays, todayKey } from '../../lib/dates';
import { isTrustedReading } from '../../lib/hrvQuality';
import type { CycleMode } from '../../lib/types';
import { currentCycleModel, getState, mutate } from '../../store/store';
import { enableCycle, importCycleHistory, requestCycleHealth } from '../../store/cycle';
import { PrivacyLine, TypicalLengthField } from './parts';
import { CycleRing } from './CycleRing';

type Step = 'mode' | 'last' | 'import';

export function CycleSetupSheet({ controls, initialMode }: { controls: SheetControls; initialMode?: CycleMode }) {
  const p = usePalette();
  const canHealth = health().available;
  const [mode, setMode] = useState<CycleMode>(initialMode || getState().settings.cycle?.mode || 'regular');
  const [step, setStep] = useState<Step>('mode');
  // Today, not an empty field: the date picker opens on whatever it is handed.
  const [last, setLast] = useState(todayKey());
  const [typical, setTypical] = useState<number | null>(getState().settings.cycle?.typicalLength ?? null);
  const [imp, setImp] = useState<'idle' | 'busy' | 'done' | 'failed'>('idle');
  const [found, setFound] = useState<{ cycles: number; avg: number | null; matched: number } | null>(null);

  // Pregnancy pauses phases, so a last period date would seed nothing.
  const order: Step[] = useMemo(() => {
    const o: Step[] = ['mode'];
    if (mode !== 'pregnant') o.push('last');
    if (canHealth) o.push('import');
    return o;
  }, [mode, canHealth]);
  const idx = order.indexOf(step);
  const back = () => { if (idx > 0 && imp !== 'busy') setStep(order[idx - 1]); };

  const finishChoice = (lastStart?: string) => {
    // Only regular periods forecast, so only that mode keeps a typical length.
    enableCycle(mode, { lastStart, typicalLength: mode === 'regular' ? typical : null });
    if (canHealth) setStep('import');
    else controls.close();
  };
  const next = () => {
    if (step === 'mode') {
      if (order[1] === 'last') setStep('last');
      else finishChoice();
    } else if (step === 'last') {
      finishChoice(last || undefined);
    }
  };

  const runImport = async () => {
    setImp('busy');
    try {
      const ok = await requestCycleHealth();
      // The same rule as the pacing connect: the request is the whole set, so
      // a user who skipped Health in the wizard must not grant everything into
      // a switch that keeps every read off.
      if (ok && !getState().settings.healthEnabled) mutate((s) => { s.settings.healthEnabled = true; });
      await importCycleHistory();
      const m = currentCycleModel();
      const days = getState().days;
      let matched = 0;
      if (m) {
        for (let dk = addDays(todayKey(), -365); dk <= todayKey(); dk = addDays(dk, 1)) {
          if (!m.phaseOn(dk)?.phase) continue;
          if ((days[dk]?.readings || []).some((r) => (r.type === 'hrv' || r.type === 'breathHrv') && isTrustedReading(r))) matched++;
        }
      }
      setFound({ cycles: m?.cycles.length ?? 0, avg: m?.stats.medianLength ?? null, matched });
      setImp('done');
    } catch {
      setImp('failed');
    }
  };

  const title = step === 'mode' ? 'Which fits you?' : step === 'last' ? 'When did your last period start?' : 'Bring in your history';

  return (
    <View>
      <WizardBar count={order.length} index={idx} onBack={back} />
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 6 }}>{title}</Text>

      {step === 'mode' ? (
        <>
          <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 20, marginBottom: 14 }}>
            Your HRV, heart rate and symptoms shift across a cycle. Tell Autonomic what applies so it only claims what it can.
          </Text>
          <ModeOptions value={mode} onChange={setMode} />
        </>
      ) : step === 'last' ? (
        <>
          <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 20, marginBottom: 14 }}>
            {mode === 'contraception'
              ? 'The first day of your last bleed. Autonomic logs bleeding days only, with no phase estimates.'
              : 'The first day of real flow, not spotting. Autonomic learns your cycle length from what you log.'}
          </Text>
          <DateField label="Start date" value={last} onChange={(v) => setLast(v > todayKey() ? todayKey() : v)} />
          {mode === 'regular' ? <TypicalLengthField value={typical} onChange={setTypical} /> : null}
        </>
      ) : (
        <ImportStep state={imp} found={found} onImport={runImport} />
      )}

      <PrivacyLine />

      <SheetFooter>
        {step === 'mode' ? (
          <Button title="Continue" variant="primary" onPress={next} />
        ) : step === 'last' ? (
          <>
            <Button title="Not sure" variant="default" onPress={() => finishChoice()} />
            <Button title="Continue" variant="primary" onPress={next} disabled={!last} />
          </>
        ) : imp === 'done' || imp === 'failed' ? (
          <Button title="Done" variant="primary" onPress={() => controls.close()} />
        ) : (
          <>
            <Button title="Skip for now" variant="default" onPress={() => controls.close()} disabled={imp === 'busy'} />
            <Button title={imp === 'busy' ? 'Importing…' : 'Import'} variant="primary" onPress={runImport} disabled={imp === 'busy'} />
          </>
        )}
      </SheetFooter>
    </View>
  );
}

function ImportStep({ state, found, onImport }: {
  state: 'idle' | 'busy' | 'done' | 'failed';
  found: { cycles: number; avg: number | null; matched: number } | null;
  onImport: () => void;
}) {
  const p = usePalette();
  if (state === 'done' && found) {
    const rows: [string, string][] = [
      ['Cycles found', String(found.cycles)],
      ['Average length', found.avg != null ? `${Math.round(found.avg)} days` : 'Learning'],
      ['HRV days matched', String(found.matched)],
    ];
    if (!found.cycles) {
      return (
        <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 20, marginBottom: 14 }}>
          {`No period days were found in ${healthAppName()}. Log your next period here and Autonomic starts from there.`}
        </Text>
      );
    }
    return (
      <>
        {/* The receipt: the cycle ring at hero size with today on it, what came
            in, then the three numbers behind it. */}
        <View style={{ backgroundColor: p.surface2, borderRadius: radius.card, paddingVertical: 20, paddingHorizontal: 16, alignItems: 'center', marginTop: 10, marginBottom: 12 }}>
          <View style={{ marginTop: 6, marginBottom: 16 }}>
            <CycleRing model={currentCycleModel()} dk={todayKey()} size={96} stroke={6} periodColor={p.accent} gapRatio={0.014} />
          </View>
          <Text style={{ color: p.text, fontSize: 18, fontWeight: '700' }}>
            <Text style={{ fontFamily: fonts.numHeavy }}>{found.cycles}</Text>{` period${found.cycles === 1 ? '' : 's'} imported`}
          </Text>
          <Text style={{ color: p.textDim, fontSize: 15, lineHeight: 22, marginTop: 6, textAlign: 'center' }}>Your HRV history is now lined up with your cycle.</Text>
        </View>
        <View style={{ backgroundColor: p.sunk, borderRadius: 12, overflow: 'hidden' }}>
          {rows.map(([k, v], i) => (
            <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: p.hairline }}>
              <Text style={{ color: p.text, opacity: 0.85, fontSize: 15 }}>{k}</Text>
              <Text style={{ color: p.text, fontSize: 15, fontFamily: fonts.numHeavy, fontVariant: ['tabular-nums'] }}>{v}</Text>
            </View>
          ))}
        </View>
      </>
    );
  }
  return (
    <>
      <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 20, marginBottom: 14 }}>
        Past periods let Autonomic line up the HRV you already have with your cycle.
      </Text>
      <Pressable onPress={state === 'idle' ? onImport : undefined} style={({ pressed }) => [
        { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.control, backgroundColor: p.surface2, borderWidth: 1, borderColor: p.border },
        pressed && state === 'idle' && { opacity: 0.7 },
      ]}>
        <Icon name="heart" size={22} color={p.accent} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: p.text, fontSize: 16, fontWeight: '600' }}>{`Import from ${healthAppName()}`}</Text>
          <Text style={{ color: p.textDim, fontSize: 13, marginTop: 1 }}>
            {state === 'busy' ? 'Reading the last year…' : state === 'failed' ? 'Could not read your history this time' : 'Period days and overnight temperature'}
          </Text>
        </View>
        {state === 'busy' ? <ActivityIndicator color={p.accent} /> : null}
      </Pressable>
    </>
  );
}

/** The five situations as checkbox rows. Shared by the setup sheet and
 *  Settings → Cycle → Mode, so the two cannot drift. */
export function ModeOptions({ value, onChange }: { value: CycleMode; onChange: (m: CycleMode) => void }) {
  const p = usePalette();
  return (
    <View style={{ gap: 8 }}>
      {MODES.map((m) => {
        const on = m === value;
        return (
          <Pressable key={m} onPress={() => onChange(m)} style={({ pressed }) => [
            { borderWidth: 1, borderRadius: radius.control, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12,
              borderColor: on ? p.accent : p.border, backgroundColor: on ? p.accentSoft : p.surface2 },
            pressed && { opacity: 0.7 },
          ]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: p.text, fontSize: 16, fontWeight: '600' }}>{MODE_LABEL[m]}</Text>
              <Text style={{ color: p.textDim, fontSize: 13, marginTop: 2 }}>{MODE_SUB[m]}</Text>
            </View>
            {/* The log picker's checkbox: it holds its space unchecked, so
                choosing a row never shifts the text. */}
            <Checkbox on={on} />
          </Pressable>
        );
      })}
    </View>
  );
}
