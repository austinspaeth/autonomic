export const site = {
  name: 'Autonomic',
  url: 'https://autonomic.care',
  tagline: 'See your nervous system recover.',
  description:
    "Autonomic is a private, offline journal that scores your daily HRV, blood pressure, sleep and orthostatic readings against medical thresholds, so people recovering from POTS, dysautonomia and post-viral illness can see what's helping and what's hurting.",
  ogImage: 'https://autonomic.care/og.png'
};

/**
 * Canonical store URLs — no attribution params. These are the identity of the
 * listing: use them for structured data (`downloadUrl` / `installUrl`) and
 * anywhere a machine reads the URL. Human-facing CTAs should use `storeUrl()`
 * below so the download is credited to the site.
 */
export const appStoreUrl = 'https://apps.apple.com/app/id6789786971';
export const playStoreUrl =
  'https://play.google.com/store/apps/details?id=com.autonomic.journal';

/**
 * Attribution defaults. `APPLE_PROVIDER_TOKEN` is the account-level provider id
 * from App Store Connect (App Analytics -> Acquisition -> Campaigns); Apple only
 * attributes a campaign when BOTH `pt` and `ct` are present. Google Play has no
 * account token — the whole campaign rides in one URL-encoded `referrer` value.
 */
const APPLE_PROVIDER_TOKEN = '126963570';
const DEFAULT_CAMPAIGN = 'Landing';

/**
 * A store URL tagged so the download shows up as coming from this site.
 *
 * iOS  -> App Store Connect, App Analytics -> Acquisition -> Campaigns.
 *         Campaign tokens are free-form (<= 40 chars) and need no registration,
 *         but a campaign stays hidden until it has 24h and 5 first-time
 *         downloads behind it.
 * Play -> Play Console, Acquisition reports -> User acquisition, split by the
 *         utm_source / utm_medium / utm_campaign inside `referrer`.
 *
 * Every "Download" CTA across the site points at one of these (one download per
 * platform, the plan is chosen in-app). The site-wide script in `app.html`
 * sniffs the platform and either deep-links a phone straight to its store or
 * opens the dual-download modal (iOS + Android + QR) on desktop / unknown
 * platforms — it carries its own copy of these URLs, so keep the two in sync.
 */
export function storeUrl(platform: 'ios' | 'android', campaign = DEFAULT_CAMPAIGN): string {
  if (platform === 'ios') {
    return `https://apps.apple.com/app/apple-store/id6789786971?pt=${APPLE_PROVIDER_TOKEN}&ct=${encodeURIComponent(campaign)}&mt=8`;
  }
  const referrer = `utm_source=autonomic.care&utm_medium=referral&utm_campaign=${campaign.toLowerCase()}`;
  return `${playStoreUrl}&referrer=${encodeURIComponent(referrer)}`;
}

/** Tagged store URLs for the ordinary site-wide download CTAs. */
export const appStoreLink = storeUrl('ios');
export const playStoreLink = storeUrl('android');

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

/**
 * The App Store rating, shown as social proof beside the CTAs. `reviews` is the
 * public review COUNT — leave it null until there are enough of them to help
 * (a "5.0 from 2 ratings" reads worse than no number at all); once set, every
 * surface that renders the stars picks it up.
 *
 * Only ever state what the App Store page actually shows. Google Play has its
 * own, separate rating, so this is deliberately labelled as Apple's.
 */
export const rating: { stars: number; label: string; store: string; reviews: number | null } = {
  stars: 5,
  label: '5.0',
  store: 'App Store',
  reviews: null
};

/**
 * The competitor in the #compare table. Prices are THEIRS, checked by hand —
 * re-check them before a release, and keep the savings derived rather than
 * typed so a change to our own pricing can't leave a stale number on the page.
 */
export const competitor = {
  name: 'Welltory',
  monthly: 19.99,
  yearly: 119.99
};

/** Whole dollars saved per year against the competitor's yearly plan. */
export const yearlySaveVsCompetitor = Math.round(competitor.yearly - pricing.yearly);

/** The waveform pulse mark, shared by nav / footer / CTA. */
/** The app's real brand mark (mobile `logo.svg`, same path as `BrandMark` in the
 *  app's Icon.tsx). Used where a mock has to show the app itself, e.g. the
 *  phone tab bar in the hero and the sidebar. viewBox: 0 0 651.59 348.34. */
export const APP_MARK_PATH =
  'M293.47,286.32c-4.46,4.22-10.3,6.66-16.35,5.93-3.48-.42-7.26-1.31-9.97-3.53-6.53-5.36-9.98-11.85-12.82-19.66l-6-16.52c-.7-1.92-2.25-5.38-4.84-4.46-1.75.62-3.73,3.12-4.77,4.6l-5.63,7.99-8.79,11.7c-6.3,8.39-19.54,18.71-29.89,17.9l-6.48-.51c-4.3-.34-8.27-3.21-11.33-5.88-4.21-3.67-6.39-7.98-8.81-12.83l-4.65-9.3c-1.86-.98-4.91-.41-6.58.79l-11.95,8.61c-11.19,8.06-20.99,12.9-35,14.63l-6.23.77-5.72.73-50.4-.09-15.68-.47-20.32-.53c-2.75-.07-5.85-.24-8.17-1.27-3.37-1.5-3.85-5.08-2.13-7.9,1.21-2,3.01-3.46,5.6-3.46h13.32s4.57.6,4.57.6l55.95-.21,14.35-1.23c5.96-.51,11.84-1.12,17.4-2.99l4.92-1.65c11.1-3.73,24.06-16.18,34.12-21.26,9.88-4.99,20.87-2.07,25.91,6.9l2.34,4.16,5.51,10.59c2.24,4.3,7.95,4.99,12.13,2.7,3.35-1.83,6.32-3.88,8.78-6.75l5.99-7.01,3.95-5.09,12.8-19.17,2.97-3.97,6.79-6.82,4.56-2.18c5.89-.5,8.8-.13,13.21,3.5,8.2,6.75,12.49,25.08,15.25,36.25,1.65,6.66,5.03,14.66,10.94,11.97,4.15-1.89,7.02-5.33,9.62-8.93,1.04-1.44,1.98-2.59,1.72-4.52l-.97-7.06-.52-20.66-.02-15.07.34-20.7.7-10.1.48-14.85,1.01-13.58.93-13.45.44-7.08.81-6.52.48-7.94.46-5.02,1.1-9.46.87-6.06.5-5.32.99-6.07.98-6,.91-6.06,1.12-7.9.99-5.45.97-4.47,1.6-7.2,3.86-15.93,4.45-13.28c2.78-8.29,7.98-18.87,15.74-22.18,6.82-2.91,13.44.51,17.2,6.76,4.18,6.95,5.75,14.56,6.84,22.61l.74,5.46.96,7.09c.33,2.47.93,4.86.7,7.51l.78,6.13.09,40.23c-1.6,3.22-.27,6.95-1.11,10.94-.38,1.81-.51,3.32-.69,5.19l-.67,7.02-.86,8.01c-1.34,12.47-4.03,24.36-6.98,36.41l-1.99,8.13-8.3,28.62-1.62,5-2.25,6.61-5.84,16.21c-3.42,9.48-7.34,18.46-12.08,27.49,1.16,4.87.89,9.58,1.39,14.43l.89,8.58,1.25,10.11c.76,6.11,2.72,11.62,5.35,17.09.35.73,2.22,1.51,2.97,1.36,3.63-.71,9.23-17.56,11.32-24.06l6.22-19.27,5.97-17.98,5.54-14.95,4.3-10.81,4.55-9.88,6.71-11.28c3.05-5.13,7.8-8.51,13.27-11.33,3.31-1.71,7.88-2.26,11.65-1.7,6.23.92,10.87,4.71,14.24,9.71,2.36,3.5,4.65,6.91,6.17,10.81l1.94,4.98,1.81,4.64,8.79,23.3c1.77,4.69,4.09,8.59,6.75,12.81,6.76,10.74,17.04,17.91,29.79,19.74l5.84,1.14,8.4.27,12.02.02,20.52-.19,8.8-.86,27.18-.12,3.03-.55,65.39.02,4.04.57,21.32.18c2.42.02,5.42,1.81,6.8,3.64.71.94.79,3.86.16,4.87-.89,1.42-2.77,2.9-4.38,3.69l-74.53.21-11.11.57-15.21.37-3.97.38-6.05.28-10.98.54-14.54.9-16.98,1.06-18.39.04-7.07-.76-5.76-.69c-9.49-1.13-18.19-4.82-25.74-11.03-3.25-2.67-6.83-5.62-9.1-9.07l-7.4-11.25-2.05-3.94-7.48-17.02c-3.37-7.65-7.91-26.07-15.83-26.17-8.6-.11-17.85,28.2-21.04,38.31l-5.52,17.47-10.52,33.47c-3.48,11.07-7.3,21.61-12.57,31.87l-3.44,6.07c-2.12,3.74-5.09,6.55-8.54,9-12.68,8.97-23.82-10.25-28.29-22.86-4.12-11.94-7.02-23.82-9.05-36.26l-.73-1.19c-.17-.27-.83.21-1.44.6ZM315.85,206.67l5.3-15.42,4.79-15.32,4.93-15.94,5.86-22.99,1.07-4.89.88-4.51,1.19-6.4.94-5.06.92-5.14,1.02-5.96.88-6.57.79-9.5.5-5.52.09-13-.13-17.49-.75-8.93-.97-7.5-.95-5.55-1.04-4.78-2.48-9.47c-2.84,5.64-4.55,11.49-5.89,17.67l-2.03,9.33-.94,5.18-.92,5.57-.75,5.04-1.01,7.97-1.26,11.96-.87,6.1-.44,6.26-.78,7.19-.65,4.65-.54,9.73c-.13,2.28-.51,4.25-.72,6.6l-.69,7.5-.79,12.97-1.04,13.05-.77,10.45-.9,12.05-1.03,14.41-.39,6.09-.44,10.18Z';

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
