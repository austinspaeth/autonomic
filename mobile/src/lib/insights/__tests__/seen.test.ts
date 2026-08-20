/**
 * The unseen-findings dot's bookkeeping (../seen): ids in, ids out.
 *
 * The MMKV half degrades to module state under jest, which is enough to prove
 * the stamp/read round trip; the dot's derivation itself is pure.
 */
import { reportFindingIds, seenFindingIds, stampInsightsSeen, unseenIds } from '../seen';

const report = (over: Partial<{
  correlations: { id: string }[];
  early: { id: string }[];
  change: { id: string; kind: string } | null;
}> = {}) => ({
  correlations: [{ id: 'a|rmssd|0' }],
  early: [],
  change: null,
  ...over,
});

describe('reportFindingIds', () => {
  it('collects correlations, early signals and the change card', () => {
    expect(reportFindingIds(report({
      early: [{ id: 'b|score|0' }],
      change: { id: 'onset:c|rmssd', kind: 'onset' },
    }))).toEqual(['a|rmssd|0', 'b|score|0', 'onset:c|rmssd']);
  });

  it('never counts the fabricated welcome card', () => {
    expect(reportFindingIds(report({ change: { id: 'welcome', kind: 'welcome' } })))
      .toEqual(['a|rmssd|0']);
  });
});

describe('unseenIds', () => {
  it('a new id lights, a seen id does not', () => {
    expect(unseenIds(['a', 'b'], ['a'])).toEqual(['b']);
    expect(unseenIds(['a'], ['a', 'old'])).toEqual([]);
    expect(unseenIds([], ['a'])).toEqual([]);
  });
});

describe('the stamp round trip', () => {
  it('replaces the set, so a vanished finding must re-earn its way back', () => {
    stampInsightsSeen(['a', 'b']);
    expect(seenFindingIds()).toEqual(['a', 'b']);
    stampInsightsSeen(['c']);
    expect(seenFindingIds()).toEqual(['c']);
    expect(unseenIds(['a'], seenFindingIds() || [])).toEqual(['a']);
  });
});
