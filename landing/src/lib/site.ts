export const site = {
  name: 'Autonomic',
  url: 'https://autonomic.app',
  tagline: 'Read your nervous system like a recovery instrument.',
  description:
    "Autonomic is a private, offline journal that scores your daily HRV, blood pressure, ECG, sleep and orthostatic readings against medical thresholds — so people recovering from POTS, dysautonomia and post-viral illness can see what's helping and what's hurting.",
  ogImage: 'https://autonomic.app/og.png',
  price: 50,
  currency: 'USD'
};

/** The waveform pulse mark, shared by nav / footer / CTA. */
export const BRAND_POLYLINE =
  '41,266 179,266 200,225 220,307 246,92 272,420 297,240 317,266 471,266';

/** Display labels for the category slugs used in article frontmatter. */
export const CATEGORY_LABELS: Record<string, string> = {
  hrv: 'HRV',
  pots: 'POTS',
  basics: 'Basics',
  orthostatic: 'Orthostatic',
  recovery: 'Recovery',
  ai: 'AI insights'
};

/** Pretty label for a category slug, falling back to a humanized form. */
export const categoryLabel = (slug?: string): string =>
  !slug ? '' : CATEGORY_LABELS[slug] ?? slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
