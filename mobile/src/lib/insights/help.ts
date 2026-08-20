/**
 * Copy behind the "?" on each Insights card.
 *
 * These carry more weight than most info cards in the app. Everywhere else a "?"
 * explains a metric the user can look up; here it explains a CLAIM the app has
 * made about them, so each one has to say what the finding is, and just as
 * importantly what it is not. "Linked" is not "caused" and a strong association is
 * not a recommendation.
 *
 * Same three-part shape as every other info card (`HelpContent`): what it is, why
 * it matters to me, and a link out. Three or four lines each — the help sheet is
 * `fitContent` and does not scroll.
 */
import type { HelpContent } from '../help';

export const INSIGHTS_HELP: Record<'change' | 'correlations' | 'early' | 'observations' | 'noImpact' | 'watch' | 'confidence', HelpContent> = {
  change: {
    what: 'The single largest shift in your log over the last few months. Either something you started showing a before and after, or a metric that has plainly moved month against month.',
    why: 'It is the one finding most likely to be worth acting on, which is why it sits first. The order of events is real: the numbers before and after are yours. What caused it is still an open question, and this card is not the answer to it.',
    learnMore: '/insights/hrv/how-to-improve-hrv-what-works/',
  },
  correlations: {
    what: 'Things that move together in your own log. Each row pairs something you do or have with something the app measures. Read it as three parts: the number on the right is the difference between the two groups, in that metric\'s own units, so "+12 ms" means the days with it typically ran 12 ms higher. The bar and its word are how much the app trusts the pattern, not how big it is. The grey line says how many days went into it.',
    why: 'This is how you find the handful of things that actually matter to you out of everything you track. Treat a strong row as a lead to test deliberately, not as a fact: two things moving together often share a third cause, and feeling well is frequently what allows the behaviour rather than the result of it.',
    learnMore: '/insights/recovery/find-your-triggers-symptom-journal/',
  },
  early: {
    what: 'An association we can see but cannot stand behind yet. On a young journal it is a first glimpse: strong enough to stand out in a handful of days, held to a much lower evidence bar than a correlation. On a longer journal it is a pattern with plenty of days behind it that still did not survive the check we run to keep chance findings off this screen. Either way it is badged and its confidence shows a single bar.',
    why: 'It shows you what this screen becomes once there is more to read, and it keeps a real pattern from being hidden entirely just because it fell short of a strict bar. Treat it as a hunch rather than a finding: some of these firm up and graduate into the correlations list on their own, and some disappear.',
    learnMore: '/insights/recovery/find-your-triggers-symptom-journal/',
  },
  observations: {
    what: 'Smaller patterns and gaps that are not correlations: a time of day that reads better, a weekday that reliably goes badly, or a reading you used to take and have not lately.',
    why: 'Some of the most useful things in a journal are not two columns moving together. A gap here often explains why another section is empty, and a timing pattern can make every other number on this screen sharper for free.',
    learnMore: '/insights/basics/how-to-measure-hrv-accurately-at-home/',
  },
  noImpact: {
    what: 'Meds and supplements you have taken for at least three weeks, with enough days off them to compare, where nothing the app tracks moved either way. Only things tested against several metrics qualify.',
    why: 'A null result is information you paid for: it can be a reason to talk to your clinician about whether something is still earning its place. It means no DETECTABLE effect at this much data — not proof of none, and some things work in ways a journal cannot see. Never stop a prescribed medication over a row on this screen.',
    learnMore: '/insights/recovery/find-your-triggers-symptom-journal/',
  },
  watch: {
    what: 'Metrics that have genuinely moved over the last month compared with the month before it. Only changes large enough to be worth telling you about appear, and each row shows the run of days behind the claim.',
    why: 'A single reading says almost nothing; a month against a month says something. Green is moving the healthy way and red is not, and a decline here is information rather than a verdict. This section stays quiet while a crash warning is active.',
    learnMore: '/insights/app/how-autonomic-scores-your-readings/',
  },
  confidence: {
    what: 'How much of the recent past this screen actually had to work with. It weighs how many days you logged, how many carry a full HRV reading, how many nights were recorded, how current the log is, and how far back it goes.',
    why: 'Every finding here depends on having enough days to compare. A low number does not mean your health is worse, it means the analysis is working with less, and it explains why a section might be empty. Raising it is the fastest way to make this screen useful.',
    learnMore: '/insights/app/getting-started-with-autonomic/',
  },
};
