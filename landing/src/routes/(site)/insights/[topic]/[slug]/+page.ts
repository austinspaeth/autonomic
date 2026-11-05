import { error } from '@sveltejs/kit';

// The raw markdown, read at prerender only, for what the structured data says
// about the article that its frontmatter does not: how long it is and which
// sources it cites (everything under a Sources heading, plus any link to a
// research or clinical host in the text).
const raws = import.meta.glob('../../../../../../articles/*.md', { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>;

export type Citation = { name: string; url: string };

// Research and clinical hosts: when an article has no Sources section, links to
// these anywhere in its body are what it cites.
const RESEARCH = /(^|\.)(doi\.org|ncbi\.nlm\.nih\.gov|nih\.gov|nature\.com|nice\.org\.uk|medrxiv\.org|biorxiv\.org|cdc\.gov|who\.int|frontiersin\.org|wiley\.com|sciencedirect\.com|springer\.com|pnas\.org|jacionline\.org|cureus\.com|ahajournals\.org|bmj\.com|thelancet\.com|jamanetwork\.com|nejm\.org|academic\.oup\.com|journals\.plos\.org|mdpi\.com|cochranelibrary\.com|dysautonomiainternational\.org|batemanhornecenter\.org|mayoclinic\.org|clevelandclinic\.org)$/;

function citationsIn(raw: string): Citation[] {
  const out: Citation[] = [];
  const seen = new Set<string>();
  const add = (name: string, url: string, anyHost: boolean) => {
    const clean = name.replace(/<[^>]+>/g, '').replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();
    if (!/^https?:\/\//.test(url) || url.includes('autonomic.care') || seen.has(url)) return;
    if (!anyHost) {
      try { if (!RESEARCH.test(new URL(url).hostname)) return; } catch { return; }
    }
    seen.add(url);
    out.push({ name: clean || url, url });
  };
  const scan = (text: string, anyHost: boolean) => {
    for (const x of text.matchAll(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g)) add(x[1], x[2], anyHost);
    for (const x of text.matchAll(/<a[^>]+href="(https?:[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) add(x[2], x[1], anyHost);
  };
  // A Sources section is the author's own list: everything in it counts.
  const m = raw.match(/\n#{2,3}\s*(Sources|References|Further reading)[^\n]*\n([\s\S]*?)(?=\n#{1,2}\s|$)/i);
  if (m) scan(m[2], true);
  // Then any research link cited in the text.
  scan(raw.replace(/^---[\s\S]*?\n---/, ''), false);
  return out.slice(0, 40);
}

function wordsIn(raw: string): number {
  const body = raw.replace(/^---[\s\S]*?\n---/, '').replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ');
  return body.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w)).length;
}

export async function load({ params }) {
  try {
    const post = await import(`../../../../../../articles/${params.slug}.md`);
    const readRaw = raws[`../../../../../../articles/${params.slug}.md`];
    const raw = readRaw ? await readRaw() : '';
    return {
      content: post.default,
      meta: post.metadata,
      citations: citationsIn(raw),
      wordCount: wordsIn(raw)
    };
  } catch (e) {
    throw error(404, `Could not find ${params.slug}`);
  }
}

export const prerender = true;
