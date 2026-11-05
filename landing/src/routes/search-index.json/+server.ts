// /search-index.json: what the blog's typeahead searches, built at prerender
// from the articles (title, topic and keyword tags) and from the app's own
// pages (features, conditions, comparisons), so a search for "stand test" can
// also offer the part of the app that answers it. The page fetches this only
// when somebody starts typing, so it costs a reader who never searches nothing.
import type { Article } from '../api/articles/types';
import { articleHref } from '$lib/site';
import { topicLabel } from '$lib/topics';
import { FEATURES } from '$lib/v2/features';
import { CONDITIONS } from '$lib/v2/conditions';
import { RIVALS } from '$lib/v2/compare';

export const prerender = true;

/** [kind, title, href, label, tags]. Kind: a = article, p = a page of the app. */
type Row = ['a' | 'p', string, string, string, string];

// Extra words people use for each app page, beyond its name and tagline.
const PAGE_TAGS: Record<string, string> = {
  'hrv-readings': 'hrv heart rate variability reading measure camera apple watch garmin chest strap journal log symptoms rmssd sdnn',
  'pacing-budget': 'pacing energy budget envelope pem crash spoons spoon theory overdo activity limit',
  insights: 'insights triggers what helps supplements correlation patterns magnesium salt',
  'pots-stand-test': 'stand test poor man tilt nasa lean test orthostatic heart rate rise standing dizzy pots test',
  'cycle-tracking': 'cycle period menstrual luteal hormones pms',
  'doctor-reports': 'doctor report summary appointment ai chatgpt claude gemini',
  'apple-watch': 'apple watch wrist heart rate alerts'
};

export async function GET() {
  const paths = import.meta.glob('../../../articles/*.md', { eager: true });
  const rows: Row[] = [];
  for (const path in paths) {
    const file = paths[path];
    const slug = path.split('/').at(-1)?.replace('.md', '');
    if (!file || typeof file !== 'object' || !('metadata' in file) || !slug) continue;
    const a = { ...(file.metadata as Omit<Article, 'slug'>), slug } as Article;
    if (!a.published) continue;
    const tags = [a.question ?? '', a.keywords ?? '', ...(a.categories ?? []).map((c) => topicLabel(c))].join(' ');
    rows.push(['a', a.title, articleHref(a), topicLabel(a.categories?.[0]), tags.toLowerCase()]);
  }
  rows.sort((x, y) => x[1].localeCompare(y[1]));

  for (const f of FEATURES) rows.push(['p', f.name, f.href, f.tag, `${f.name} ${f.tag} ${PAGE_TAGS[f.slug] ?? ''}`.toLowerCase()]);
  rows.push(['p', 'Apple Watch', '/features/apple-watch/', 'Heart rate and stand tests on your wrist', `apple watch ${PAGE_TAGS['apple-watch']}`]);
  for (const c of CONDITIONS) rows.push(['p', `Autonomic for ${c.title}`, c.href, c.question, `${c.title} ${c.name} ${c.question} app tracker`.toLowerCase()]);
  for (const r of RIVALS) rows.push(['p', `Autonomic vs ${r.name}`, `/compare/${r.slug}/`, r.tagline, `${r.name} alternative compare vs versus comparison`.toLowerCase()]);

  return new Response(JSON.stringify(rows), { headers: { 'Content-Type': 'application/json' } });
}
