/**
 * The pacing sheet's help copy.
 *
 * Every line here follows the same three rules the rest of the feature does:
 * associational never causal, the user's own log rather than a population, and
 * a unit the reader can picture. Nothing here grants permission — the app
 * describes what the arithmetic of the day says, and the reader decides.
 */
import type { HelpContent } from '../help';

export const BUDGET_HELP: Record<'today' | 'spend' | 'why' | 'accuracy', HelpContent> = {
  today: {
    what: 'An estimate of how much effort today can absorb, in minutes, and how much of it the day has used so far. A minute of moderate effort counts as one; harder things count for more and lying down counts backwards. The white mark on the bar is where an even day would have you by this hour, so fill left of it is room and fill past it is running ahead.',
    why: 'Pacing works when the ceiling is yours rather than a general rule, and a number in minutes is one you can hold against your own afternoon. The budget is a ceiling, never a target: there is nothing to gain by using it up, and a day that ends well under it is not a day wasted.',
  },
  spend: {
    what: 'Everything charged against today, largest first. Logged activities are charged by how long they lasted and how heavy that kind of thing is for this population. Minutes above your own exertion line are charged separately. Upright time is charged lightly per minute and heavily per day, which is how standing actually works. Restorative entries appear as a credit and give minutes back.',
    why: 'Most pacing tools bill for heart rate alone, which misses standing in a queue, a hot shower, an argument and three hours of hard thinking. Those are what put this population on the floor, so they are billed here too. Seeing where the day went is also what makes the budget arguable, which it should be.',
  },
  why: {
    what: 'The morning readings behind today\'s number, each stated against your own usual rather than a normal range. The tick on each bar is where your usual sits. A row with no value is an input the app has not seen today; it widens the estimate rather than counting as a zero.',
    why: 'This population runs numbers a textbook would call abnormal every day of the week, so only the move away from your own baseline means anything. Showing the inputs is also the only way to disagree with the output: if the budget looks wrong, this is where you can see which reading it leaned on.',
  },
  accuracy: {
    what: 'How often staying under budget was followed by two days that held. Days you went over are their own colour and are counted in neither column. Under three weeks of evaluated days it states the count instead of a rate.',
    why: 'A budget that never finds out whether it was right is just a formula. This is the readout that says whether yours is working, and it reports the misses as readily as the hits. The window is the next two days rather than tomorrow, because post-exertional symptoms are usually delayed a day or more.',
  },
};
