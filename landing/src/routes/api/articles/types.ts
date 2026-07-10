export type FaqItem = { q: string; a: string };

export type Article = {
  title: string;
  slug: string;
  author: string;
  description: string;
  summary: string;
  tldr?: string;
  date: string;
  updated?: string;
  categories: string[];
  published: boolean;
  featured?: boolean;
  photoLocation?: string;
  photoAttribution?: string;
  /** Optional Q&A pairs, rendered as a visible FAQ and emitted as FAQPage JSON-LD. */
  faq?: FaqItem[];
};
