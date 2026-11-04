import { error } from '@sveltejs/kit';
import { RIVALS, rivalBySlug } from '$lib/v2/compare';

export const entries = () => RIVALS.map((r) => ({ slug: r.slug }));

export const load = ({ params }) => {
  const rival = rivalBySlug(params.slug);
  if (!rival) throw error(404, 'No such comparison');
  return { slug: rival.slug };
};
