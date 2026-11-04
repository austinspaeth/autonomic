import { json } from '@sveltejs/kit';
import type { Article } from './types';

/** Minutes to read the body (frontmatter stripped) at ~230 words a minute. */
function readMinutes(raw: string): number {
  const body = raw.replace(/^---[\s\S]*?\n---/, '').replace(/<[^>]+>/g, ' ');
  const words = body.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 230));
}

async function getPosts() {
  let posts: Article[] = [];
  const paths = import.meta.glob('../../../../articles/*.md', { eager: true });
  // The raw markdown, only to count words for the reading time on every card.
  const raws = import.meta.glob('../../../../articles/*.md', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;

  for (const path in paths) {
    const file = paths[path];
    const slug = path.split('/').at(-1)?.replace('.md', '');

    if (file && typeof file === 'object' && 'metadata' in file && slug) {
      const metadata = file.metadata as Omit<Article, 'slug'>;
      const post = { ...metadata, slug, readMin: readMinutes(raws[path] ?? '') } satisfies Article;
      post.published && posts.push(post);
    }
  }

  posts = posts.sort(
    (first, second) => new Date(second.date).getTime() - new Date(first.date).getTime()
  );

  return posts;
}

export async function GET() {
  const posts = await getPosts();
  return json(posts);
}
