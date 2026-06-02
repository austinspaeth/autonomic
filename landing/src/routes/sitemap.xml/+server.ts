import type { Article } from '../api/articles/types';

export const prerender = true;

const BASE = 'https://autonomic.app';

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

  const urls = [
    { loc: `${BASE}/`, priority: '1.0' },
    { loc: `${BASE}/blog/`, priority: '0.7' },
    ...articles.map((a) => ({ loc: `${BASE}/blog/${a.slug}/`, lastmod: a.date, priority: '0.6' }))
  ];

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
