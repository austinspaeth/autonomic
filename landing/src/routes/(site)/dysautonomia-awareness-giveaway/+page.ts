import { redirect } from '@sveltejs/kit';

// The October 2026 giveaway is over. Prerenders as a 308 redirect so shared
// links and the giveaway article land on the home page, not a 404.
export const prerender = true;

export function load() {
  throw redirect(308, '/');
}
