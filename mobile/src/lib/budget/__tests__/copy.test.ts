import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { BUDGET_HELP } from '../help';

/**
 * The copy rules, checked against the source rather than trusted to review.
 *
 * These are the ones that would be quietly undone by a well-meaning edit, and
 * each of them is load-bearing for an audience that reads this app on a bad
 * day. Comments are stripped first: the reasoning ABOVE the code is allowed to
 * use punctuation the copy is not.
 */
const DIRS = [
  join(__dirname, '..'),
  join(__dirname, '..', '..', '..', 'features', 'budget'),
];

function sources(): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  DIRS.forEach((dir) => {
    readdirSync(dir).forEach((f) => {
      if (!/\.tsx?$/.test(f) || f.endsWith('.test.ts')) return;
      out.push({ path: `${dir.split('/').pop()}/${f}`, text: readFileSync(join(dir, f), 'utf8') });
    });
  });
  return out;
}

/** Everything inside a quote, with comments removed. */
function strings(text: string): string[] {
  const noComments = text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join('\n');
  const out: string[] = [];
  // Backticks must not span a newline: a multi-line template in JSX is layout,
  // not prose, and a greedy match swallows whole components.
  const re = /'([^'\\\n]{4,})'|"([^"\\\n]{4,})"|`([^`\\\n]{4,})`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(noComments))) out.push(m[1] || m[2] || m[3]);
  // Only things that read like prose: at least two words with a space.
  return out.filter((s) => / [a-z]/.test(s) && !/^[a-z-]+$/.test(s));
}

const allStrings = () => sources().flatMap((f) => strings(f.text));
const helpText = Object.values(BUDGET_HELP).flatMap((h) => [h.what, h.why]);

describe('pacing copy', () => {
  it('uses no em dashes', () => {
    const bad = allStrings().filter((s) => s.includes('—'));
    expect(bad).toEqual([]);
    expect(helpText.filter((s) => s.includes('—'))).toEqual([]);
  });

  it('never grants or withholds permission', () => {
    // "At this pace" describes the arithmetic of the day. "You may" decides
    // for somebody what their body can do, which this app does not get to do.
    const bad = [...allStrings(), ...helpText].filter((s) =>
      /\byou (may|should|must|need to) \b/i.test(s));
    expect(bad).toEqual([]);
  });

  it('never makes a causal claim', () => {
    const bad = [...allStrings(), ...helpText].filter((s) =>
      /\b(will cause|causes|caused by|because you|due to your)\b/i.test(s));
    expect(bad).toEqual([]);
  });

  it('never treats an unspent budget as waste or a target', () => {
    // Rule 3: the budget is a ceiling, never a goal. Nothing may congratulate
    // filling it or imply that room left over was squandered.
    const bad = [...allStrings(), ...helpText].filter((s) =>
      /\b(goal|target|wasted|well done|great job|congratulations|streak)\b/i.test(s)
      && !/never a target|not a day wasted|never a goal/i.test(s));
    expect(bad).toEqual([]);
  });

  it('never scolds an overspend', () => {
    const bad = [...allStrings(), ...helpText].filter((s) =>
      /\b(you exceeded|too much|overdid|you went too|should have)\b/i.test(s));
    expect(bad).toEqual([]);
  });

  it('says credits are RECOVERY, and never that they merely eased the pace', () => {
    // The decision is that rest refunds, and the copy has to match the maths.
    // "Eased" describes a slower burn, which is the model we did NOT build.
    const all = allStrings();
    expect(all.some((s) => /recovery time/i.test(s))).toBe(true);
    expect(all.filter((s) => /\beased\b|slows the burn/i.test(s))).toEqual([]);
  });

  it('reads the outcome window as two days, never as tomorrow', () => {
    const tomorrow = [...allStrings(), ...helpText].filter((s) => /\btomorrow\b/i.test(s));
    // Two allowed uses, and neither is a verdict on a day: the suppressed
    // strip saying the CARD comes back, and the help copy stating the rule
    // itself. Anything else means an outcome was read off tomorrow alone.
    const stray = tomorrow.filter((s) =>
      !/resume tomorrow/i.test(s) && !/two days rather than tomorrow/i.test(s));
    expect(stray).toEqual([]);
  });

  it('states quantities in units the reader can picture', () => {
    // No percentages in anything the user reads. Minutes, bpm and steps only.
    const pct = allStrings().filter((s) => /\d\s*%|\bpercent\b/i.test(s));
    expect(pct).toEqual([]);
  });
});
