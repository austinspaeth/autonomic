// Rendered only to be screenshotted by scripts/gen-feature-og.mjs. Nothing
// links here, so the prerender crawl never reaches it and it does not ship.
import { error } from '@sveltejs/kit';
import { CARDS } from './cards';

export const load = ({ params }) => {
  if (!(params.slug in CARDS)) throw error(404, 'No such card');
  return { slug: params.slug };
};
