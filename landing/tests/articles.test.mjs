/* The article rules in ARTICLES.md, checked against every file in articles/.
 *
 * Two tiers. EVERY article must carry a `question` and an `app` block the page
 * can use (an unknown feature slug would quietly fall back to the topic's), and
 * a first category that is a real topic, or its URL 404s. Articles dated after
 * QUESTION_RULE_FROM also follow the house rules a new post is written to: the
 * title is itself a question, the meta description fits a results page, there
 * is a Sources section with at least five linked sources, a `reviewed` date,
 * and no em dash anywhere. Older articles keep their titles on purpose: they
 * may already rank, and a retitle is a ranking risk taken for nothing.
 *
 *   node tests/articles.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const DIR = new URL('../articles/', import.meta.url).pathname;
const QUESTION_RULE_FROM = '2026-11-05';
const FEATURES = ['hrv-readings', 'pacing-budget', 'insights', 'pots-stand-test', 'cycle-tracking', 'doctor-reports', 'apple-watch'];
const TOPICS = ['hrv', 'food', 'pots', 'postviral', 'mecfs', 'dysautonomia', 'just-diagnosed', 'supporting-someone', 'recovery', 'app', 'research', 'basics'];

const unq = (v = '') => v.trim().replace(/^"(.*)"$/s, '$1').replace(/^'(.*)'$/s, '$1');
const field = (fm, key) => {
  const m = fm.match(new RegExp(`^${key}:[ \\t]*(.*)$`, 'm'));
  return m ? unq(m[1]) : undefined;
};
const nested = (fm, parent, key) => {
  const block = fm.match(new RegExp(`^${parent}:\\n((?:[ \\t]+.*\\n?)+)`, 'm'));
  if (!block) return undefined;
  const m = block[1].match(new RegExp(`^[ \\t]+${key}:[ \\t]*(.*)$`, 'm'));
  return m ? unq(m[1]) : undefined;
};

const failures = [];
let checked = 0;
for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith('.md')).sort()) {
  const md = fs.readFileSync(path.join(DIR, file), 'utf8');
  const fm = md.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1];
  const fail = (why) => failures.push(`${file}: ${why}`);
  if (!fm) { fail('no frontmatter'); continue; }
  if (field(fm, 'published') !== 'true') continue;
  checked++;

  const question = field(fm, 'question');
  if (!question) fail('missing `question`');
  else if (!question.endsWith('?')) fail('`question` must end with "?"');

  const feature = nested(fm, 'app', 'feature');
  if (!feature) fail('missing `app.feature`');
  else if (!FEATURES.includes(feature)) fail(`\`app.feature\` "${feature}" is not one of ${FEATURES.join(', ')}`);
  if (!nested(fm, 'app', 'hook')) fail('missing `app.hook`');
  if (!nested(fm, 'app', 'line')) fail('missing `app.line`');

  const cat = fm.match(/^categories:\n[ \t]+-[ \t]*(\S+)/m)?.[1];
  if (!cat || !TOPICS.includes(cat)) fail(`first category "${cat}" is not a topic (${TOPICS.join(', ')})`);

  for (const key of ['question']) if (/[—–]/.test(field(fm, key) ?? '')) fail(`em or en dash in \`${key}\``);
  for (const key of ['hook', 'line']) if (/[—–]/.test(nested(fm, 'app', key) ?? '')) fail(`em or en dash in \`app.${key}\``);

  // Markdown is not parsed inside an HTML block (from a line opening with <div
  // to the next blank line), so a [text](url) link there shows as raw text,
  // and its long URL can push the page wider than a phone screen.
  const body = md.slice(md.indexOf('---', 3) + 3);
  let inHtml = false;
  for (const line of body.split('\n')) {
    if (!line.trim()) { inHtml = false; continue; }
    if (/^<div\b/.test(line)) inHtml = true;
    if (inHtml && /\[[^\]]+\]\((https?:\/\/|\/)[^)\s]*\)/.test(line)) fail(`markdown link inside an HTML block, use <a href>: ${line.trim().slice(0, 70)}`);
  }

  const date = field(fm, 'date') ?? '';
  if (date >= QUESTION_RULE_FROM) {
    const title = field(fm, 'title') ?? '';
    if (!title.endsWith('?')) fail(`new articles are titled as a question: "${title}"`);
    const description = field(fm, 'description') ?? '';
    if (description.length < 110 || description.length > 160) fail(`description is ${description.length} characters (110 to 160)`);
    if (!field(fm, 'tldr')) fail('missing `tldr`');
    if (!/^faq:/m.test(fm)) fail('missing `faq`');
    const sources = md.match(/\n##\s+Sources[^\n]*\n([\s\S]*?)(?=\n##\s|$)/i);
    if (!sources) fail('no "## Sources" section for the citations');
    else {
      const links = (sources[1].match(/\]\(https?:\/\/[^)]+\)/g) || []).length;
      if (links < 5) fail(`only ${links} linked source(s) under "## Sources" (at least 5, each verified)`);
    }
    if (!field(fm, 'reviewed')) fail('missing `reviewed` (the day every claim was checked against its source)');
    if (/[—]/.test(md)) fail('em dash in the article');
  }
}

if (failures.length) {
  console.error(`articles: ${failures.length} problem(s) in ${checked} articles\n  ` + failures.join('\n  '));
  process.exit(1);
}
console.log(`articles: ${checked} articles pass`);
