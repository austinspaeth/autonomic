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
  /** Sort order (lower = earlier). */
  sticky: number;
  /** Also file any article whose title, keywords or summary match (a condition hub). */
  match?: RegExp;
  /** Hand-picked reading list, shown first and in this order. */
  picks?: string[];
  /** false: a hub reached from the blog hero only, not listed in the topic bar. */
  inBar?: boolean;
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
    sticky: 5
  },
  food: {
    slug: 'food',
    longName: 'Food & Diet',
    shortName: 'Food',
    icon: '❖',
    description:
      'What to eat when your gut and nervous system are struggling: the POTS diet, low-histamine eating for MCAS, the gut connection and easy meals for hard days.',
    title: 'Food & Diet for POTS, MCAS & Long COVID',
    keywords:
      'POTS diet, low histamine diet, MCAS food list, SIBO diet, Mediterranean diet long covid, histamine intolerance, gut health, dysautonomia nutrition, meal ideas',
    sticky: 6
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
    sticky: 1
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
    sticky: 2
  },
  mecfs: {
    slug: 'mecfs',
    longName: 'ME/CFS',
    shortName: 'ME/CFS',
    icon: '◐',
    description:
      'Myalgic encephalomyelitis / chronic fatigue syndrome: post-exertional malaise, pacing inside your energy envelope, and how it overlaps with POTS and long COVID.',
    title: 'ME/CFS: Pacing, PEM & Tracking | Autonomic',
    keywords: 'ME/CFS, myalgic encephalomyelitis, chronic fatigue syndrome, post-exertional malaise, PEM, pacing, energy envelope',
    sticky: 3,
    match: /ME\/CFS|myalgic|chronic fatigue syndrome|post-exertional/i,
    picks: ['post-exertional-malaise-explained', 'pacing-101-energy-envelope', 'why-am-i-so-tired-pots-long-covid-fatigue']
  },
  dysautonomia: {
    slug: 'dysautonomia',
    longName: 'Dysautonomia',
    shortName: 'Dysautonomia',
    icon: '∿',
    description:
      'When the autonomic nervous system misfires: heart rate, blood pressure, digestion, temperature and sleep, and how to read what your body is doing.',
    title: 'Dysautonomia, Explained | Autonomic',
    keywords: 'dysautonomia, autonomic dysfunction, autonomic nervous system, orthostatic intolerance, POTS, symptoms',
    sticky: 4,
    match: /dysautonomia|autonomic dysfunction/i,
    picks: ['autonomic-nervous-system-and-dysautonomia-guide', 'nervous-system-dysregulation-signs-and-recovery']
  },
  'just-diagnosed': {
    slug: 'just-diagnosed',
    longName: 'Just diagnosed',
    shortName: 'Just diagnosed',
    icon: '→',
    description:
      'New to POTS, long COVID, ME/CFS or dysautonomia? Start here: what the diagnosis means, the tests, the first treatments, and how to begin tracking.',
    title: 'Just Diagnosed with POTS or Dysautonomia? Start Here | Autonomic',
    keywords: 'newly diagnosed POTS, just diagnosed dysautonomia, POTS diagnosis, what to do after diagnosis, long covid diagnosis',
    sticky: 20,
    inBar: false,
    picks: [
      'autonomic-nervous-system-and-dysautonomia-guide',
      'how-pots-is-diagnosed',
      'pots-subtypes-explained',
      'tilt-table-test-what-to-expect',
      'autonomic-function-tests-what-to-expect',
      'pots-treatment-salt-fluids-compression-medication',
      'pacing-101-energy-envelope',
      'hrv-complete-guide',
      'pots-long-covid-and-mcas-overlap',
      'recovery-from-post-viral-dysautonomia',
      'what-recovery-looks-like',
      'turn-your-data-into-a-doctor-conversation'
    ]
  },
  'supporting-someone': {
    slug: 'supporting-someone',
    longName: 'Supporting someone',
    shortName: 'Supporting someone',
    icon: '♡',
    description:
      'For partners, parents and friends: what these conditions are, why someone can look fine and feel awful, and why "just push through" backfires.',
    title: 'Supporting Someone with POTS, Long COVID or ME/CFS | Autonomic',
    keywords: 'supporting someone with POTS, caregiver dysautonomia, partner long covid, parent POTS teenager, ME/CFS family',
    sticky: 21,
    inBar: false,
    picks: [
      'autonomic-nervous-system-and-dysautonomia-guide',
      'normal-test-results-but-still-sick',
      'post-exertional-malaise-explained',
      'pacing-101-energy-envelope',
      'is-it-pots-or-anxiety',
      'pots-in-teenagers-and-adolescents',
      'why-am-i-so-tired-pots-long-covid-fatigue',
      'what-recovery-looks-like',
      'from-daily-crashes-to-living-again',
      'pots-flare-up-triggers-and-recovery'
    ]
  },
  recovery: {
    slug: 'recovery',
    longName: 'Recovery',
    shortName: 'Recovery',
    icon: '↗',
    description:
      'How recovery from POTS, long COVID and ME/CFS really goes: pacing, slow trends, setbacks, and turning months of data into better decisions.',
    title: 'Recovering from POTS, Long COVID & ME/CFS',
    keywords: 'autonomic recovery, pacing, long covid recovery, post-viral fatigue, trends, milestones',
    sticky: 7
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
    sticky: 10
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
    sticky: 8
  },
  basics: {
    slug: 'basics',
    longName: 'Basics',
    shortName: 'Basics',
    icon: '○',
    description:
      'Start here. Plain explainers on the nervous system, HRV and the words your doctor uses, for anyone new to POTS, long COVID or ME/CFS.',
    title: 'Nervous System Basics for POTS & Long COVID',
    keywords: 'HRV basics, POTS basics, autonomic nervous system, getting started, explainers',
    sticky: 9
  }
};

/** All topics, ordered for nav/listing. */
export const allTopics = (): Topic[] => Object.values(topics).sort((a, b) => a.sticky - b.sticky);

/** The topics listed in the blog's topic bar. */
export const barTopics = (): Topic[] => allTopics().filter((t) => t.inBar !== false);

type Filable = { slug: string; title: string; summary?: string; keywords?: string; categories?: string[] };

/** Every article a topic hub lists: its picks first, then anything filed under
    it or (for a condition hub) matching it, newest first as given. */
export function topicArticles<T extends Filable>(articles: T[], slug: string): T[] {
  const t = topics[slug];
  const picked = (t?.picks ?? []).map((s) => articles.find((a) => a.slug === s)).filter((a): a is T => Boolean(a));
  const rest = articles.filter(
    (a) =>
      !picked.includes(a) &&
      (a.categories?.includes(slug) || (t?.match && t.match.test(`${a.title} ${a.keywords ?? ''} ${a.summary ?? ''}`)))
  );
  return [...picked, ...rest];
}

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
