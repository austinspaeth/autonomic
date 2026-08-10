import type { Article } from './routes/api/articles/types';

declare global {
  namespace App {
    // interface Error {}
    // interface Locals {}
    interface PageData {
      articles?: Article[];
    }
    // interface Platform {}
  }
}

/* Vite's `?raw` imports. /master inlines its stylesheet, markup and scripts
   into one prerendered document this way. */
declare module '*?raw' {
  const contents: string;
  export default contents;
}

export {};
