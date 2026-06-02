export type Article = {
  title: string;
  slug: string;
  author: string;
  description: string;
  summary: string;
  tldr?: string;
  date: string;
  categories: string[];
  published: boolean;
  photoLocation?: string;
  photoAttribution?: string;
};
