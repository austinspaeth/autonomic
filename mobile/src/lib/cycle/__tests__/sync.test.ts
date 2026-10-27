import { cycleTombstone, planCycleImport } from '../sync';

const read = (flows: { dk: string; flow: 'light' | 'medium' | 'heavy' | 'spotting'; key?: string; ownApp?: boolean }[]) => ({
  flows: flows.map((f) => ({ key: f.key || `hk:${f.dk}`, ownApp: !!f.ownApp, ...f })),
  temps: [{ dk: '2026-10-02', wrist: 35.6 }],
});

it('files new days from other apps as imported', () => {
  const p = planCycleImport({}, read([{ dk: '2026-10-01', flow: 'heavy' }]), new Set());
  expect(p.writes).toEqual([{ dk: '2026-10-01', record: { flow: 'heavy', imported: true, healthKey: 'hk:2026-10-01' } }]);
  expect(p.temps).toEqual({ '2026-10-02': { wrist: 35.6 } });
});

it('skips our own write-backs', () => {
  expect(planCycleImport({}, read([{ dk: '2026-10-01', flow: 'heavy', ownApp: true }]), new Set()).writes).toEqual([]);
});

it('never overwrites a day logged or corrected here', () => {
  const days = {
    '2026-10-01': { cycle: { flow: 'light' as const } },
    '2026-10-02': { cycle: { flow: 'light' as const, imported: true, edited: true } },
  };
  const p = planCycleImport(days, read([{ dk: '2026-10-01', flow: 'heavy' }, { dk: '2026-10-02', flow: 'heavy' }]), new Set());
  expect(p.writes).toEqual([]);
});

it('updates an untouched imported day when the source changed it', () => {
  const days = { '2026-10-01': { cycle: { flow: 'light' as const, imported: true } } };
  expect(planCycleImport(days, read([{ dk: '2026-10-01', flow: 'medium' }]), new Set()).writes).toHaveLength(1);
});

it('keeps a deleted import deleted, by key and by day', () => {
  const r = read([{ dk: '2026-10-01', flow: 'heavy', key: 'hk:a' }, { dk: '2026-10-02', flow: 'heavy', key: 'hk:b' }]);
  expect(planCycleImport({}, r, new Set(['hk:a', cycleTombstone('2026-10-02')])).writes).toEqual([]);
});
