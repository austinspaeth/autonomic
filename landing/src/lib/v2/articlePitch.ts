// The app pitch an article carries: which feature continues the question the
// article answers, and the two lines that tie them together. An article can
// name its own in frontmatter (`app: { feature, hook, line }`); anything it
// leaves out falls back to its feature's defaults, and an article with no
// `app` at all is given the feature its topic points at. The page renders the
// result in three places (under the short answer, in the middle of the
// article and in the rail), so the markdown never carries a sales block.

export type FeatureSlug =
  | 'hrv-readings'
  | 'pacing-budget'
  | 'insights'
  | 'pots-stand-test'
  | 'cycle-tracking'
  | 'doctor-reports'
  | 'apple-watch';

export type ArticleApp = { feature?: FeatureSlug; hook?: string; line?: string };

export type Pitch = {
  feature: FeatureSlug;
  /** The feature's name, as the link says it. */
  name: string;
  href: string;
  hook: string;
  line: string;
  /** The feature's own headline and line, for the places that sit beside the
   *  article's (so one page never says the same sentence twice). */
  featureHook: string;
  featureLine: string;
};

export const FEATURE_PITCH: Record<FeatureSlug, Omit<Pitch, 'feature' | 'featureHook' | 'featureLine'>> = {
  'hrv-readings': {
    name: 'Morning HRV readings',
    href: '/features/hrv-readings/',
    hook: 'Know what kind of day it is before you get up.',
    line: 'A quick morning heart reading becomes a score out of 100, measured against your own normal rather than a fitness chart.'
  },
  'pacing-budget': {
    name: 'The pacing budget',
    href: '/features/pacing-budget/',
    hook: 'Know how much today can take.',
    line: 'A daily energy budget learned from what your body actually handled, with a nudge before you go over.'
  },
  insights: {
    name: 'Insights',
    href: '/features/insights/',
    hook: 'Find out what actually helps you.',
    line: 'Log what you take, eat and do, and Insights shows what lines up with your better and worse days.'
  },
  'pots-stand-test': {
    name: 'The POTS stand test',
    href: '/features/pots-stand-test/',
    hook: 'Measure what standing does to your heart.',
    line: 'A guided home stand test times how far your heart rate climbs when you get up, with an Apple Watch, a chest strap or by hand.'
  },
  'cycle-tracking': {
    name: 'Cycle tracking',
    href: '/features/cycle-tracking/',
    hook: 'See your cycle in your numbers.',
    line: 'Autonomic reads your HRV, heart rate and symptoms against your cycle, so a monthly dip stops looking like a setback.'
  },
  'doctor-reports': {
    name: 'AI reports',
    href: '/features/doctor-reports/',
    hook: 'Walk into your appointment with real numbers.',
    line: 'Turn weeks of your own readings into a clear summary for your doctor, written with the AI tool you already use.'
  },
  'apple-watch': {
    name: 'Autonomic on Apple Watch',
    href: '/features/apple-watch/',
    hook: 'POTS heart rate tools on your wrist.',
    line: 'Heart rate alerts and stand tests on your Apple Watch, free with the iPhone app.'
  }
};

/** The feature an article's topic points at, when the article names none. */
const TOPIC_FEATURE: Record<string, FeatureSlug> = {
  pots: 'pots-stand-test',
  dysautonomia: 'hrv-readings',
  postviral: 'pacing-budget',
  mecfs: 'pacing-budget',
  hrv: 'hrv-readings',
  food: 'insights',
  recovery: 'insights',
  research: 'insights',
  basics: 'hrv-readings',
  'just-diagnosed': 'doctor-reports',
  'supporting-someone': 'pacing-budget',
  app: 'hrv-readings'
};

export function pitchFor(app: ArticleApp | undefined, topic: string | undefined): Pitch {
  const feature = app?.feature && app.feature in FEATURE_PITCH ? app.feature : TOPIC_FEATURE[topic ?? ''] ?? 'hrv-readings';
  const base = FEATURE_PITCH[feature];
  return { feature, ...base, hook: app?.hook || base.hook, line: app?.line || base.line, featureHook: base.hook, featureLine: base.line };
}

/** The condition page for an article's topic, for the "how Autonomic helps" link. */
export const TOPIC_CONDITION: Record<string, { href: string; name: string }> = {
  pots: { href: '/conditions/pots/', name: 'POTS' },
  postviral: { href: '/conditions/long-covid/', name: 'long COVID' },
  mecfs: { href: '/conditions/me-cfs/', name: 'ME/CFS' },
  dysautonomia: { href: '/conditions/dysautonomia/', name: 'dysautonomia' },
  recovery: { href: '/conditions/chronic-illness/', name: 'chronic illness' }
};
