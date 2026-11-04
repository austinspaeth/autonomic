/** The feature pages: one row here drives the nav menu, footer, /features/ and
 *  each page's "More features" cards. Only the strongest features are listed;
 *  a page can live outside it (Apple Watch), and then the sitemap lists it by
 *  hand. */
export type Feature = { slug: string; href: string; name: string; tag: string; icon: string; pro?: boolean };

const f = (slug: string, name: string, tag: string, icon: string, pro = false): Feature => ({
  slug,
  href: `/features/${slug}/`,
  name,
  tag,
  icon,
  pro
});

export const FEATURES: Feature[] = [
  f('hrv-readings', 'Journal + HRV', 'Track HRV, sleep, symptoms and more', 'journal'),
  f('pacing-budget', 'Pacing budget', 'Pace yourself before you overdo it', 'pacing', true),
  f('insights', 'Insights', 'See what lines up with better days', 'insights', true),
  f('pots-stand-test', 'POTS stand test', 'Your heart rate rise, measured', 'stand'),
  f('cycle-tracking', 'Cycle tracking', 'Read your numbers against your cycle', 'cycle'),
  f('doctor-reports', 'AI reports', 'Prompts for doctor and health summaries', 'doctor', true)
];

/** Verbatim App Store reviews (public feed, Oct 2026), trimmed only with an
 *  ellipsis. Never edit the words; replace a quote or drop it. */
export const REVIEWS = [
  {
    title: 'Best Dysautonomia/POTS Tracker!',
    short: 'I’ve been through a dozen apps trying to manage my POTS and PEM. I can say without a doubt Autonomic is the BEST one I’ve tried.',
    body: 'I’ve been through a dozen apps trying to manage my POTS and PEM. I can say without a doubt Autonomic is the BEST one I’ve tried… The HRV tracking is the best one I’ve tried so far and most aligns with how I feel.'
  },
  {
    title: 'Extremely helpful app',
    short: 'It’s already helping me manage my health and gather data to show providers.',
    body: 'I’ve only had it 2 days and it’s already helping me manage my health and gather data to show providers. This is one of the only apps that prioritizes privacy which is what made me download it…'
  },
  {
    title: 'Necessity for non-athlete health tracking',
    short: 'Only app that isn’t for athlete training and specific to dysautonomia.',
    body: 'Only app that isn’t for athlete training and specific to dysautonomia. Very good to have symptoms measured with health tracker I already have (Apple Watch)… Already seeing actionable data results after 5 days of consistent usage.'
  }
];
