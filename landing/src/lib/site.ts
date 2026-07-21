export const site = {
  name: 'Autonomic',
  url: 'https://autonomic.care',
  tagline: 'See your nervous system recover.',
  description:
    "Autonomic is a private, offline journal that scores your daily HRV, blood pressure, sleep and orthostatic readings against medical thresholds, so people recovering from POTS, dysautonomia and post-viral illness can see what's helping and what's hurting.",
  ogImage: 'https://autonomic.care/og.png'
};

/**
 * Canonical Apple App Store URL. Every iOS "Download on the App Store" CTA
 * across the site points here (one download, the plan is chosen in-app).
 */
export const appStoreUrl = 'https://apps.apple.com/app/id6789786971';

/**
 * The freemium model, as the app actually ships it: the journal is free
 * forever, Autonomic Pro is an auto-renewing subscription, and every fresh
 * install opens with `trialDays` of full Pro access (no card, no account).
 *
 * Keep in sync with the app:
 *  - prices  -> mobile/src/store/iap.ts (FALLBACK_PRICE) + the store products
 *  - trial   -> mobile/src/lib/tier.ts (TRIAL_DAYS)
 */
export const pricing = {
  currency: 'USD',
  monthly: 7.99,
  yearly: 49.99,
  trialDays: 7
};

/** `$7.99` — trailing cents kept, so the number reads like the store charge. */
export const priceLabel = (n: number): string => `$${n.toFixed(2)}`;

/** Yearly vs 12 × monthly, as a whole-percent saving. */
export const yearlySavePct = Math.round((1 - pricing.yearly / (pricing.monthly * 12)) * 100);

/** The waveform pulse mark, shared by nav / footer / CTA. */
export const BRAND_POLYLINE =
  '41,266 179,266 200,225 220,307 246,92 272,420 297,240 317,266 471,266';

/** Canonical article URL: nested under its primary topic, e.g. /insights/hrv/<slug>/. */
export const articleHref = (a: { categories?: string[]; slug: string }): string =>
  `/insights/${a.categories?.[0] ?? 'basics'}/${a.slug}/`;

/**
 * The cornerstone "pillar" articles, in the exact order they should appear in the
 * "Start here" rail. Each entry is an article slug; the sidebar resolves it to the
 * live article record so titles/links stay in sync with the markdown frontmatter.
 * Order encodes the site's spine: understand → measure → who → recover → the tool.
 */
export const PILLARS: string[] = [
  'autonomic-nervous-system-and-dysautonomia-guide',
  'hrv-complete-guide',
  'pots-long-covid-and-mcas-overlap',
  'recovery-from-post-viral-dysautonomia',
  'autonomic-app-measure-analyze-monitor-act'
];

/** Short "Start here" labels for the pillars, keyed by slug (kept terse for the rail). */
export const PILLAR_LABELS: Record<string, string> = {
  'autonomic-nervous-system-and-dysautonomia-guide': 'What dysautonomia is',
  'hrv-complete-guide': 'How to measure HRV',
  'pots-long-covid-and-mcas-overlap': 'POTS, Long COVID & MCAS',
  'recovery-from-post-viral-dysautonomia': 'How recovery works',
  'autonomic-app-measure-analyze-monitor-act': 'How Autonomic helps'
};

/** Display labels for the category slugs used in article frontmatter. */
export const CATEGORY_LABELS: Record<string, string> = {
  hrv: 'HRV',
  food: 'Food',
  pots: 'POTS',
  postviral: 'Long COVID',
  recovery: 'Recovery',
  app: 'The app',
  research: 'Research',
  basics: 'Basics',
  // legacy slugs, kept so older references still resolve to a friendly label
  metrics: 'Metrics',
  orthostatic: 'Orthostatic',
  ai: 'AI insights'
};

/** Pretty label for a category slug, falling back to a humanized form. */
export const categoryLabel = (slug?: string): string =>
  !slug ? '' : CATEGORY_LABELS[slug] ?? slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Format an article date for display. Frontmatter dates arrive in two shapes:
 * a `Date` on the article page (raw mdsvex metadata) or an ISO string over the
 * JSON API. Unquoted YAML parses `2026-05-28` as UTC midnight, so we extract the
 * calendar Y-M-D and rebuild a *local* date to avoid a timezone off-by-one.
 */
export function formatDate(input?: string | Date, style: 'long' | 'short' = 'long'): string {
  const d = toDate(input);
  if (!d) return '';
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: style === 'short' ? 'short' : 'long',
    day: 'numeric'
  });
}

/** Same date as a machine-readable `YYYY-MM-DD` (for `<time>`, sitemaps, feeds). */
export function isoDate(input?: string | Date): string {
  const m = String(input instanceof Date ? input.toISOString() : input ?? '').match(
    /(\d{4})-(\d{2})-(\d{2})/
  );
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

function toDate(input?: string | Date): Date | null {
  if (!input) return null;
  const iso = input instanceof Date ? input.toISOString() : String(input);
  const m = iso.match(/(\d{4})-(\d{2})-(\d{2})/);
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}
