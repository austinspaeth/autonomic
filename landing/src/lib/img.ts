// Unsplash serves any width on request (imgix under the hood), so a cover is
// asked for at the size it is drawn rather than at the 1760px the article
// frontmatter names. Anything not on images.unsplash.com (the local covers
// under /articles/) is passed through untouched: those are already sized.

const UNSPLASH = 'images.unsplash.com';

export const isUnsplash = (src = ''): boolean => src.includes(UNSPLASH);

/** The same Unsplash photo at width `w`, cropped and auto-formatted (AVIF/WebP). */
export function unsplashAt(src: string, w: number, q = 70): string {
  if (!isUnsplash(src)) return src;
  try {
    const u = new URL(src);
    u.searchParams.set('w', String(w));
    u.searchParams.set('q', String(q));
    u.searchParams.set('auto', 'format');
    u.searchParams.set('fit', 'crop');
    // Tracking params, not image params.
    u.searchParams.delete('ixid');
    u.searchParams.delete('ixlib');
    return u.toString();
  } catch {
    return src;
  }
}

/** A srcset over `widths` for an Unsplash photo, or undefined for anything else. */
export const unsplashSrcset = (src: string, widths: number[]): string | undefined =>
  isUnsplash(src) ? widths.map((w) => `${unsplashAt(src, w)} ${w}w`).join(', ') : undefined;

/** Widths and `sizes` for the places a cover is drawn. */
export const COVER_SIZES = {
  card: { widths: [400, 600, 800, 1000], sizes: '(max-width: 620px) calc(100vw - 32px), (max-width: 900px) 50vw, 400px', fallback: 800 },
  hero: { widths: [800, 1200, 1600, 2000], sizes: '100vw', fallback: 1600 },
  thumb: { widths: [200, 320, 480], sizes: '160px', fallback: 320 }
} as const;

export type CoverSize = keyof typeof COVER_SIZES;
