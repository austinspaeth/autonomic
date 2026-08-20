/**
 * The AI hand-off for the findings themselves.
 *
 * Every other prompt in the app ships raw data and asks for analysis. This one is
 * different and more interesting: the analysis is already done on device, so what
 * goes out is the FINDINGS plus the data behind them, and the ask is for a second
 * opinion on them. That is the one thing a language model can do here that the
 * device cannot, and it is why this prompt spends most of its length telling the
 * model what NOT to do.
 *
 * The instructions are deliberately adversarial. A model handed twenty
 * correlations and asked to interpret them will confabulate mechanisms for all
 * twenty, which is precisely the failure the whole engine is built to avoid — so
 * it is asked to find the confounds, name which findings are probably artefacts of
 * the same underlying trend, and say plainly when a finding is not worth acting
 * on.
 *
 * Pure: no store, no MMKV, no expo, no React.
 */
import { makeSectionRenderer } from '../analysis/reports';
import type { ScoreContext } from '../scoring';
import type { AppState } from '../types';
import type { Correlation } from './correlate';
import type { BiggestChange } from './change';

/** Days of raw data sent alongside the findings, so the model can check them. */
const CONTEXT_DAYS = 90;

/** One line per finding, in the order the screen shows them. */
function findingLines(list: Correlation[]): string {
  return list.map((c, i) => {
    const lag = c.lag ? ' (next day)' : '';
    return `${i + 1}. ${c.driver} -> ${c.metric}${lag} | effect ${c.rText} | ${c.detail} | ${c.note} | confidence ${c.confidence} (${c.pips}/5) | direction: ${c.good ? 'favourable' : 'unfavourable'}`;
  }).join('\n');
}

/**
 * Ask a model to review the correlations the app found.
 *
 * `change` is included when there is one, because the headline before/after is
 * the finding most likely to be over-read and the one most worth challenging.
 */
export function buildCorrelationsPrompt(
  state: AppState,
  ctx: ScoreContext,
  list: Correlation[],
  change: BiggestChange | null,
): { prompt: string; rangeText: string } {
  // Its own window rather than one of the report ranges: the model should see the
  // evidence the findings actually came from, and only days that exist.
  const keys = Object.keys(state.days).sort().slice(-CONTEXT_DAYS);
  const render = makeSectionRenderer(state, ctx);
  const rangeText = keys.length ? `${keys[0]} to ${keys[keys.length - 1]}` : 'no data';

  const headline = change && change.kind !== 'welcome'
    ? `\nTHE APP'S HEADLINE FINDING:\n${change.headline}\n${change.body}\nBefore ${change.beforeText}, after ${change.afterText}, confidence ${change.confidence} (${change.pips}/5).\n`
    : '';

  return {
    rangeText,
    prompt: `You are reviewing statistical findings that an offline health app computed from one person's own journal. They have dysautonomia-type symptoms (POTS, long COVID, ME/CFS style presentations) and log readings, sleep, supplements, activities, symptoms, triggers and notes by hand.

HOW THESE FINDINGS WERE PRODUCED, so you can judge them properly:
Each is a rank-based association over a window of up to 180 days. Binary drivers (took a supplement, logged a trigger) use a tie-corrected Mann-Whitney test reported as a rank-biserial correlation; continuous drivers use Spearman's rho. Group medians are reported, never means. Every driver needed at least 8 days on each side, or 12 paired days. All tests ran as ONE family through a Benjamini-Hochberg false-discovery correction at q = 0.05, and only survivors are listed. Findings whose effect size fell below 0.2 were dropped, as were comparisons where both medians sat inside a healthy target band. A driver is only tested inside the span where its whole category was being logged, so a supplement started in month four is not compared against months one to three.

WHAT THIS MEANS: the list is unlikely to be statistical noise. It is very likely to contain confounding. That distinction is the whole point of asking you.
${headline}
CORRELATIONS FOUND (strongest first):
${findingLines(list) || '(none)'}

WHAT TO DO WITH THIS. Be sceptical and be specific. Do NOT invent a plausible mechanism for every line; most of these will share one cause.
1. SHARED CAUSE. Say which findings are probably the same underlying thing seen from different angles, and what that thing most likely is. If the person's condition was simply improving across the window, most drivers that also improved will correlate with most outcomes that improved, and you should say so plainly.
2. REVERSE CAUSATION. For each finding worth discussing, ask which direction is more plausible. Someone logs fewer symptoms on good days rather than having a good day because they logged fewer symptoms. Feeling well is often what allows the activity, not the result of it.
3. WHAT IS ACTUALLY ACTIONABLE. Name at most three findings worth a deliberate test, and describe the test in terms this person can run: what to change, for how long, and what to watch. Respect that exertion is a risk for this population and that a test must not require feeling well to complete.
4. WHAT TO IGNORE. Name the findings you think are artefacts and say why in one line each.
5. WHAT IS MISSING. Given the data below, what would most improve the next round of findings.

RULES: Base everything on the data provided. Do not assume a diagnosis, medication, age or sex that is not present. Report associations as associations. Note where a doctor should be involved for anything touching medication or a therapeutic dose. Do not use em dashes; use commas, colons, parentheses or separate sentences.

THE UNDERLYING DATA (${rangeText}), so you can check the findings rather than take them on trust:

${render(keys, ['scores', 'hrv', 'rhr', 'bp', 'sleep', 'activities', 'triggers', 'meds', 'supplements', 'symptoms', 'digestion', 'cleanDays', 'notes'])}`,
  };
}
