import { sveltePreprocess } from 'svelte-preprocess';
import { mdsvex } from 'mdsvex';
import adapter from '@sveltejs/adapter-static';

/** @type {import('mdsvex').MdsvexOptions} */
const mdsvexOptions = {
  extensions: ['.md'],
};

export default {
  extensions: ['.svelte', '.md'],
  preprocess: [sveltePreprocess(), mdsvex(mdsvexOptions)],
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: undefined,
      precompress: true,
      strict: true
    }),
    prerender: {
      handleUnseenRoutes: 'ignore',
      handleHttpError: 'warn',
      handleMissingId: 'ignore'
    }
  }
};
