import type { Article } from '../api/articles/types';
import { articleHref } from '$lib/site';

export const prerender = true;

const BASE = 'https://autonomic.care';

const esc = (s = '') =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** RFC-822 date (e.g. "Thu, 28 May 2026 00:00:00 GMT") for <pubDate>. */
function rfc822(input: string | Date): string {
  const iso = input instanceof Date ? input.toISOString() : String(input);
  const m = iso.match(/(\d{4})-(\d{2})-(\d{2})/);
  const d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toUTCString();
}

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
  articles.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const items = articles
    .map(
      (a) => `    <item>
      <title>${esc(a.title)}</title>
      <link>${BASE}${articleHref(a)}</link>
      <guid isPermaLink="true">${BASE}${articleHref(a)}</guid>
      <pubDate>${rfc822(a.updated || a.date)}</pubDate>
      <dc:creator>${esc(a.author)}</dc:creator>
      <description>${esc(a.summary || a.description)}</description>
${(a.categories ?? []).map((c) => `      <category>${esc(c)}</category>`).join('\n')}
    </item>`
    )
    .join('\n');

  const lastBuild = articles[0] ? rfc822(articles[0].updated || articles[0].date) : '';

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>The Autonomic Blog</title>
    <link>${BASE}/insights/</link>
    <atom:link href="${BASE}/rss.xml" rel="self" type="application/rss+xml" />
    <description>HRV, POTS, dysautonomia and post-viral recovery, explained for the people living it.</description>
    <language>en-us</language>
    <copyright>© Autonomic</copyright>
    <generator>Autonomic</generator>${lastBuild ? `\n    <lastBuildDate>${lastBuild}</lastBuildDate>` : ''}
    <image>
      <url>${BASE}/web-app-manifest-512x512.png</url>
      <title>The Autonomic Blog</title>
      <link>${BASE}/insights/</link>
    </image>
${items}
  </channel>
</rss>`;

  return new Response(body, { headers: { 'Content-Type': 'application/xml' } });
}
