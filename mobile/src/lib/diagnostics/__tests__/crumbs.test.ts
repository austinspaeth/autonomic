import {
  MAX_CRUMBS, TRAIL_CRUMBS, TRAIL_GRACE_MS, cleanCrumb, emptyTrail, formatWhere, parseTrail, pushCrumb,
  trailCovers,
} from '../crumbs';
import { MAX_FAULT_MSG, redactMessage } from '../../errorReport';

const T0 = 1_760_000_000_000;

describe('pushCrumb', () => {
  it('keeps crumbs in order, newest last', () => {
    let t = emptyTrail(T0);
    t = pushCrumb(t, 'launch', T0);
    t = pushCrumb(t, 'tab:journal', T0 + 10);
    t = pushCrumb(t, 'sheet:EntryForm', T0 + 20);
    expect(t.crumbs.map((c) => c.s)).toEqual(['launch', 'tab:journal', 'sheet:EntryForm']);
  });

  it('collapses a repeat of the newest crumb and moves its time up', () => {
    let t = pushCrumb(emptyTrail(T0), 'tab:journal', T0);
    t = pushCrumb(t, 'tab:journal', T0 + 500);
    expect(t.crumbs).toEqual([{ t: T0 + 500, s: 'tab:journal' }]);
    // A repeat that is not adjacent is a real second visit.
    t = pushCrumb(t, 'tab:analysis', T0 + 600);
    t = pushCrumb(t, 'tab:journal', T0 + 700);
    expect(t.crumbs.map((c) => c.s)).toEqual(['tab:journal', 'tab:analysis', 'tab:journal']);
  });

  it('drops the oldest past the cap', () => {
    let t = emptyTrail(T0);
    for (let i = 0; i < MAX_CRUMBS + 5; i += 1) t = pushCrumb(t, `c${i}`, T0 + i);
    expect(t.crumbs).toHaveLength(MAX_CRUMBS);
    expect(t.crumbs[0].s).toBe('c5');
    expect(t.crumbs[MAX_CRUMBS - 1].s).toBe(`c${MAX_CRUMBS + 4}`);
  });

  it('never lets a crumb carry anything but a name', () => {
    expect(cleanCrumb('sheet:EntryForm')).toBe('sheet:EntryForm');
    expect(cleanCrumb('note: "ate 3 eggs @ 9am"')).toBe('note:ate3eggs9am');
    expect(cleanCrumb('x'.repeat(100))).toHaveLength(32);
    expect(cleanCrumb('')).toBe('?');
    expect(cleanCrumb('   ')).toBe('?');
  });
});

describe('trailCovers', () => {
  const trail = pushCrumb(pushCrumb(emptyTrail(T0), 'launch', T0), 'tab:journal', T0 + 60_000);

  it('claims a moment inside the session, and a little after its last crumb', () => {
    expect(trailCovers(trail, T0 + 30_000)).toBe(true);
    expect(trailCovers(trail, T0 + 60_000 + TRAIL_GRACE_MS)).toBe(true);
  });

  it('refuses a moment before the session or long after it went quiet', () => {
    expect(trailCovers(trail, T0 - 1)).toBe(false);
    expect(trailCovers(trail, T0 + 60_000 + TRAIL_GRACE_MS + 1)).toBe(false);
  });

  it('refuses when there is nothing to compare', () => {
    expect(trailCovers(null, T0)).toBe(false);
    expect(trailCovers(trail, undefined)).toBe(false);
    expect(trailCovers(trail, NaN)).toBe(false);
    // A trail with no crumbs still has a start.
    expect(trailCovers(emptyTrail(T0), T0 + 1000)).toBe(true);
  });
});

describe('formatWhere', () => {
  it('reads as the path that led to the crash', () => {
    let t = emptyTrail(T0);
    ['launch', 'tab:journal', 'sheet:EntryForm', 'bg', 'fg'].forEach((s, i) => { t = pushCrumb(t, s, T0 + i); });
    expect(formatWhere('uncaught.fatal', t))
      .toBe('uncaught.fatal @ launch > tab:journal > sheet:EntryForm > bg > fg');
  });

  it('carries only the newest crumbs, so truncation can never eat the end', () => {
    let t = emptyTrail(T0);
    for (let i = 0; i < MAX_CRUMBS; i += 1) t = pushCrumb(t, `c${i}`, T0 + i);
    const line = formatWhere('native.crash', t);
    expect(line).toContain(`c${MAX_CRUMBS - 1}`);
    expect(line).not.toContain('c0 ');
    expect(line.split(' > ')).toHaveLength(TRAIL_CRUMBS);
  });

  it('marks a trail matched by session rather than by time', () => {
    const t = pushCrumb(emptyTrail(T0), 'tab:journal', T0);
    expect(formatWhere('native.crash', t, { approx: true })).toBe('native.crash @ ~tab:journal');
  });

  it('says unknown rather than inventing a path', () => {
    expect(formatWhere('uncaught.fatal', null)).toBe('uncaught.fatal @ unknown');
    expect(formatWhere('uncaught.fatal', emptyTrail(T0))).toBe('uncaught.fatal @ unknown');
  });

  it('survives the fault redaction with every crumb intact', () => {
    // The row is sent through `reportFault`, so it meets the same rules every
    // message does. Crumb names must not look like ids or digit runs to it.
    let t = emptyTrail(T0);
    ['launch', 'tab:journal', 'sheet:HrvResults', 'hrv:running', 'health:found', 'sheet:GiveawayEntrySheet', 'bg', 'fg']
      .forEach((s, i) => { t = pushCrumb(t, s, T0 + i); });
    const line = formatWhere('uncaught.fatal', t);
    expect(redactMessage(line)).toBe(line);
    expect(line.length).toBeLessThanOrEqual(MAX_FAULT_MSG);
  });
});

describe('parseTrail', () => {
  it('round-trips what the shell writes', () => {
    const t = pushCrumb(pushCrumb(emptyTrail(T0), 'launch', T0), 'tab:journal', T0 + 1);
    expect(parseTrail(JSON.stringify(t))).toEqual(t);
  });

  it('is total over anything the flags store could hold', () => {
    expect(parseTrail(null)).toBeNull();
    expect(parseTrail('')).toBeNull();
    expect(parseTrail('{')).toBeNull();
    expect(parseTrail('[]')).toBeNull();
    expect(parseTrail('{"crumbs":[]}')).toBeNull();
    expect(parseTrail(`{"start":${T0},"crumbs":[1,null,{"t":"x","s":"y"},{"t":5,"s":"ok"}]}`))
      .toEqual({ start: T0, crumbs: [{ t: 5, s: 'ok' }] });
  });
});
