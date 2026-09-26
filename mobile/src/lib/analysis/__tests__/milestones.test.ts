/**
 * "Getting started" onboarding milestones: first HRV reading, first entry the
 * user logged by hand (imports don't count), and saving a clean-day protocol
 * (driven by settings.protocolSetOn, not day data).
 */
import { STARTERS, buildMilestoneDays, buildMilestoneGroups } from '../milestones';
import { resolveProtocol, type DaysMap } from '../../scoring/day';
import { keyOf, todayKey } from '../../dates';
import { blankDay } from '../../migrate';
import type { Entry } from '../../types';

const dayKey = (daysAgo: number) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return keyOf(d);
};

const ctx = { protocol: resolveProtocol(null) };

function starters(days: DaysMap, protocolSetOn?: string | null) {
  const md = buildMilestoneDays(days, ctx);
  const group = buildMilestoneGroups(md, { protocolSetOn }).find((g) => g.title === 'Getting started')!;
  return Object.fromEntries(group.items.map((it) => [it.label, it]));
}

const hrvReading = (): Entry => ({ id: 'r1', type: 'hrv', time: '08:00', note: '', rmssd: '22' });

describe('Getting started milestones', () => {
  it('are all undone on an empty journal, and the group still exists', () => {
    const s = starters({});
    expect(s[STARTERS.hrv].done).toBe(false);
    expect(s[STARTERS.firstEntry].done).toBe(false);
    expect(s[STARTERS.protocol].done).toBe(false);
  });

  it('completes the HRV milestone on the first hrv/breathHrv reading', () => {
    const dk = dayKey(0);
    const s = starters({ [dk]: { ...blankDay(), readings: [hrvReading()] } });
    expect(s[STARTERS.hrv]).toMatchObject({ done: true, date: dk });
  });

  it('completes the first-entry milestone on the same day something is logged', () => {
    const today = todayKey();
    const d = { ...blankDay(), food: { water: 2, calories: 0, triggers: {}, meals: [] } };
    const s = starters({ [today]: d });
    expect(s[STARTERS.firstEntry]).toMatchObject({ done: true, date: today });
  });

  it('dates the first-entry milestone to the earliest day logged', () => {
    const earlier = dayKey(3);
    const d = { ...blankDay(), meds: [{ id: 'm1', type: 'custom-x', time: '09:00', note: '' } as Entry] };
    const s = starters({ [earlier]: d, [dayKey(1)]: d });
    expect(s[STARTERS.firstEntry]).toMatchObject({ done: true, date: earlier });
  });

  it('does not count a Health import as a first entry', () => {
    const d = { ...blankDay(), activities: [{ id: 'a1', type: 'walk', time: '09:00', note: '', imported: true } as Entry] };
    expect(starters({ [dayKey(2)]: d })[STARTERS.firstEntry].done).toBe(false);
  });

  it('drives the protocol milestone off protocolSetOn', () => {
    expect(starters({})[STARTERS.protocol].done).toBe(false);
    const dk = dayKey(3);
    expect(starters({}, dk)[STARTERS.protocol]).toMatchObject({ done: true, date: dk });
  });
});

describe('Gut milestones', () => {
  const streak = (kind: string) => {
    const days: DaysMap = {};
    for (let i = 7; i >= 1; i--) days[dayKey(i)] = { ...blankDay(), digestion: { movements: [{ id: `m${i}`, time: '09:00', kind }] } };
    const group = buildMilestoneGroups(buildMilestoneDays(days, ctx)).find((g) => g.title === 'Gut & symptoms')!;
    return group.items.find((it) => it.label === '7 consecutive days with a normal bowel movement')!;
  };

  it('counts a week of normal movements', () => {
    expect(streak('Formed').done).toBe(true);
  });

  it('does not award the streak to a week of diarrhea', () => {
    expect(streak('Diarrhea').done).toBe(false);
  });
});
