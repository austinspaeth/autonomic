import { error } from '@sveltejs/kit';

export async function load({ params }) {
  try {
    const post = await import(`../../../../articles/${params.slug}.md`);
    return {
      content: post.default,
      meta: post.metadata
    };
  } catch (e) {
    throw error(404, `Could not find ${params.slug}`);
  }
}

// Tell the static adapter which article pages exist so it prerenders them all.
export async function entries() {
  const paths = import.meta.glob('../../../../articles/*.md');
  return Object.keys(paths).map((path) => ({
    slug: path.split('/').at(-1)!.replace('.md', '')
  }));
}

export const prerender = true;
