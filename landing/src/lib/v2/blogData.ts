import type { Article } from '../../routes/api/articles/types';
import { topicLabel } from '../topics';

/**
 * "What is bothering you most?" on the blog home: symptoms, each a hand-picked
 * reading list in order (the first is where the card goes without script).
 * Slugs that are missing or unpublished simply drop out.
 */
export const SYMPTOMS: { id: string; label: string; slugs: string[] }[] = [
  {
    id: 'dizzy',
    label: 'Dizzy when I stand',
    slugs: [
      'dizziness-lightheadedness-pots-dysautonomia',
      'blood-pooling-in-pots-legs',
      'orthostatic-hypotension-vs-pots',
      'counterpressure-maneuvers-pots-orthostatic-intolerance',
      'vasovagal-syncope-fainting'
    ]
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
    ]
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
    ]
  },
  {
    id: 'fog',
    label: 'Brain fog and headaches',
    slugs: [
      'long-covid-brain-fog',
      'headaches-migraines-pots-dysautonomia',
      'blurry-vision-visual-symptoms-pots-dysautonomia'
    ]
  },
  {
    id: 'crash',
    label: 'Crash after doing too much',
    slugs: [
      'post-exertional-malaise-explained',
      'pacing-101-energy-envelope',
      'pacing-budget-know-how-much-today-can-take',
      'pots-flare-up-triggers-and-recovery'
    ]
  },
  {
    id: 'sleep',
    label: 'Wired but cannot sleep',
    slugs: [
      'pots-insomnia-wired-but-tired',
      'why-you-feel-better-at-night-mcas',
      'sleep-and-autonomic-recovery',
      'overnight-heart-rate-while-you-sleep'
    ]
  },
  {
    id: 'bp',
    label: 'Blood pressure swings',
    slugs: [
      'labile-blood-pressure-dysautonomia',
      'non-dipping-blood-pressure-nocturnal-dip',
      'orthostatic-hypotension-vs-pots',
      'pots-worse-after-eating-postprandial-hypotension'
    ]
  },
  {
    id: 'gut',
    label: 'Stomach and nausea',
    slugs: [
      'nausea-in-pots-dysautonomia',
      'gastroparesis-pots-dysautonomia',
      'sibo-histamine-gut-dysautonomia',
      'reactive-hypoglycemia-blood-sugar-pots'
    ]
  }
];

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
