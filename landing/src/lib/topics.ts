/**
 * Topic registry for the Insights hub. Mirrors onboardmap's `topics` config:
 * a hand-authored map keyed by the category slugs used in article frontmatter,
 * decorated with display names, an icon, SEO copy and a sort order.
 *
 * The slugs here are the same ones in each article's `categories` array; the
 * first category is treated as an article's canonical topic for its URL.
 */
export type Topic = {
  slug: string;
  longName: string;
  shortName: string;
  /** Compact glyph used in the category bar and topic cards (matches the landing's icon vocabulary). */
  icon: string;
  /** One-line hub description, shown on topic pages and cards. */
  description: string;
  /** <title>/meta copy for the topic hub. */
  title: string;
  keywords: string;
  /** Sort order + "show in nav" flag (lower = earlier). */
  sticky: number;
};

export const topics: Record<string, Topic> = {
  hrv: {
    slug: 'hrv',
    longName: 'Heart Rate Variability',
    shortName: 'HRV',
    icon: '≈',
    description:
      'What HRV measures, why it falls in POTS and post-viral illness, and how to read RMSSD, SDNN and power without obsessing.',
    title: 'HRV for POTS & Dysautonomia Recovery',
    keywords: 'HRV, heart rate variability, RMSSD, SDNN, parasympathetic, vagal tone, POTS recovery',
    sticky: 1
  },
  food: {
    slug: 'food',
    longName: 'Food & Diet',
    shortName: 'Food',
    icon: '❖',
    description:
      'What to eat when your gut and nervous system are dysregulated: the POTS diet, low-histamine and MCAS eating, the SIBO gut connection, the Mediterranean pattern, and simple meal ideas for hard days.',
    title: 'Food & Diet for POTS, MCAS & Long COVID',
    keywords:
      'POTS diet, low histamine diet, MCAS food list, SIBO diet, Mediterranean diet long covid, histamine intolerance, gut health, dysautonomia nutrition, meal ideas',
    sticky: 2
  },
  pots: {
    slug: 'pots',
    longName: 'POTS & Dysautonomia',
    shortName: 'POTS',
    icon: '♡',
    description:
      'Practical guidance for postural orthostatic tachycardia syndrome and broader dysautonomia, from daily patterns to what actually moves recovery.',
    title: 'POTS & Dysautonomia, Explained',
    keywords: 'POTS, dysautonomia, postural orthostatic tachycardia, autonomic dysfunction, recovery',
    sticky: 3
  },
  postviral: {
    slug: 'postviral',
    longName: 'Long COVID, MCAS & Post-Viral',
    shortName: 'Long COVID',
    icon: '⊕',
    description:
      'Long COVID, ME/CFS and MCAS overlap heavily with dysautonomia. What connects them, why they travel together, and how to track the parts you can measure.',
    title: 'Long COVID, MCAS & Post-Viral Illness | Autonomic',
    keywords:
      'long covid, MCAS, mast cell activation syndrome, ME/CFS, chronic fatigue, post-viral illness, post-exertional malaise, dysautonomia',
    sticky: 4
  },
  recovery: {
    slug: 'recovery',
    longName: 'Recovery',
    shortName: 'Recovery',
    icon: '↗',
    description:
      'The long view, pacing, trends, milestones and turning months of data into decisions that bend your recovery the right way.',
    title: 'Autonomic Recovery | Trends & Pacing',
    keywords: 'autonomic recovery, pacing, long covid recovery, post-viral fatigue, trends, milestones',
    sticky: 5
  },
  app: {
    slug: 'app',
    longName: 'Using Autonomic',
    shortName: 'The app',
    icon: '✦',
    description:
      'How the Autonomic app works: scoring readings against medical thresholds, reading trends, and using AI to turn your data into doctor-ready summaries.',
    title: 'Using the Autonomic App | Features & Guides',
    keywords:
      'Autonomic app, HRV app, POTS tracker, offline health journal, AI health insights, doctor-ready report, stand test app',
    sticky: 6
  },
  research: {
    slug: 'research',
    longName: 'Research & News',
    shortName: 'Research',
    icon: '◇',
    description:
      'Plain-language summaries of new research on HRV, POTS, long COVID and dysautonomia: what the studies actually found, and what it means for you.',
    title: 'Research & News | HRV, POTS & Long COVID',
    keywords:
      'POTS research, long covid research, HRV studies, dysautonomia news, autonomic nervous system research',
    sticky: 7
  },
  basics: {
    slug: 'basics',
    longName: 'Basics',
    shortName: 'Basics',
    icon: '○',
    description:
      'Start-here explainers, the core concepts and vocabulary behind reading your nervous system as a recovery instrument.',
    title: 'Autonomic Recovery Basics',
    keywords: 'HRV basics, POTS basics, autonomic nervous system, getting started, explainers',
    sticky: 8
  }
};

/** All topics, ordered for nav/listing. */
export const allTopics = (): Topic[] => Object.values(topics).sort((a, b) => a.sticky - b.sticky);

/** Look up a topic, or synthesise a minimal fallback from an unknown slug. */
export function getTopic(slug?: string): Topic | undefined {
  if (!slug) return undefined;
  return topics[slug];
}

/** Humanised label for any category slug (topic or otherwise). */
export const topicLabel = (slug?: string): string =>
  !slug
    ? ''
    : topics[slug]?.shortName ??
      slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
