/**
 * reconcileProtocol: the clean-day protocol stores type KEYS, the editor lists
 * `typesFor`, and the two drift when a type is deleted and added back by name.
 * A stale key is a requirement the user can neither see nor untick.
 */
import type { AppState, Protocol } from '../types';
import { reconcileProtocol, typesFor } from '../typeResolve';

const proto = (over: Partial<Protocol> = {}): Protocol => ({
  triggers: { enabled: true, types: [] },
  hrv: { enabled: true },
  water: { enabled: true, liters: 2.5 },
  meds: { enabled: true, types: [] },
  activities: { enabled: true, types: [] },
  sleep: { enabled: true, hours: 7 },
  ...over,
});

const state = (over: Partial<AppState> = {}): AppState => ({
  version: 1,
  settings: { theme: 'system' },
  profile: { sex: '', birthday: '', weight: '', height: '' },
  meta: { lastUpdated: null, lastImport: null },
  days: {},
  ...over,
});

const custom = (label: string) => ({ label, icon: 'pill', fields: [], userDefined: true });

describe('reconcileProtocol', () => {
  it('returns the same object when every key is visible', () => {
    const p = proto({ meds: { enabled: true, types: ['gaviscon'] }, activities: { enabled: true, types: ['yoga'] } });
    expect(reconcileProtocol(p, state())).toBe(p);
  });

  it('moves a hidden built-in onto the visible type of the same name', () => {
    // Gaviscon deleted from the picker, then added back: the catalog now holds
    // custom-gaviscon and the protocol still names the built-in.
    const s = state({
      hiddenTypes: { meds: ['gaviscon'] },
      customTypes: { meds: { 'custom-gaviscon': custom('Gaviscon') } },
    });
    expect(typesFor(s, 'meds')['gaviscon']).toBeUndefined();
    const p = proto({ meds: { enabled: true, types: ['melatonin', 'gaviscon'] } });
    expect(reconcileProtocol(p, s).meds.types).toEqual(['melatonin', 'custom-gaviscon']);
  });

  it('matches the name case-insensitively, the catalog duplicate rule', () => {
    const s = state({
      hiddenTypes: { activities: ['yoga'] },
      customTypes: { activities: { 'custom-yoga': { ...custom('yoga / STRETCHING'), icon: 'activity' } } },
    });
    const p = proto({ activities: { enabled: true, types: ['yoga'] } });
    expect(reconcileProtocol(p, s).activities.types).toEqual(['custom-yoga']);
  });

  it('drops a key with no visible twin: deleting the type was the answer', () => {
    const s = state({ hiddenTypes: { meds: ['gaviscon'] } });
    const p = proto({ meds: { enabled: true, types: ['gaviscon', 'melatonin'] } });
    expect(reconcileProtocol(p, s).meds.types).toEqual(['melatonin']);
    // A removed custom type is simply unknown, and goes the same way.
    const q = proto({ meds: { enabled: true, types: ['custom-gone', 'melatonin'] } });
    expect(reconcileProtocol(q, state()).meds.types).toEqual(['melatonin']);
  });

  it('never lists one visible type twice', () => {
    const s = state({
      hiddenTypes: { meds: ['gaviscon'] },
      customTypes: { meds: { 'custom-gaviscon': custom('Gaviscon') } },
    });
    const p = proto({ meds: { enabled: true, types: ['gaviscon', 'custom-gaviscon'] } });
    expect(reconcileProtocol(p, s).meds.types).toEqual(['custom-gaviscon']);
  });

  it('leaves trigger requirements alone: an empty list there means ALL', () => {
    const s = state({ hiddenTypes: { triggers: ['pizza'] } });
    const p = proto({ triggers: { enabled: true, types: ['pizza'] } });
    expect(reconcileProtocol(p, s)).toBe(p);
  });

  it('repairs only the sections that changed, and keeps the rest by identity', () => {
    const s = state({ hiddenTypes: { meds: ['gaviscon'] } });
    const p = proto({ meds: { enabled: true, types: ['gaviscon'] }, activities: { enabled: true, types: ['yoga'] } });
    const out = reconcileProtocol(p, s);
    expect(out).not.toBe(p);
    expect(out.meds.types).toEqual([]);
    expect(out.activities).toBe(p.activities);
    expect(out.sleep).toBe(p.sleep);
  });
});
