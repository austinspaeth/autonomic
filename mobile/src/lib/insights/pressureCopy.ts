/**
 * The sentences the barometric pressure card and the Journal's warning say.
 *
 * Beside the engine rather than in a component, for the reason every other claim's
 * copy is: a sentence about somebody's body belongs next to the numbers that
 * justify it. Associational throughout. "Runs lower on low pressure days", never
 * "low pressure lowers".
 *
 * Pure.
 */
import { TREND_METRICS } from '../trends';
import { midSentence, type Correlation } from './correlate';

/** "8 ms" — the gap between the two groups, unsigned, in the metric's unit. */
function gap(c: Correlation): string {
  const def = TREND_METRICS[c.outcome];
  return `${def.fmt(Math.abs(c.high - c.low))}${c.unit ? ` ${c.unit}` : ''}`;
}

const dir = (c: Correlation) => (c.high > c.low ? 'higher' : 'lower');

/** The card's headline: "Your RMSSD runs lower on low pressure days". */
export function pressureHeadline(c: Correlation): string {
  const m = midSentence(c.metric);
  return c.lag
    ? `Your ${m} runs ${dir(c)} the day after low pressure`
    : `Your ${m} runs ${dir(c)} on low pressure days`;
}

/** The Journal's one sentence, carrying its own numbers. */
export function pressureWarning(c: Correlation): string {
  const m = midSentence(c.metric);
  return c.lag
    ? `Barometric pressure is low today. The day after, your ${m} tends to run ${gap(c)} ${dir(c)}.`
    : `Barometric pressure is low today. On days like this your ${m} runs ${gap(c)} ${dir(c)}.`;
}

/** The notification's body: the Journal sentence without its first half, which
 *  is the notification's title. */
export function pressureNotificationBody(c: Correlation): string {
  const m = midSentence(c.metric);
  return c.lag
    ? `The day after, your ${m} tends to run ${gap(c)} ${dir(c)}.`
    : `On days like this your ${m} runs ${gap(c)} ${dir(c)}.`;
}
