/* The question bubble above an article's title, from ARTICLES.md's question rule.
 *
 * Every article carries a `question` (the typeahead searches it, search engines
 * get it as alternativeHeadline), but it is only SHOWN above the title when it
 * says something the title does not. Since the question rule a new article's
 * title IS its question, so there the bubble would read as a stutter; the older
 * essay-titled catalogue is the case it exists for.
 *
 *   node tests/question-bubble.test.mjs
 */
import fs from 'node:fs';
import { restatesTitle, questionBubble, contentWords } from '../src/lib/v2/questionBubble.ts';

const DIR = new URL('../articles/', import.meta.url).pathname;
const PAGE = new URL('../src/routes/(site)/insights/[topic]/[slug]/+page.svelte', import.meta.url).pathname;
const QUESTION_RULE_FROM = '2026-11-05';

const failures = [];
const fail = (m) => failures.push(m);
const unq = (v = '') => v.trim().replace(/^"(.*)"$/s, '$1').replace(/^'(.*)'$/s, '$1');
const field = (fm, key) => {
  const m = fm.match(new RegExp(`^${key}:[ \\t]*(.*)$`, 'm'));
  return m ? unq(m[1]) : '';
};

/* 1. The rule itself. */

// The same question with a pronoun inserted, which is what the question rule
// produces and what an exact string compare used to let through.
if (!restatesTitle('Does stress make my POTS worse?', 'Does Stress Make POTS Worse?'))
  fail('a title-with-"my" question is not read as a restatement');
if (!restatesTitle('Is POTS an autoimmune disease?', 'Is POTS an Autoimmune Disease?'))
  fail('an identical question is not read as a restatement');
if (!restatesTitle('How do I measure HRV accurately at home?', 'How to Measure HRV Accurately at Home'))
  fail('"How do I X" against "How to X" is not read as a restatement');

// The case the bubble exists for: an essay title whose jargon it translates.
// The question adds no word of its own, so a one-sided "the title contains it
// all" test would wrongly hide this one.
if (restatesTitle('Why do my neck and shoulders ache when I stand?', 'Coat Hanger Pain: Why Your Neck and Shoulders Ache When You Stand'))
  fail('a jargon title loses the question that translates it');
if (restatesTitle('Why does my heart suddenly race at 3am with POTS?', "Adrenaline Dumps in POTS: Why Your Heart Races (and Why It Usually Isn't a Panic Attack)"))
  fail('a reframed question is read as a restatement');
// Interrogatives are content, not filler: "why I crash" and "when I crash" are
// different questions and must not reduce to the same words. (On two short
// sentences one differing word is still under the threshold, which is why the
// bubble is a judgement about whole sentences and not about single words.)
if (contentWords('Why do I crash?').has('when') || !contentWords('Why do I crash?').has('why'))
  fail('interrogatives are not counted as content words');
if (restatesTitle('When do I crash after exertion?', 'Why Do I Crash After Exertion?'))
  fail('a different question word over the same subject is read as a restatement');

if (!restatesTitle('', 'Does Stress Make POTS Worse?')) fail('an empty question is still shown');
if (!restatesTitle('Does stress make my POTS worse?', '')) fail('an empty title shows a bubble');
if (questionBubble('Does stress make my POTS worse?', 'Does Stress Make POTS Worse?') !== '')
  fail('questionBubble returns a restatement');
if (questionBubble('  Why do my legs ache?  ', 'Blood Pooling in POTS') !== 'Why do my legs ache?')
  fail('questionBubble does not return the trimmed question');
if (contentWords('Does Stress Make POTS Worse?').size !== contentWords('does stress make my pots worse').size)
  fail('case, punctuation or person changes the content words');

/* 2. One rule, two consumers. The bubble and the structured data must not
      disagree about whether the question is news. */
const page = fs.readFileSync(PAGE, 'utf8');
if (!/import \{ questionBubble \} from '\$lib\/v2\/questionBubble'/.test(page))
  fail('the article page no longer imports questionBubble');
if (!/alternativeHeadline/.test(page) || !/questionBubble\(question, meta\.title\)[^\n]*alternativeHeadline/.test(page))
  fail('alternativeHeadline is gated on something other than questionBubble');
if (/showQuestion/.test(page)) fail('the old exact-string showQuestion gate is back');

/* 3. The catalogue. A question-titled article may not also carry a bubble. */
let checked = 0;
for (const name of fs.readdirSync(DIR).filter((f) => f.endsWith('.md'))) {
  const md = fs.readFileSync(DIR + name, 'utf8');
  const fm = md.split(/^---$/m)[1] ?? '';
  const title = field(fm, 'title');
  const question = field(fm, 'question');
  const date = field(fm, 'date');
  if (!question) continue; // articles.test.mjs owns that
  checked += 1;
  if (date >= QUESTION_RULE_FROM && !restatesTitle(question, title))
    fail(`${name}: the title is already the question, so \`question\` may not be a second phrasing of it\n      title:    ${title}\n      question: ${question}`);
}

if (failures.length) {
  console.error(`question bubble: ${failures.length} problem(s)\n  ` + failures.join('\n  '));
  process.exit(1);
}
console.log(`question bubble: rules pass, ${checked} articles checked`);
