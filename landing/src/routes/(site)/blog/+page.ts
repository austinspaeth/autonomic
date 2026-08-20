import { redirect } from '@sveltejs/kit';

// The blog moved to /insights/. Prerenders as a 308 redirect for old links.
export const prerender = true;

export function load() {
  throw redirect(308, '/insights/');
}
