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

export {};
