export const prerender = true;
export const csr = false;
export const trailingSlash = 'always';

import type { Article } from './api/articles/types';

export const load = async ({ fetch }) => {
  const response = await fetch('/api/articles');
  const articles: Article[] = await response.json();
  return { articles };
};
