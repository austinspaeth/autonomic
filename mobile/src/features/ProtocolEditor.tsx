/**
 * Clean-day protocol editor sheet — what a "clean day" means for the streak.
 * Lives in its own file (not DaySummary) so the milestones card can open it
 * without an import cycle. Saving stamps `settings.protocolSetOn` once, which
 * completes the "Getting started" protocol milestone.
 */
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Icon } from '../components/Icon';
import { SheetControls, SheetFooter } from '../components/Sheet';
import { Button, Stepper } from '../components/ui';
import { radius, usePalette } from '../theme';
import { resolveProtocol } from '../lib/scoring/day';
import { typesFor } from '../lib/typeCatalog';
import { todayKey } from '../lib/dates';
import { mutate, useAppState } from '../store/store';

import type { Protocol } from '../lib/types';

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const p = usePalette();
  return (
    <Pressable onPress={() => onChange(!value)} hitSlop={6} style={{ width: 46, height: 28, borderRadius: 14, padding: 3, justifyContent: 'center', backgroundColor: value ? p.accent : p.surface2, borderWidth: 1, borderColor: value ? p.accent : p.border }}>
      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff', alignSelf: value ? 'flex-end' : 'flex-start' }} />
    </Pressable>
  );
}

function CheckRow({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  const p = usePalette();
  return (
    <Pressable onPress={onToggle} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 9 }, pressed && { opacity: 0.6 }]}>
      <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: checked ? p.accent : p.border, backgroundColor: checked ? p.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        {checked ? <Icon name="check" size={13} color="#fff" /> : null}
      </View>
      <Text style={{ flex: 1, fontSize: 15, color: p.text }}>{label}</Text>
    </Pressable>
  );
}

/** One protocol requirement: title + on/off toggle, with config UI shown while on. */
function ReqSection({ title, desc, enabled, onToggle, children }: { title: string; desc: string; enabled: boolean; onToggle: (v: boolean) => void; children?: React.ReactNode }) {
  const p = usePalette();
  return (
    <View style={{ borderWidth: 1, borderColor: p.border, borderRadius: radius.card, backgroundColor: p.surface, padding: 14, marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: p.text }}>{title}</Text>
          <Text style={{ fontSize: 12, color: p.textDim, marginTop: 2, lineHeight: 16 }}>{desc}</Text>
        </View>
        <Toggle value={enabled} onChange={onToggle} />
      </View>
      {enabled && children ? <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: p.border, paddingTop: 4 }}>{children}</View> : null}
    </View>
  );
}

export function ProtocolEditor({ controls }: { controls: SheetControls }) {
  const p = usePalette();
  const state = useAppState();
  const [proto, setProto] = useState<Protocol>(() => resolveProtocol(state.settings.protocol));

  const medTypes = typesFor(state, 'meds');
  const actTypes = typesFor(state, 'activities');
  const toggleKey = (list: string[], k: string) => (list.includes(k) ? list.filter((x) => x !== k) : [...list, k]);

  const onSave = () => {
    mutate((s) => {
      s.settings.protocol = proto;
      if (!s.settings.protocolSetOn) s.settings.protocolSetOn = todayKey();
    });
    controls.close();
  };
  const onReset = () => setProto(resolveProtocol(null));

  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 6 }}>Clean-day protocol</Text>
      <Text style={{ fontSize: 14, color: p.textDim, lineHeight: 20, marginBottom: 18 }}>
        Choose what a clean day means for you. A day counts toward your streak when every requirement you turn on is met.
      </Text>

      <ReqSection
        title="No triggers"
        desc="Any logged trigger breaks the day."
        enabled={proto.triggers.enabled}
        onToggle={(v) => setProto((x) => ({ ...x, triggers: { ...x.triggers, enabled: v } }))}
      />

      <ReqSection
        title="Daily HRV reading"
        desc="Take at least one HRV reading each day."
        enabled={proto.hrv.enabled}
        onToggle={(v) => setProto((x) => ({ ...x, hrv: { ...x.hrv, enabled: v } }))}
      />

      <ReqSection
        title="Water"
        desc="Hit a minimum daily water intake."
        enabled={proto.water.enabled}
        onToggle={(v) => setProto((x) => ({ ...x, water: { ...x.water, enabled: v } }))}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 }}>
          <Text style={{ fontSize: 15, color: p.text }}>Daily goal</Text>
          <Stepper value={proto.water.liters} step={0.25} format={(v) => `${v} L`} onChange={(v) => setProto((x) => ({ ...x, water: { ...x.water, liters: v } }))} />
        </View>
      </ReqSection>

      <ReqSection
        title="Medications"
        desc="Choose which medications you must take."
        enabled={proto.meds.enabled}
        onToggle={(v) => setProto((x) => ({ ...x, meds: { ...x.meds, enabled: v } }))}
      >
        {Object.entries(medTypes).map(([k, def]) => (
          <CheckRow key={k} label={def.label} checked={proto.meds.types.includes(k)} onToggle={() => setProto((x) => ({ ...x, meds: { ...x.meds, types: toggleKey(x.meds.types, k) } }))} />
        ))}
      </ReqSection>

      <ReqSection
        title="Activities"
        desc="Select the activities you must complete."
        enabled={proto.activities.enabled}
        onToggle={(v) => setProto((x) => ({ ...x, activities: { ...x.activities, enabled: v } }))}
      >
        {Object.entries(actTypes).map(([k, def]) => (
          <CheckRow key={k} label={def.label} checked={proto.activities.types.includes(k)} onToggle={() => setProto((x) => ({ ...x, activities: { ...x.activities, types: toggleKey(x.activities.types, k) } }))} />
        ))}
      </ReqSection>

      <ReqSection
        title="Sleep"
        desc="Sleep at least this many hours."
        enabled={proto.sleep.enabled}
        onToggle={(v) => setProto((x) => ({ ...x, sleep: { ...x.sleep, enabled: v } }))}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 }}>
          <Text style={{ fontSize: 15, color: p.text }}>Minimum</Text>
          <Stepper value={proto.sleep.hours} step={0.5} format={(v) => `${v} h`} onChange={(v) => setProto((x) => ({ ...x, sleep: { ...x.sleep, hours: v } }))} />
        </View>
      </ReqSection>

      <Pressable onPress={onReset} style={({ pressed }) => [{ alignSelf: 'center', paddingVertical: 8 }, pressed && { opacity: 0.6 }]}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: p.textDim }}>Reset to default</Text>
      </Pressable>

      <SheetFooter>
        <Button title="Save protocol" variant="primary" onPress={onSave} />
      </SheetFooter>
    </View>
  );
}
