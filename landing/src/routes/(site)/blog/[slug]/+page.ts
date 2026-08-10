import { redirect, error } from '@sveltejs/kit';

// Old flat article URLs (/blog/<slug>/) now 308-redirect to the topic-nested
// /insights/<topic>/<slug>/. entries() lists every slug so each old URL is
// prerendered as a redirect.
export const prerender = true;

export async function load({ params }) {
  let topic = 'basics';
  try {
    const post = await import(`../../../../../articles/${params.slug}.md`);
    topic = post.metadata?.categories?.[0] ?? 'basics';
  } catch (e) {
    throw error(404, `Could not find ${params.slug}`);
  }
  throw redirect(308, `/insights/${topic}/${params.slug}/`);
}

export function entries() {
  const paths = import.meta.glob('../../../../../articles/*.md');
  return Object.keys(paths).map((path) => ({
    slug: path.split('/').at(-1)!.replace('.md', '')
  }));
}
