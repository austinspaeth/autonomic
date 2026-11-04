/** The condition pages: one row here drives /conditions/, each page's "Often
 *  travels with" cards and the sitemap. The home hero and the footer link the
 *  same paths through `CONDITION_LINKS` in site.ts, so a renamed URL moves in
 *  both places. */
export type Condition = {
  slug: string;
  href: string;
  /** As it reads in a sentence ("long COVID"). */
  name: string;
  /** As it reads on a card or a crumb ("Long COVID"). */
  title: string;
  /** The question this condition most often comes with, voiced first person. */
  question: string;
  blurb: string;
};

const c = (slug: string, name: string, title: string, question: string, blurb: string): Condition => ({
  slug,
  href: `/conditions/${slug}/`,
  name,
  title,
  question,
  blurb
});

export const CONDITIONS: Condition[] = [
  c('pots', 'POTS', 'POTS', 'Why does my heart race when I stand?', 'Measure the standing spike, see what moves it, and bring a repeatable record to your clinician.'),
  c('long-covid', 'long COVID', 'Long COVID', 'Will I crash if I do this today?', 'Pace by your own numbers, catch a slide early, and see the slow climb you cannot feel day to day.'),
  c('me-cfs', 'ME/CFS', 'ME/CFS', 'How much can I do before I pay for it?', 'A daily energy budget fitted to you, judged on the two days after, so pacing stops being guesswork.'),
  c('dysautonomia', 'dysautonomia', 'Dysautonomia', 'What is my nervous system doing?', 'One morning reading turned into a score, a trend and an early warning, against your own normal.'),
  c('chronic-illness', 'chronic illness', 'Chronic illness', 'What actually helps and what’s noise?', 'Log what you take and do, and let your own data show what lines up with your better days.')
];

/** The other conditions, for a page's "Often travels with" row. */
export const otherConditions = (slug: string): Condition[] => CONDITIONS.filter((x) => x.slug !== slug);
