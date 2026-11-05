import type { Article } from '../../routes/api/articles/types';
import { topicLabel } from '../topics';

/**
 * "What is bothering you most?" on the blog home: symptoms, each a hand-picked
 * reading list in order (the first is where the card goes without script).
 * Slugs that are missing or unpublished simply drop out.
 */
/** The part of the app that answers the same question, closing a reading list. */
export type Pitch = { href: string; name: string; line: string };

export const SYMPTOMS: { id: string; label: string; slugs: string[]; app: Pitch }[] = [
  {
    id: 'dizzy',
    label: 'Dizzy when I stand',
    slugs: [
      'dizziness-lightheadedness-pots-dysautonomia',
      'blood-pooling-in-pots-legs',
      'orthostatic-hypotension-vs-pots',
      'counterpressure-maneuvers-pots-orthostatic-intolerance',
      'vasovagal-syncope-fainting'
    ],
    app: { href: '/features/pots-stand-test/', name: 'POTS stand test', line: 'Measure how much your heart rate jumps when you stand, at home.' }
  },
  {
    id: 'tired',
    label: 'Exhausted all the time',
    slugs: [
      'why-am-i-so-tired-pots-long-covid-fatigue',
      'post-exertional-malaise-explained',
      'pots-symptoms-worse-in-the-morning',
      'normal-test-results-but-still-sick',
      'coq10-long-covid-pots-fatigue'
    ],
    app: { href: '/features/hrv-readings/', name: 'Morning score', line: 'One heart reading when you wake tells you how much today can take, before you get up.' }
  },
  {
    id: 'racing',
    label: 'Heart racing',
    slugs: [
      'adrenaline-dumps-pots',
      'palpitations-ectopic-beats-pots-hrv',
      'is-it-pots-or-anxiety',
      'inappropriate-sinus-tachycardia-vs-pots',
      'chest-pain-tightness-pots-dysautonomia'
    ],
    app: { href: '/features/hrv-readings/', name: 'Heart readings', line: 'Put a number on the racing and see it against your own normal, not a textbook one.' }
  },
  {
    id: 'fog',
    label: 'Brain fog and headaches',
    slugs: [
      'long-covid-brain-fog',
      'headaches-migraines-pots-dysautonomia',
      'blurry-vision-visual-symptoms-pots-dysautonomia'
    ],
    app: { href: '/features/insights/', name: 'Insights', line: 'See what lines up with your clearer days: sleep, salt, supplements, the weather.' }
  },
  {
    id: 'crash',
    label: 'Crash after doing too much',
    slugs: [
      'post-exertional-malaise-explained',
      'pacing-101-energy-envelope',
      'pacing-budget-know-how-much-today-can-take',
      'pots-flare-up-triggers-and-recovery'
    ],
    app: { href: '/features/pacing-budget/', name: 'Pacing budget', line: 'A daily energy budget learned from what your body actually handled, with a nudge before you go over.' }
  },
  {
    id: 'sleep',
    label: 'Wired but cannot sleep',
    slugs: [
      'pots-insomnia-wired-but-tired',
      'why-you-feel-better-at-night-mcas',
      'sleep-and-autonomic-recovery',
      'overnight-heart-rate-while-you-sleep'
    ],
    app: { href: '/features/hrv-readings/', name: 'Sleep report', line: 'Your night read back to you: hours, overnight heart rate and, with a watch, sleep stages.' }
  },
  {
    id: 'bp',
    label: 'Blood pressure swings',
    slugs: [
      'labile-blood-pressure-dysautonomia',
      'non-dipping-blood-pressure-nocturnal-dip',
      'orthostatic-hypotension-vs-pots',
      'pots-worse-after-eating-postprandial-hypotension'
    ],
    app: { href: '/features/hrv-readings/', name: 'Journal', line: 'Log blood pressure beside your heart readings and see the pattern over weeks.' }
  },
  {
    id: 'gut',
    label: 'Stomach and nausea',
    slugs: [
      'nausea-in-pots-dysautonomia',
      'gastroparesis-pots-dysautonomia',
      'sibo-histamine-gut-dysautonomia',
      'reactive-hypoglycemia-blood-sugar-pots'
    ],
    app: { href: '/features/insights/', name: 'Insights', line: 'Log meals and symptoms, and see which ones line up with your worse days.' }
  }
];

/** Each topic's own page in the app: a condition page, or the feature it is about. */
export const TOPIC_PITCH: Record<string, Pitch> = {
  hrv: { href: '/features/hrv-readings/', name: 'Take an HRV reading', line: '' },
  food: { href: '/features/insights/', name: 'Test a food in Insights', line: '' },
  pots: { href: '/conditions/pots/', name: 'Autonomic for POTS', line: '' },
  postviral: { href: '/conditions/long-covid/', name: 'Autonomic for long COVID', line: '' },
  mecfs: { href: '/conditions/me-cfs/', name: 'Autonomic for ME/CFS', line: '' },
  dysautonomia: { href: '/conditions/dysautonomia/', name: 'Autonomic for dysautonomia', line: '' },
  recovery: { href: '/conditions/chronic-illness/', name: 'Track your recovery', line: '' },
  research: { href: '/features/insights/', name: 'Test what you read', line: '' },
  basics: { href: '/features/', name: 'See what the app does', line: '' }
};

/** One row of the app band: a question the app answers, and the page that shows how. */
export type AppRow = { href: string; q: string; a: string };

const ROW: Record<string, AppRow> = {
  score: { href: '/features/hrv-readings/', q: 'What kind of day is it?', a: 'A morning heart reading becomes a score out of 100, before you get out of bed.' },
  pacing: { href: '/features/pacing-budget/', q: 'How much can I do?', a: 'A pacing budget learned from what your body actually handled.' },
  insights: { href: '/features/insights/', q: 'What is actually helping?', a: 'Insights lines up what you log with your better and worse days.' },
  stand: { href: '/features/pots-stand-test/', q: 'How much does standing cost me?', a: 'A home stand test measures how far your heart rate climbs when you get up.' },
  reports: { href: '/features/doctor-reports/', q: 'What do I tell my doctor?', a: 'Turn weeks of your own numbers into a summary for your next appointment.' }
};
const rows = (...keys: string[]): AppRow[] => keys.map((k) => ROW[k]);

export const APP_ROWS_DEFAULT = rows('score', 'pacing', 'insights');

/** Each topic page's photo and its app band, written for the people who read that topic. */
export const TOPIC_PAGE: Record<string, { photo: string; pos?: string; flip?: boolean; title: string; sub: string; rows: AppRow[]; link: { href: string; name: string } }> = {
  pots: {
    photo: '/people/hero-pots.webp',
    title: 'Put numbers on what standing does to you.',
    sub: 'Autonomic measures your heart rate rise at home, scores each morning, and shows what moves your POTS: salt, sleep, heat, your cycle.',
    rows: rows('stand', 'score', 'insights'),
    link: { href: '/conditions/pots/', name: 'How Autonomic helps with POTS' }
  },
  postviral: {
    photo: '/people/hero-long-covid.webp',
    title: 'See the crash coming, and the climb back.',
    sub: 'One morning reading becomes a score, with a warning when your numbers start to slide, so you can rest before a crash instead of after it.',
    rows: rows('score', 'pacing', 'insights'),
    link: { href: '/conditions/long-covid/', name: 'How Autonomic helps with long COVID' }
  },
  mecfs: {
    photo: '/people/hero-me-cfs.webp',
    // She lies on the left of the frame, under the title; mirrored she sits clear of it.
    flip: true,
    title: 'Pace by your own numbers, not by guesswork.',
    sub: 'A daily energy budget fitted to you, a nudge before you go over, and a check two days later on whether it held.',
    rows: rows('pacing', 'score', 'insights'),
    link: { href: '/conditions/me-cfs/', name: 'How Autonomic helps with ME/CFS' }
  },
  dysautonomia: {
    photo: '/people/hero-dysautonomia.webp',
    title: 'Your nervous system, measured every morning.',
    sub: 'One reading becomes a score against your own normal, with a warning when things start to slide.',
    rows: rows('score', 'stand', 'insights'),
    link: { href: '/conditions/dysautonomia/', name: 'How Autonomic helps with dysautonomia' }
  },
  hrv: {
    photo: '/people/hero-hrv.webp',
    title: 'Take a real HRV reading with what you already own.',
    sub: 'Your phone camera, a chest strap, an Apple Watch or a Garmin. Each reading is scored against your own baseline, not a fitness chart.',
    rows: rows('score', 'insights', 'reports'),
    link: { href: '/features/hrv-readings/', name: 'See how HRV readings work' }
  },
  food: {
    photo: '/people/hero-insights.webp',
    title: 'Find out what your food is really doing.',
    sub: 'Log meals, salt and water, and Insights shows which ones line up with your better and worse days.',
    rows: rows('insights', 'score', 'reports'),
    link: { href: '/features/insights/', name: 'See how Insights works' }
  },
  recovery: {
    photo: '/people/hero-recovery.webp',
    title: 'See the slow climb you cannot feel day to day.',
    sub: 'Daily scores add up to weeks and months, so a good stretch and a setback both show up for what they are.',
    rows: rows('score', 'pacing', 'reports'),
    link: { href: '/conditions/chronic-illness/', name: 'How Autonomic helps with chronic illness' }
  },
  research: {
    photo: '/people/hero-doctor.webp',
    title: 'Test what the studies say on yourself.',
    sub: 'Start a supplement or a change, keep logging, and Insights compares the weeks before and after.',
    rows: rows('insights', 'score', 'reports'),
    link: { href: '/features/insights/', name: 'See how Insights works' }
  },
  basics: {
    photo: '/people/nav-symptoms.webp',
    title: 'Start measuring, not just reading.',
    sub: 'Autonomic turns a quick morning heart reading into a score, a pacing budget and a plain answer to what is helping.',
    rows: APP_ROWS_DEFAULT,
    link: { href: '/features/', name: 'See everything Autonomic does' }
  },
  'just-diagnosed': {
    photo: '/people/conditions-unsure.webp',
    title: 'Start your record now, before your next appointment.',
    sub: 'A few weeks of morning readings and stand tests give your doctor something real to look at, in a summary you can bring.',
    rows: rows('stand', 'score', 'reports'),
    link: { href: '/conditions/', name: 'Find your condition' }
  },
  'supporting-someone': {
    photo: '/people/hero-chronic-illness.webp',
    title: 'Something you can look at together.',
    sub: 'Autonomic gives the person you care about a daily score and a pacing budget, so how today is going has an answer neither of you has to guess.',
    rows: rows('score', 'pacing', 'reports'),
    link: { href: '/features/', name: 'See what the app does' }
  },
  app: {
    photo: '/people/hero-watch.webp',
    title: 'Everything here, on your phone.',
    sub: 'Free on iPhone and Android, with every journal, reading and score kept on your phone, never in an account.',
    rows: APP_ROWS_DEFAULT,
    link: { href: '/features/', name: 'See every feature' }
  }
};

/** The first sentence of a passage, for the "Short answer" boxes. */
export function firstSentence(text = ''): string {
  const t = text.trim();
  const m = t.match(/^[\s\S]+?[.!?](?=\s+[A-Z"“(]|$)/);
  return (m ? m[0] : t).trim();
}

/** The one-line answer a card leads with: the TL;DR's opening, else the summary's. */
export const shortAnswer = (a: Pick<Article, 'tldr' | 'summary'>): string =>
  firstSentence(a.tldr || a.summary);

/** "POTS · 6 min" */
export const cardMeta = (a: Pick<Article, 'categories' | 'readMin'>): string =>
  [topicLabel(a.categories?.[0]), a.readMin ? `${a.readMin} min` : ''].filter(Boolean).join(' · ');

/** Articles in the order of a slug list, skipping any that are not live. */
export const bySlugs = (articles: Article[], slugs: string[]): Article[] =>
  slugs.map((s) => articles.find((a) => a.slug === s)).filter((a): a is Article => Boolean(a));

/** The featured article: one flagged `featured`, else the newest. */
export const pickFeatured = (articles: Article[]): Article | undefined =>
  articles.find((a) => a.featured) ?? articles[0];
