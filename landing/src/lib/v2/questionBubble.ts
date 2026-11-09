/* Does the reader's question say anything the title doesn't?
 *
 * Every article carries a `question` field: the question in the reader's own
 * words. It is searched by the blog's typeahead and sent to search engines as
 * `alternativeHeadline`, so it is always written. It is only SHOWN above the
 * title when it is not simply the title again.
 *
 * Since 2026-11-04 a new article's title IS its question (ARTICLES.md, "The
 * question rule"), so on new articles the two are the same sentence with "my"
 * inserted and the bubble reads as a stutter: "Does stress make my POTS
 * worse?" over "Does Stress Make POTS Worse?". The older catalogue is the
 * opposite case, essay titles over a real reframing ("Coat Hanger Pain: Why
 * Your Neck and Shoulders Ache When You Stand" over "Why do my neck and
 * shoulders ache when I stand?"), and those keep their bubble.
 *
 * So the test is on MEANING, not on the strings: both sides are reduced to
 * content words (case, punctuation, person and plurals dropped) and the
 * question is a restatement when it adds no word of its own. An exact compare
 * is what let the new articles through, since "my" is a difference.
 */

/** Words that carry no meaning here. Interrogatives are NOT in the list: "why"
 *  against "how" is a different question and must count as a difference. */
const FILLER = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'so', 'of', 'to', 'in', 'on', 'at', 'for', 'from', 'with',
  'i', 'me', 'my', 'mine', 'myself', 'you', 'your', 'yours', 'it', 'its', 'they', 'them', 'their',
  'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'do', 'does', 'did', 'have', 'has', 'had',
  'this', 'that', 'these', 'those', 'there', 'then', 'just', 'ever', 'actually', 'really', 'about'
]);

/** Crudely singularised, so a title's "families" meets a question's "family". */
const stem = (w: string): string => {
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
};

/** Content words, lowercased, depunctuated and singularised. */
export function contentWords(s: string): Set<string> {
  const out = new Set<string>();
  for (const raw of (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ')) {
    if (raw && !FILLER.has(raw)) out.add(stem(raw));
  }
  return out;
}

/** How many words both share, over how many they use between them (0 to 1). */
const overlap = (a: Set<string>, b: Set<string>): number => {
  let shared = 0;
  for (const w of a) if (b.has(w)) shared += 1;
  return shared / (a.size + b.size - shared);
};

/** Past this much shared vocabulary the two sentences are the same question. */
export const SAME_QUESTION = 0.7;

/**
 * True when the question is the title again: the two are built from
 * substantially the same content words. Either side being empty counts as a
 * restatement, since an empty bubble is nothing to show.
 *
 * The comparison is SYMMETRIC on purpose. "The title already contains every
 * word of the question" sounds like the same test and is not: it hides the
 * case the bubble exists for, an essay title whose jargon the question
 * translates ("Coat Hanger Pain: Why Your Neck and Shoulders Ache When You
 * Stand"), where the question adds no word but the title adds four. A bubble
 * is only a stutter when NEITHER sentence says anything the other doesn't.
 */
export function restatesTitle(question: string | undefined, title: string | undefined): boolean {
  const q = contentWords(question ?? '');
  const t = contentWords(title ?? '');
  if (!q.size || !t.size) return true;
  return overlap(q, t) >= SAME_QUESTION;
}

/** The question to show above the title, or '' when it would only repeat it. */
export const questionBubble = (question?: string, title?: string): string =>
  restatesTitle(question, title) ? '' : (question ?? '').trim();
