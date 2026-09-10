import { budgetDelta, MIN_DELTA_MIN } from '../delta';
import type { SpendRow } from '../burn';

const row = (source: SpendRow['source'], effortMin: number, over?: Partial<SpendRow>): SpendRow => ({
  source, label: source, detail: '', effortMin, share: 0, ...over,
});

const hr = (min: number) => row('hr', min, { label: 'Minutes HR above 95 bpm' });

describe('budgetDelta', () => {
  it('says nothing about a move under a minute', () => {
    expect(budgetDelta([hr(10)], [hr(10.4)], 0.4)).toBeNull();
  });

  it('names the row that gained, in the threshold the row itself states', () => {
    const d = budgetDelta([hr(10)], [hr(24)], 14);
    expect(d).toEqual({ min: 14, dir: 'up', text: '+14m · HR above 95 bpm' });
  });

  it('reads a bigger credit as minutes bought back', () => {
    const d = budgetDelta(
      [hr(30), row('credits', -5)],
      [hr(30), row('credits', -17)],
      -12,
    );
    expect(d!.dir).toBe('down');
    expect(d!.text).toBe('-12m · recovery time');
  });

  it('names the biggest row moving the way the bar went, not the net', () => {
    // Twelve minutes above the line and four given back in the same read: the
    // net is +8 and the answer is still the heart rate.
    const d = budgetDelta(
      [hr(30), row('credits', -5)],
      [hr(42), row('credits', -9)],
      8,
    );
    expect(d).toEqual({ min: 8, dir: 'up', text: '+8m · HR above 95 bpm' });
  });

  it('lets a new row speak for itself', () => {
    const d = budgetDelta([hr(20)], [hr(20), row('upright', 9)], 9);
    expect(d!.text).toBe('+9m · upright time');
  });

  it('names the newest logged activity rather than the category', () => {
    const member = { entryId: 'a', label: 'Bike ride', minutes: 40, effortMin: 40, credit: false, assumed: false };
    const d = budgetDelta(
      [],
      [row('activities', 40, { label: 'Logged activities', members: [member] })],
      40,
    );
    expect(d!.text).toBe('+40m · Bike ride');
  });

  it('is silent when nothing it can name moved', () => {
    // The envelope changed, not the spend: there is no row to point at.
    expect(budgetDelta([hr(20)], [hr(20)], 0)).toBeNull();
  });

  it('rounds and formats past the hour', () => {
    expect(budgetDelta([hr(0)], [hr(75.4)], 75.4)!.text).toBe('+1h 15m · HR above 95 bpm');
  });

  it('MIN_DELTA_MIN is the bar on both the net and the row', () => {
    expect(MIN_DELTA_MIN).toBe(1);
    // A net of two minutes made of two one-minute rows still names one.
    const d = budgetDelta([hr(1), row('upright', 1)], [hr(2.2), row('upright', 2.2)], 2.4);
    expect(d!.dir).toBe('up');
  });
});
