import {
  EMPTY_MEMORY, MAX_SHOWS, RESHOW_GAP_DAYS, noteFailure, noteShown, parseMemory, suggestionDue, weakSensorFor,
} from '../strapSuggest';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 26);

describe('strap suggestion pacing', () => {
  it('never answers a first failure', () => {
    expect(suggestionDue(noteFailure(EMPTY_MEMORY), T0, false)).toBe(false);
  });

  it('answers the second', () => {
    expect(suggestionDue(noteFailure(noteFailure(EMPTY_MEMORY)), T0, false)).toBe(true);
  });

  it('never tells a strap owner to buy a strap', () => {
    expect(suggestionDue(noteFailure(noteFailure(EMPTY_MEMORY)), T0, true)).toBe(false);
  });

  it('needs a quiet week and a fresh run of failures before the second showing', () => {
    let m = noteShown(noteFailure(noteFailure(EMPTY_MEMORY)), T0);
    m = noteFailure(noteFailure(m));
    expect(suggestionDue(m, T0 + DAY, false)).toBe(false);
    expect(suggestionDue(m, T0 + RESHOW_GAP_DAYS * DAY, false)).toBe(true);
    expect(suggestionDue(noteShown(EMPTY_MEMORY, T0), T0 + 30 * DAY, false)).toBe(false);
  });

  it(`is shown at most ${MAX_SHOWS} times, ever`, () => {
    let m = EMPTY_MEMORY;
    let shows = 0;
    for (let d = 0; d < 365; d++) {
      m = noteFailure(m);
      if (suggestionDue(m, T0 + d * DAY, false)) { m = noteShown(m, T0 + d * DAY); shows++; }
    }
    expect(shows).toBe(MAX_SHOWS);
  });

  it('reads an unreadable memory as a fresh install', () => {
    expect(parseMemory('{nope')).toEqual(EMPTY_MEMORY);
    expect(parseMemory(JSON.stringify({ failuresSinceShown: -3, shown: 'x' }))).toEqual(EMPTY_MEMORY);
  });

  it('speaks only about the two weak sensors', () => {
    expect(weakSensorFor('camera')).toBe('camera');
    expect(weakSensorFor('garmin')).toBe('garmin');
    expect(weakSensorFor('polar')).toBeNull();
    expect(weakSensorFor('watch')).toBeNull();
  });
});
