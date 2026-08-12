/**
 * The correlations prompt. Its job is to invite scepticism rather than
 * interpretation, so these pin the instructions that do that work: a model handed
 * twenty associations and asked to explain them will invent twenty mechanisms.
 */
import { todayKey } from '../../dates';
import { demoState } from '../../demo';
import { buildInsights } from '../index';
import { buildCorrelationsPrompt } from '../prompt';
import type { AppState } from '../../types';

const blank = { version: 1, settings: {}, profile: {}, meta: {}, days: {} } as unknown as AppState;
const state = demoState(blank);
const report = buildInsights(state, todayKey());
const { prompt, rangeText } = buildCorrelationsPrompt(state, {}, report.correlations, report.change);

describe('buildCorrelationsPrompt', () => {
  it('lists every finding with its effect, coverage and confidence', () => {
    expect(report.correlations.length).toBeGreaterThan(0);
    report.correlations.forEach((c) => expect(prompt).toContain(c.driver));
    expect(prompt).toMatch(/effect [+−]\d\.\d\d \| .* \| .* \| confidence \w/);
  });

  it('explains how the statistics were produced, so the model can judge them', () => {
    expect(prompt).toContain('Mann-Whitney');
    expect(prompt).toContain("Spearman's rho");
    expect(prompt).toContain('Benjamini-Hochberg');
    expect(prompt).toContain('q = 0.05');
    expect(prompt).toContain('Group medians are reported, never means');
  });

  it('asks for confounds and reverse causation, not mechanisms', () => {
    expect(prompt).toContain('SHARED CAUSE');
    expect(prompt).toContain('REVERSE CAUSATION');
    expect(prompt).toContain('WHAT TO IGNORE');
    expect(prompt).toMatch(/Do NOT invent a plausible mechanism/);
  });

  it('names the population risk so a proposed test is safe to run', () => {
    expect(prompt).toMatch(/exertion is a risk/i);
    expect(prompt).toMatch(/must not require feeling well/i);
  });

  it('follows the app copy rules and ships the underlying data', () => {
    expect(prompt).toContain('Do not use em dashes');
    expect(prompt).not.toContain('—');
    expect(prompt).toContain('HRV READINGS');
    expect(prompt).toContain('DAILY NOTES');
    expect(rangeText).toMatch(/^\d{4}-\d{2}-\d{2} to \d{4}-\d{2}-\d{2}$/);
  });

  it('carries the headline change so the most over-read finding gets challenged', () => {
    expect(prompt).toContain("THE APP'S HEADLINE FINDING");
    expect(prompt).toContain(report.change!.headline);
  });

  it('never claims the welcome card is a real finding', () => {
    const demo = buildInsights(state, todayKey(), { demo: true });
    const out = buildCorrelationsPrompt(state, {}, demo.correlations, demo.change).prompt;
    expect(out).not.toContain('You downloaded this app');
  });

  it('survives an empty finding list', () => {
    const out = buildCorrelationsPrompt(state, {}, [], null).prompt;
    expect(out).toContain('(none)');
  });
});
