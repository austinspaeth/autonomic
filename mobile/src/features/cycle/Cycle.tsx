/**
 * Cycle-aware tracking on the Journal: the chip in the date capsule, the
 * Cycle section, the one-time opt-in card and the "Period started?" prompt.
 * The rules behind every word live in src/lib/cycle; this file only draws.
 */
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSheets } from '../../components/Sheet';
import { Button, Card } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { radius, usePalette } from '../../theme';
import { chipLabel, flowRowLabel, periodPromptLine } from '../../lib/cycle/copy';
import { cycleOfferDue, offerKnownFemale } from '../../lib/cycle/offer';
import { cycleOfferDismissed, dismissCycleOffer, dismissHeavyNote, heavyNoteDismissed } from '../../lib/cycle/offerMemory';
import { heavyFlowCopy, heavyFlowPattern } from '../../lib/cycle/heavyFlow';
import { CYCLE_SYMPTOMS } from '../../lib/registry';
import { typesFor } from '../../lib/typeCatalog';
import { hasHrvReading } from '../../lib/hrvQuality';
import { todayKey } from '../../lib/dates';
import { useAppState, useCycleModel } from '../../store/store';
import { logFlow } from '../../store/cycle';
import { CycleRing } from './CycleRing';
import { CycleEntrySheet } from './CycleEntry';
import { CycleHistorySheet } from './CycleHistory';
import { CycleSetupSheet } from './CycleSetup';
import { FlowGlyph } from './parts';

/**
 * The day's Cycle card, right above Sleep, only while tracking is on. The ring,
 * "Cycle", and where the day sits on the right ("Day 3 since period"); the
 * whole top row opens the cycle history. Under it, one grey button to log, so
 * logging is always at hand's length rather than a sheet away.
 */
export function CycleSection({ dk }: { dk: string }) {
  const p = usePalette();
  const state = useAppState();
  const model = useCycleModel();
  const { openSheet } = useSheets();
  const prompt = usePeriodPrompt(dk);
  const [hidden, setHidden] = useState<string | null>(null);
  if (!state.settings.cycle?.enabled) return null;
  const rec = state.days[dk]?.cycle;
  const symptomTypes = typesFor(state, 'symptoms');
  const logged = new Set((state.days[dk]?.symptoms || []).map((e) => e.type));
  const symptoms = CYCLE_SYMPTOMS.filter((k) => logged.has(k) && symptomTypes[k]).map((k) => symptomTypes[k].label);
  const day = chipLabel(model, dk);
  // Where the day sits. What was logged has its own box below.
  const what = day || '';
  const openEntry = () => openSheet((c) => <CycleEntrySheet dk={dk} controls={c} />, { fitContent: true });
  return (
    <Card>
      <View style={{ padding: 14, gap: 12 }}>
        <Pressable
          onPress={() => openSheet((c) => <CycleHistorySheet controls={c} />)}
          style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12 }, pressed && { opacity: 0.6 }]}
        >
          <CycleRing model={model} dk={dk} size={34} stroke={3.4} periodColor={p.accent} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ color: p.text, fontSize: 17, fontWeight: '600' }}>Cycle</Text>
              {/* A new feature still settling: said once, small, beside its name. */}
              <View style={{ borderWidth: 1, borderColor: p.border, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 1.5 }}>
                <Text style={{ color: p.textDim, fontSize: 10.5, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' }}>Beta</Text>
              </View>
            </View>
            {what ? <Text numberOfLines={1} style={{ color: p.textDim, fontSize: 13, marginTop: 1 }}>{what}</Text> : null}
          </View>
          <Icon name="chevronRight" size={18} color={p.textDim} />
        </Pressable>
        {prompt.due && hidden !== dk ? (
          // The Sleep card's inner box: the question and its two answers. "No"
          // hides it for today; tomorrow is still inside the predicted range.
          // Yes sits left, away from everything that closes.
          <View style={{ backgroundColor: p.surface2, borderRadius: radius.control, padding: 12 }}>
            <Text style={{ color: p.text, fontSize: 15, fontWeight: '700' }}>Period started?</Text>
            <Text numberOfLines={1} style={{ color: p.textDim, fontSize: 13, marginTop: 2 }}>{prompt.sub}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              {/* Both a step lighter than the box they sit in, or a default
                  button on surface2 vanishes into it. */}
              <Button title="Yes" variant="default" onPress={() => logFlow(dk, 'medium')} style={ANSWER} />
              <Button title="No" variant="default" onPress={() => setHidden(dk)} style={ANSWER} />
            </View>
          </View>
        ) : null}
        {rec || symptoms.length ? (
          // Logged: the Sleep card's inner box, the way a night with data is
          // shown. The flow drops, the flow as the title, the symptoms under
          // it; the whole box opens the entry to edit.
          <Pressable onPress={openEntry} style={({ pressed }) => [
            // One line alone gets extra height, so the box never reads as a sliver.
            { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: p.surface2, borderRadius: radius.control, paddingHorizontal: 12, paddingVertical: symptoms.length ? 12 : 18 },
            pressed && { opacity: 0.6 },
          ]}>
            <View style={{ width: 58, alignItems: 'center' }}>
              {rec ? <FlowGlyph flow={rec.flow} color="#fff" /> : <Icon name="alert" size={18} color={p.textDim} />}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: p.text, fontSize: 16, fontWeight: '600' }}>{rec ? flowRowLabel(rec.flow) : 'Cycle symptoms'}</Text>
              {symptoms.length ? <Text numberOfLines={2} style={{ color: p.textDim, fontSize: 13, marginTop: 2 }}>{symptoms.join(', ')}</Text> : null}
            </View>
            <Icon name="chevronRight" size={18} color={p.textDim} />
          </Pressable>
        ) : (
          <View style={{ flexDirection: 'row' }}>
            <Button title="Log flow or symptoms" variant="default" onPress={openEntry} />
          </View>
        )}
      </View>
    </Card>
  );
}

/**
 * The one-time offer under the Outlook. A neutral surface card in the warning
 * card's shape (sunk tile, a sentence, two buttons), not an offer card: it
 * sells nothing. "Not for me" is the only dismissal and it is permanent.
 */
export function CycleOfferCard({ dk }: { dk: string }) {
  const p = usePalette();
  const state = useAppState();
  const { openSheet } = useSheets();
  const [gone, setGone] = useState(false);
  const due = !gone && cycleOfferDue({
    sex: state.profile.sex || '',
    setUp: !!state.settings.cycle,
    dismissed: cycleOfferDismissed(),
    hasReading: hasHrvReading(state.days),
    isToday: dk === todayKey(),
  });
  if (!due) return null;
  const female = offerKnownFemale(state.profile.sex || '');
  return (
    <View style={{ borderWidth: 1, borderColor: p.border, borderRadius: radius.card, backgroundColor: p.surface, marginBottom: 12, padding: 15 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
        <View style={{ width: 42, height: 42, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: p.sunk, borderWidth: 1, borderColor: p.border }}>
          <CycleRing model={null} size={22} stroke={2.6} />
        </View>
        <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: p.text, lineHeight: 20 }}>
          {female ? 'Cycle aware tracking' : 'Do you have menstrual cycles?'}
        </Text>
      </View>
      <Text style={{ fontSize: 14, color: p.textDim, lineHeight: 20, marginTop: 10 }}>
        {female
          ? 'Your HRV and heart rate shift across your cycle. Autonomic can account for it, so your scores read true for you.'
          : 'If you do, Autonomic can account for how your cycle shifts HRV and heart rate.'}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
        <Button title="Not for me" variant="default" onPress={() => { dismissCycleOffer(); setGone(true); }} />
        <Button title="Set up" variant="primary" onPress={() => openSheet((c) => <CycleSetupSheet controls={c} />)} />
      </View>
    </View>
  );
}

/**
 * "Period started?" — due on a day inside the predicted range with nothing
 * logged, never on a past day (the prediction is about now) and never outside
 * regular mode, the only mode that predicts. Asked inside the Cycle card.
 */
const ANSWER = { backgroundColor: '#34343a', borderColor: '#3e3e45' };

function usePeriodPrompt(dk: string): { due: boolean; sub: string } {
  const state = useAppState();
  const model = useCycleModel();
  const sub = periodPromptLine(model, state.days, dk);
  return { due: !!sub, sub: sub || '' };
}

/**
 * The heavy-flow note: a pattern across cycles, said once, with one useful
 * thing to do. Neutral surface, no grade colour, today only, and "Not now" is
 * permanent — the same information stays in the doctor summary's cycle table.
 */
export function HeavyFlowNote({ dk }: { dk: string }) {
  const p = usePalette();
  const model = useCycleModel();
  const [gone, setGone] = useState(false);
  if (gone || dk !== todayKey() || heavyNoteDismissed()) return null;
  const pat = heavyFlowPattern(model);
  if (!pat) return null;
  return (
    <View style={{ borderWidth: 1, borderColor: p.border, borderRadius: radius.card, backgroundColor: p.surface, marginBottom: 12, padding: 15 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
        <View style={{ width: 42, height: 42, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: p.sunk, borderWidth: 1, borderColor: p.border }}>
          <Icon name="droplet" size={20} color={p.textDim} />
        </View>
        <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: p.text }}>A note on heavy periods</Text>
      </View>
      <Text style={{ fontSize: 14, color: p.textDim, lineHeight: 20, marginTop: 10 }}>{heavyFlowCopy(pat)}</Text>
      <View style={{ flexDirection: 'row', marginTop: 14 }}>
        <Button title="Not now" variant="default" onPress={() => { dismissHeavyNote(); setGone(true); }} />
      </View>
    </View>
  );
}
