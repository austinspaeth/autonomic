/**
 * The skeleton's measuring samples, against what the engine really produces.
 *
 * These cover the skeleton's ONCE-PER-INSTALL fallback, the path taken before any card
 * has been measured. After that the placeholder uses the heights it remembered from
 * `onLayout` and none of these samples is consulted.
 *
 * On that first open it reserves space by laying an invisible copy of a SAMPLE string
 * in the real style behind each block, so the sample's wrapped length is what decides
 * whether the page jumps. Too short under-reserves and the content pushes everything
 * down; too long over-reserves and the page settles up by a few pixels, which is far
 * less visible.
 *
 * The demo month is the fixture, since that is exactly what a first-time user's
 * skeleton is measured against. It cannot cover every journal — somebody's custom
 * supplement name may be longer than any sample — which is why the samples err long.
 */
import { todayKey } from '../../dates';
import { demoState } from '../../demo';
import { VISIBLE_CORRELATIONS, buildInsights } from '../index';
import type { AppState } from '../../types';
import { SAMPLE, VISIBLE_ROWS } from '../../../features/insights/style';

const blank = { version: 1, settings: {}, profile: {}, meta: {}, days: {} } as unknown as AppState;
const report = buildInsights(demoState(blank), todayKey());

/** Sample must reserve at least the real string's wrapped height. */
const atLeast = (sample: string, real: string) => {
  expect(real.length).toBeGreaterThan(0);
  expect(sample.length).toBeGreaterThanOrEqual(real.length);
};

describe('skeleton samples cover the paragraphs they reserve', () => {
  it('reserves the headline card body', () => {
    atLeast(SAMPLE.body, report.change!.body);
  });

  it('reserves the tallest observation body any probe can produce', () => {
    // Every probe's copy has to fit, not just the one that happened to win.
    expect(report.observations.length).toBeGreaterThan(0);
    report.observations.forEach((o) => atLeast(SAMPLE.obsBody, o.body));
  });

  it('reserves a correlation row and a trend-watch row', () => {
    report.correlations.slice(0, VISIBLE_CORRELATIONS).forEach((c) => atLeast(SAMPLE.rowNote, c.note));
    report.watch.forEach((t) => atLeast(SAMPLE.watchSub, t.sub));
  });

  it('carries no samples it no longer measures with', () => {
    // Dead samples are worse than none: they look like a guarantee and give one.
    expect(Object.keys(SAMPLE).sort()).toEqual(['body', 'obsBody', 'rowNote', 'watchSub']);
  });
});

describe('the skeleton draws as many rows as the list does', () => {
  it('shows the same number of correlation rows', () => {
    expect(VISIBLE_ROWS).toBe(VISIBLE_CORRELATIONS);
    expect(report.correlations.length).toBeGreaterThan(0);
  });
});
