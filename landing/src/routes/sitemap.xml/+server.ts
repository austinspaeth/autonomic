import type { Article } from '../api/articles/types';
import { isoDate, articleHref } from '$lib/site';
import { allTopics } from '$lib/topics';
import { writerSlug } from '$lib/writers';

export const prerender = true;

const BASE = 'https://autonomic.care';

export async function GET() {
  const paths = import.meta.glob('../../../articles/*.md', { eager: true });
  const articles: Article[] = [];
  for (const path in paths) {
    const file = paths[path];
    const slug = path.split('/').at(-1)?.replace('.md', '');
    if (file && typeof file === 'object' && 'metadata' in file && slug) {
      const meta = file.metadata as Omit<Article, 'slug'>;
      if (meta.published) articles.push({ ...meta, slug } as Article);
    }
  }

  const writers = [...new Set(articles.map((a) => writerSlug(a.author)))];

  const urls = [
    { loc: `${BASE}/`, priority: '1.0' },
    { loc: `${BASE}/insights/`, priority: '0.8' },
    { loc: `${BASE}/insights/articles/`, priority: '0.6' },
    { loc: `${BASE}/privacy-policy/`, priority: '0.3' },
    { loc: `${BASE}/terms-of-service/`, priority: '0.3' },
    ...allTopics().map((t) => ({ loc: `${BASE}/insights/${t.slug}/`, priority: '0.6' })),
    ...writers.map((w) => ({ loc: `${BASE}/insights/writers/${w}/`, priority: '0.4' })),
    ...articles.map((a) => ({
      loc: `${BASE}${articleHref(a)}`,
      // Prefer the article's `updated` date so search engines re-crawl edits.
      lastmod: isoDate(a.updated || a.date),
      priority: '0.7'
    }))
  ];

  // Freshest article date stamps the home and blog index so their lastmod moves
  // whenever anything is published or updated.
  const newest = articles
    .map((a) => isoDate(a.updated || a.date))
    .filter(Boolean)
    .sort()
    .at(-1);
  for (const u of urls) {
    if ((u.loc === `${BASE}/` || u.loc === `${BASE}/insights/`) && newest && !('lastmod' in u)) {
      (u as { lastmod?: string }).lastmod = newest;
    }
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) =>
      `  <url><loc>${u.loc}</loc>${'lastmod' in u && u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}<priority>${u.priority}</priority></url>`
  )
  .join('\n')}
</urlset>`;

  return new Response(body, { headers: { 'Content-Type': 'application/xml' } });
}
