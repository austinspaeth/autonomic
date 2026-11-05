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
  /** Minutes to read, counted from the body by the articles API. */
  readMin?: number;
  keywords?: string;
  /** When the article was last checked against its sources. */
  reviewed?: string;
  /** The plain question the article answers, shown above the title and searched. */
  question?: string;
  /** The app feature the article leads to, and its tailored hook and line (see $lib/v2/articlePitch). */
  app?: { feature?: string; hook?: string; line?: string };
};
