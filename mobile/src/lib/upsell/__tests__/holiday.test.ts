import {
  HOLIDAY_END_MS, HOLIDAY_LABEL, HOLIDAY_OFFER_ENABLED, HOLIDAY_START_MS,
  emptyHolidayMemory, holidayCountdown, holidayVerdict, holidayWindowOpen,
} from '../holiday';

/** Noon Eastern on each day of the window, and the instants either side. */
const FRI = Date.parse('2026-11-27T12:00:00-05:00');
const SAT = Date.parse('2026-11-28T12:00:00-05:00');
const MON = Date.parse('2026-11-30T12:00:00-05:00');
const BEFORE = Date.parse('2026-11-26T23:59:59-05:00');
const AFTER = Date.parse('2026-12-01T00:00:00-05:00');

const ask = (over: Partial<Parameters<typeof holidayVerdict>[0]> = {}) =>
  holidayVerdict({ nowMs: FRI, tier: 'free', memory: emptyHolidayMemory(), ...over });

const raised = (atMs = FRI) => ({ shownAtMs: atMs });

describe('the window', () => {
  it('is the four days from Black Friday to the end of Cyber Monday, ET', () => {
    expect(HOLIDAY_START_MS).toBe(Date.parse('2026-11-27T05:00:00Z'));
    expect(HOLIDAY_END_MS).toBe(Date.parse('2026-12-01T04:59:59.999Z'));
    // Four days inclusive, to the millisecond.
    expect(HOLIDAY_END_MS - HOLIDAY_START_MS).toBe(4 * 86_400_000 - 1);
  });

  it('is inclusive at both ends and closed either side', () => {
    expect(holidayWindowOpen(HOLIDAY_START_MS)).toBe(true);
    expect(holidayWindowOpen(HOLIDAY_END_MS)).toBe(true);
    expect(holidayWindowOpen(BEFORE)).toBe(false);
    expect(holidayWindowOpen(AFTER)).toBe(false);
  });

  /* A device clock is not what decides this. The constants carry an explicit
     offset, so a phone in another zone gets exactly the same four days — the
     promotion has one end, not one per timezone. */
  it('does not move with the host timezone', () => {
    const berlinNoonMonday = Date.parse('2026-11-30T12:00:00+01:00');
    expect(holidayWindowOpen(berlinNoonMonday)).toBe(true);
    const berlinTuesdayMorning = Date.parse('2026-12-01T11:00:00+01:00');
    expect(holidayWindowOpen(berlinTuesdayMorning)).toBe(false);
  });
});

describe('holidayCountdown', () => {
  const read = (ms: number) => holidayCountdown(ms).map((c) => `${c.v}${c.l}`).join(' ');

  it('counts down to the end of the window', () => {
    // Noon on Black Friday: three and a half days to go.
    expect(read(FRI)).toBe('3DAYS 11HRS 59MIN 59SEC');
    expect(read(MON)).toBe('0DAYS 11HRS 59MIN 59SEC');
  });

  /* Hours, minutes and seconds are padded so the row cannot reflow every
     second; days are not, because the window is four days and a leading zero
     there reads as a placeholder. */
  it('pads the two-digit fields and not the days', () => {
    const cells = holidayCountdown(Date.parse('2026-11-30T23:59:04-05:00'));
    expect(cells.map((c) => c.v)).toEqual(['0', '00', '00', '55']);
  });

  /* The question the card has to get right: it counts down to 11:59pm Cyber
     Monday ET, from wherever the reader's phone happens to be. Both of these
     are the SAME instant written in two zones, and the countdown is a
     difference of absolute epoch ms, so it cannot disagree with itself. */
  it('reaches zero at 11:59pm ET on the Monday, in every timezone', () => {
    expect(read(Date.parse('2026-11-27T00:00:00-05:00'))).toBe('3DAYS 23HRS 59MIN 59SEC');
    expect(read(Date.parse('2026-11-30T23:00:00-05:00'))).toBe('0DAYS 00HRS 59MIN 59SEC');
    expect(read(Date.parse('2026-11-30T23:59:59-05:00'))).toBe('0DAYS 00HRS 00MIN 00SEC');
    // 23:00 ET on the Monday, as a Berlin phone and a Los Angeles phone see it.
    expect(read(Date.parse('2026-12-01T05:00:00+01:00'))).toBe('0DAYS 00HRS 59MIN 59SEC');
    expect(read(Date.parse('2026-11-30T20:00:00-08:00'))).toBe('0DAYS 00HRS 59MIN 59SEC');
  });

  /* The clock is read once a second and the window can close under a card that
     is on screen; it is taken down on the next render, and until then it must
     never show a negative figure. */
  it('floors at zero past the end of the window', () => {
    expect(holidayCountdown(AFTER).map((c) => c.v)).toEqual(['0', '00', '00', '00']);
  });
});

describe('holidayVerdict', () => {
  it('is on, and the label is what the copy and the tests agree on', () => {
    expect(HOLIDAY_OFFER_ENABLED).toBe(true);
    expect(HOLIDAY_LABEL).toBe('Black Friday');
  });

  it('raises for a free install inside the window, claiming once', () => {
    expect(ask()).toEqual({ ok: true, claim: true });
  });

  /* The deliberate difference from ./founder (trial only) and ./annual (free
     only): a seasonal sale is not an argument about where somebody is in their
     trial, and splitting the window by tier would hide a promotion the app is
     running from half the audience. */
  it('raises for a trial install too, and never for a subscriber', () => {
    expect(ask({ tier: 'trial' })).toEqual({ ok: true, claim: true });
    expect(ask({ tier: 'pro' })).toEqual({ ok: false, reason: 'already-pro' });
  });

  it('says nothing before the window or after it', () => {
    expect(ask({ nowMs: BEFORE })).toEqual({ ok: false, reason: 'before-window' });
    expect(ask({ nowMs: AFTER })).toEqual({ ok: false, reason: 'window-closed' });
  });

  it('is over for good once dismissed, on every later day of the window', () => {
    const m = { ...raised(), dismissed: true };
    for (const t of [FRI, SAT, MON]) {
      expect(holidayVerdict({ nowMs: t, tier: 'free', memory: m })).toEqual({ ok: false, reason: 'dismissed' });
    }
  });

  /* The user's requirement, and the ../review/card rule: every gate below the
     standing shortcut is about whether to START asking, so a card already on
     screen is never withdrawn by a bad day arriving under it. */
  describe('once raised, it stands', () => {
    it('renders on each later day of the window without re-claiming', () => {
      for (const t of [FRI, SAT, MON, HOLIDAY_END_MS]) {
        expect(holidayVerdict({ nowMs: t, tier: 'free', memory: raised() })).toEqual({ ok: true, claim: false });
      }
    });

    it('is not taken down by a downturn, a crash alert or an open sheet', () => {
      for (const over of [{ downturn: true }, { crashAlertFiredToday: true }, { sheetOpen: true }, { codeAccess: true }]) {
        expect(ask({ memory: raised(), ...over })).toEqual({ ok: true, claim: false });
      }
    });

    it('still goes away when the window closes or a subscription arrives', () => {
      expect(ask({ memory: raised(), nowMs: AFTER })).toEqual({ ok: false, reason: 'window-closed' });
      expect(ask({ memory: raised(), tier: 'pro' })).toEqual({ ok: false, reason: 'already-pro' });
    });
  });

  /* Four days, so a bad moment costs an hour rather than the promotion: none of
     these writes anything, and the next calm open raises the card. */
  describe('bad moments defer the first raise', () => {
    it.each([
      ['sheet-open', { sheetOpen: true }],
      ['crash-alert-today', { crashAlertFiredToday: true }],
      ['downturn', { downturn: true }],
      ['code-access', { codeAccess: true }],
    ])('%s', (reason, over) => {
      expect(ask(over)).toEqual({ ok: false, reason });
    });

    it('raises on a later, calmer moment in the same window', () => {
      expect(ask({ nowMs: MON, downturn: false })).toEqual({ ok: true, claim: true });
    });
  });

  /* This offer TAKES PRECEDENCE, so unlike ./founder it has no "another card is
     up" input at all — the other two stand down to it, through
     `holidayOwnsSlot` in ./holidayMemory. There is nothing here that another
     surface can refuse it with, and the type is what pins that: adding one
     would not compile against this call. */
  it('turns down the four it does refuse for, and nothing else', () => {
    const reasons = new Set<string>();
    for (const over of [{}, { tier: 'pro' as const }, { nowMs: BEFORE }, { nowMs: AFTER },
      { memory: { dismissed: true } }, { sheetOpen: true }, { crashAlertFiredToday: true },
      { downturn: true }, { codeAccess: true }]) {
      const v = ask(over);
      if (!v.ok) reasons.add(v.reason);
    }
    expect([...reasons].sort()).toEqual([
      'already-pro', 'before-window', 'code-access', 'crash-alert-today',
      'dismissed', 'downturn', 'sheet-open', 'window-closed',
    ]);
  });
});
