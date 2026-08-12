/**
 * Guards the "?" info cards.
 *
 * Every card is three parts (what / why / Learn more), and the Learn more
 * button is the one place the app links out to autonomic.care. That link is a
 * string in this repo pointing at an article in another folder of it, so
 * nothing but a test stops a renamed slug or a re-categorised article from
 * turning the button into a 404 in a shipped build. The source scan is
 * deliberate: most of the copy maps (BP_HELP, ORTHO_HELP, ...) are private to
 * their component module and importing those would drag React Native in.
 */
import fs from 'fs';
import path from 'path';
import { HRV_HELP } from '../scoring';
import { helpSlug, helpUrl } from '../help';

const MOBILE = path.resolve(__dirname, '../../..');
const ARTICLES = path.resolve(MOBILE, '../landing/articles');

/** Every source file that carries info-card copy. */
const SOURCES = [
  'src/lib/scoring/index.ts',
  'src/lib/analysis/categories.ts',
  'src/components/summary.tsx',
  'src/features/HrvProgress.tsx',
];

const learnMorePaths = () => {
  const found: { file: string; p: string }[] = [];
  for (const f of SOURCES) {
    const src = fs.readFileSync(path.join(MOBILE, f), 'utf8');
    for (const m of src.matchAll(/learnMore: '([^']+)'/g)) found.push({ file: f, p: m[1] });
  }
  return found;
};

/** `categories[0]` decides an article's URL topic segment (landing `site.ts`). */
const frontmatter = (slug: string) => {
  const file = path.join(ARTICLES, `${slug}.md`);
  if (!fs.existsSync(file)) return null;
  const src = fs.readFileSync(file, 'utf8');
  const topic = src.match(/^categories:\n\s+- (\S+)/m)?.[1] ?? null;
  return { topic, published: /^published:\s*true\s*$/m.test(src) };
};

describe('info card Learn more links', () => {
  const paths = learnMorePaths();

  it('finds the copy (guards against the scan silently matching nothing)', () => {
    expect(paths.length).toBeGreaterThan(40);
  });

  it.each([...new Set(paths.map((x) => x.p))])('%s resolves to a published article', (p) => {
    const m = p.match(/^\/insights\/([^/]+)\/([^/]+)\/$/);
    expect(m).not.toBeNull();
    const [, topic, slug] = m!;
    const fm = frontmatter(slug);
    expect(fm).not.toBeNull();          // article file exists
    expect(fm!.published).toBe(true);
    expect(fm!.topic).toBe(topic);      // URL segment matches categories[0]
  });
});

describe('info card copy', () => {
  const entries = Object.entries(HRV_HELP);

  it('covers every HRV metric with all three parts', () => {
    expect(entries.length).toBeGreaterThan(20);
    for (const [key, h] of entries) {
      expect(`${key}: ${h.what.trim()}`).not.toMatch(/: $/);
      expect(`${key}: ${h.why.trim()}`).not.toMatch(/: $/);
      expect(helpUrl(h, key, 'ios')).toMatch(/^https:\/\/autonomic\.care\/insights\//);
    }
  });

  it('stays short enough for the fitContent sheet, which does not scroll', () => {
    for (const [key, h] of entries) {
      expect([key, h.what.length]).toEqual([key, expect.any(Number)]);
      expect(h.what.length).toBeLessThanOrEqual(360);
      expect(h.why.length).toBeLessThanOrEqual(360);
    }
  });

  it('avoids em dashes, per the app copy convention', () => {
    for (const [key, h] of entries) expect([key, `${h.what}${h.why}`]).not.toContain('—');
  });
});

describe('Learn more UTM tagging', () => {
  it('names the app, the surface, the platform and the card', () => {
    const url = helpUrl(HRV_HELP.rmssd, 'LF/HF ratio', 'android')!;
    const q = new URL(url).searchParams;
    expect(url.startsWith('https://autonomic.care/insights/basics/rmssd-and-pnn50-vagal-tone-metrics/?')).toBe(true);
    expect(q.get('utm_source')).toBe('app-android');
    expect(q.get('utm_medium')).toBe('info-card');
    expect(q.get('utm_campaign')).toBe('learn-more');
    expect(q.get('utm_content')).toBe('lf-hf-ratio');
  });

  it('has no button, and so no URL, when a card has no article', () => {
    expect(helpUrl({ what: 'a', why: 'b' }, 'Whatever', 'ios')).toBeNull();
  });

  it('slugs titles carrying punctuation and ampersands', () => {
    expect(helpSlug('Medications & Supplements')).toBe('medications-supplements');
    expect(helpSlug('Δ after 1 minute')).toBe('after-1-minute');
  });
});
