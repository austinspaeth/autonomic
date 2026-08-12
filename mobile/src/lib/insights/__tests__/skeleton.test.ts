/**
 * The skeleton's measuring samples, against what the engine really produces.
 *
 * `TextGhost` reserves height by laying its block over an invisible copy of a
 * SAMPLE string in the real style, so the sample's wrapped length is what decides
 * whether the page jumps when the content lands. A sample that is too short
 * under-reserves and the content pushes everything down; too long over-reserves and
 * the page settles up by a few pixels, which is far less visible.
 *
 * So these assert the samples are at least as long as the real strings, using the
 * demo month, which is exactly what a first-time user's skeleton is measured
 * against. They cannot cover every possible journal (somebody's custom supplement
 * name may be longer than any sample), which is why the samples err long.
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

describe('skeleton samples cover the headline card', () => {
  it('reserves the headline and its body', () => {
    const c = report.change!;
    atLeast(SAMPLE.headline, c.headline);
    atLeast(SAMPLE.body, c.body);
  });

  it('reserves the before/after values and the confidence word', () => {
    const c = report.change!;
    atLeast(SAMPLE.barValue, c.beforeText);
    atLeast(SAMPLE.barValue, c.afterText);
    atLeast(SAMPLE.confWord, c.confidence);
  });
});

describe('skeleton samples cover the visible correlation rows', () => {
  const visible = report.correlations.slice(0, VISIBLE_CORRELATIONS);

  it('has rows to check', () => {
    expect(visible.length).toBeGreaterThan(0);
  });

  it('reserves the r value and the detail line', () => {
    visible.forEach((c) => {
      atLeast(SAMPLE.rValue, c.rText);
      atLeast(SAMPLE.rowNote, `${c.detail} · ${c.note}`);
    });
  });

  it('shows the same number of rows the list does', () => {
    expect(VISIBLE_ROWS).toBe(VISIBLE_CORRELATIONS);
  });
});

describe('skeleton samples cover the observation rows', () => {
  it('reserves the tallest body the probes can produce', () => {
    // The body is the tall part: three wrapped lines at 12.5/18. Every probe's copy
    // has to fit, not just the one that happened to win.
    expect(report.observations.length).toBeGreaterThan(0);
    report.observations.forEach((o) => {
      atLeast(SAMPLE.obsTitle, o.title);
      atLeast(SAMPLE.obsBody, o.body);
    });
  });
});

describe('skeleton samples cover the trend watch rows', () => {
  it('reserves the title, subtitle and value', () => {
    expect(report.watch.length).toBeGreaterThan(0);
    report.watch.forEach((t) => {
      atLeast(SAMPLE.watchTitle, t.title);
      atLeast(SAMPLE.watchSub, t.sub);
      atLeast(SAMPLE.watchValue, t.value);
    });
  });
});
