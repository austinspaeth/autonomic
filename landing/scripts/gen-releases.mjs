/* Generates landing/master/releases.js from the app's own release log.
 *
 * `mobile/src/lib/whatsNew.ts` already holds every shipped version with the day
 * it was cut, because the app shows it on the "What's new" card. Retyping those
 * dates into the dashboard as hand-entered events would guarantee they drift,
 * so the dashboard reads them instead: releases are DERIVED annotations, and
 * the only events a human enters are the ones nothing else knows about
 * (campaigns, store changes, press).
 *
 * Run after cutting a version:  npm run releases
 *
 * The array literal in whatsNew.ts is valid JavaScript once the TypeScript
 * annotation is removed, so it is evaluated rather than pattern-matched — a
 * regex over the notes would break on the first apostrophe or bracket.
 */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, '../../mobile/src/lib/whatsNew.ts');
const OUT = path.resolve(here, '../master/releases.js');

const src = fs.readFileSync(SRC, 'utf8');
const start = src.indexOf('export const RELEASES');
if (start < 0) {
  console.error(`No RELEASES export in ${SRC}`);
  process.exit(1);
}
/* Start from the `=`, not from the declaration: the type annotation is
   `RELEASES: Release[] = [`, and the first `[` after `export const` belongs to
   `Release[]`, whose empty brackets close immediately and yield nothing. */
const assign = src.indexOf('=', start);
const open = assign < 0 ? -1 : src.indexOf('[', assign);
if (open < 0) { console.error('RELEASES is not an array literal.'); process.exit(1); }

// Walk to the matching bracket, ignoring brackets inside strings.
let depth = 0, end = -1, quote = null;
for (let i = open; i < src.length; i += 1) {
  const c = src[i];
  if (quote) {
    if (c === '\\') { i += 1; continue; }
    if (c === quote) quote = null;
    continue;
  }
  if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
  if (c === '[') depth += 1;
  else if (c === ']') { depth -= 1; if (depth === 0) { end = i; break; } }
}
if (end < 0) { console.error('Could not find the end of the RELEASES array.'); process.exit(1); }

const releases = vm.runInNewContext('(' + src.slice(open, end + 1) + ')');

const clean = releases
  .filter((r) => r && typeof r.version === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date || ''))
  .map((r) => ({
    version: r.version,
    date: r.date,
    notes: Array.isArray(r.notes) ? r.notes.slice(0, 6) : [],
  }))
  .sort((a, b) => (a.date < b.date ? -1 : 1));

const banner = `/* releases.js — GENERATED, do not edit.
 *
 * Source: mobile/src/lib/whatsNew.ts (the app's customer-facing release log).
 * Regenerate with \`npm run releases\` in landing/ after cutting a version.
 *
 * The dashboard draws these as release annotations on every calendar chart.
 * They are not editable events: the app's log is the source of truth for what
 * shipped and when, and a second hand-maintained copy would only drift.
 */
`;

fs.writeFileSync(OUT, banner + 'window.RELEASES = ' + JSON.stringify(clean, null, 2) + ';\n');
console.log(`Wrote ${path.relative(process.cwd(), OUT)} — ${clean.length} releases, ${clean[0].date} to ${clean[clean.length - 1].date}.`);
