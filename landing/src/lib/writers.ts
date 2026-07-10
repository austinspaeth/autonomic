/**
 * Writer registry for the Insights hub. Mirrors onboardmap's `writers` map:
 * keyed by the lowercased author name exactly as it appears in article
 * frontmatter. Author → URL slug convention: `name.replace(/ /g, '-').toLowerCase()`.
 */
export type Writer = {
  name: string;
  about: string;
};

export const writers: Record<string, Writer> = {
  'austin spaeth': {
    name: 'Austin Spaeth',
    about:
      'Austin builds Autonomic, a private, offline journal for tracking autonomic recovery. He writes about HRV, POTS, dysautonomia and post-viral illness for the people living it, turning messy day-to-day data into signals you can actually act on.'
  }
};

/** author name → URL slug (e.g. "Austin Spaeth" → "austin-spaeth"). */
export const writerSlug = (name: string): string => name.trim().replace(/\s+/g, '-').toLowerCase();

/** URL slug → registry lookup (e.g. "austin-spaeth" → Writer). */
export const getWriter = (slug: string): Writer | undefined =>
  writers[slug.replace(/-/g, ' ').toLowerCase()];

/** URL slug → display name, falling back to a title-cased de-slug. */
export const writerName = (slug: string): string =>
  getWriter(slug)?.name ?? slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
