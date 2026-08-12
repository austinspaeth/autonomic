/**
 * Copy behind every "?" info card in the app.
 *
 * Every info card reads the same way — a short technical definition ("What it
 * is"), what it means for the person reading it ("Why it matters to me"), and a
 * link out to the full article on autonomic.care. Keep each paragraph to three
 * or four lines: the help sheet is `fitContent` (see `Sheet.tsx`), so it does
 * not scroll, and long copy is clipped rather than paged.
 *
 * `learnMore` is a site-relative path with both slashes (the landing site sets
 * `trailingSlash: 'always'`), e.g. `/insights/basics/what-is-sdnn-in-hrv/`.
 * Every path must point at a real article in `landing/articles/`.
 */
export type HelpContent = {
  /** What the metric is, technically. 3–4 lines. */
  what: string;
  /** What it means for their life, symptoms and scores. 3–4 lines. */
  why: string;
  /** Path on autonomic.care, e.g. `/insights/basics/what-is-sdnn-in-hrv/`. */
  learnMore?: string;
};

const SITE = 'https://autonomic.care';

/** `LF/HF ratio` -> `lf-hf-ratio`, so the UTM names the card that sent them. */
export const helpSlug = (title: string) =>
  title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * Absolute URL for a `learnMore` path, or null when the card has no article.
 *
 * Tagged so the landing site's analytics can tell an in-app reader from a
 * search visitor, and can tell WHICH info card sent them: `utm_content` is the
 * card's own title. Nothing identifying rides along, and this is the same
 * link every user of that card gets, so it stays inside the app's no-telemetry
 * promise. Kept pure (the platform is passed in, not read from react-native)
 * because `src/lib` is unit-tested under a plain node environment.
 */
export function helpUrl(h: HelpContent, card: string, platform: string): string | null {
  if (!h.learnMore) return null;
  const q = new URLSearchParams({
    utm_source: `app-${platform}`,
    utm_medium: 'info-card',
    utm_campaign: 'learn-more',
    utm_content: helpSlug(card),
  });
  return `${SITE}${h.learnMore}?${q.toString()}`;
}
