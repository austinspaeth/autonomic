/**
 * The whole-app support dump: its shape, and the pure formatter that renders
 * it. Collection lives in ./collectApp.ts (which imports react-native and the
 * store); this file stays import-free so jest can reach it.
 *
 * Why a third diagnostics report: the Bluetooth and camera dumps each answer
 * one question extremely well, and answer nothing else. "The app doesn't
 * notify me", "my watch data never appears", "it says I'm not subscribed",
 * "everything vanished" have no button to hold. This one is reached from
 * Settings and describes the app's whole state — permissions, capabilities,
 * entitlement, storage, and the recent error log — so an emailed report can be
 * read without a round trip asking which OS version they're on.
 *
 * PRIVACY: no health data, and nothing identifying. Journal contents are
 * reported as counts; day keys and timestamps become ages in days; the profile
 * reports only which fields are filled in, never their values; an import
 * reports that it happened, not the file name. Read `collectApp.ts` alongside
 * any change here — the rule is enforced there, at the point of collection.
 */
import { block, line, yn } from './format';
import type { LoggedError } from './errorBuffer';

/** A block of label → value rows. Values are printed as-is; null renders as —. */
export type Rows = Record<string, string | number | boolean | null>;

export interface AppDiagnostics {
  at: string;
  app: Rows;
  platform: Rows;
  distribution: Rows;
  subscription: Rows;
  permissions: Rows;
  capabilities: Rows;
  health: Rows;
  /** iOS only — null elsewhere, where the whole watch surface is hidden. */
  watch: Rows | null;
  bluetooth: Rows;
  notifications: Rows;
  storage: Rows;
  journal: Rows;
  settings: Rows;
  errors: LoggedError[];
  notes: string[];
}

/** One error-log row: timestamp, tag, message, and the repeat count when the
 *  same failure collapsed. Wrapped rather than truncated — the message is the
 *  whole point of the row. */
function errorLines(e: LoggedError): string[] {
  const repeats = (e.n ?? 1) > 1 ? ` ×${e.n}` : '';
  const out = [`  ${e.at}${e.fatal ? '  FATAL' : ''}  ${e.tag}${repeats}`];
  for (const chunk of e.msg.match(/.{1,68}(\s|$)/g) ?? [e.msg]) out.push(`      ${chunk.trim()}`);
  if (e.first) out.push(`      first seen ${e.first}`);
  return out;
}

/**
 * Render the dump as plain text for the copy/share box. Readable rather than
 * JSON — it gets pasted into an email by a user who is already having a bad
 * time, and read by whoever answers it.
 */
export function formatAppDiagnostics(d: AppDiagnostics): string {
  const out: string[] = [];

  out.push('AUTONOMIC — APP DIAGNOSTICS', d.at, '');

  if (d.notes.length) {
    out.push('WORTH LOOKING AT FIRST');
    for (const n of d.notes) {
      const chunks = n.match(/.{1,72}(\s|$)/g) ?? [n];
      chunks.forEach((c, i) => out.push(`  ${i === 0 ? '·' : ' '} ${c.trim()}`));
    }
    out.push('');
  }

  out.push(...block('APP', d.app));
  out.push('', ...block('PLATFORM', d.platform));
  out.push('', ...block('DISTRIBUTION', d.distribution));
  out.push('', ...block('SUBSCRIPTION', d.subscription));
  out.push('', ...block('PERMISSIONS', d.permissions));
  out.push('', ...block('CAPABILITIES', d.capabilities));
  out.push('', ...block('HEALTH', d.health));
  if (d.watch) out.push('', ...block('APPLE WATCH', d.watch));
  out.push('', ...block('BLUETOOTH', d.bluetooth));
  out.push('', ...block('NOTIFICATIONS', d.notifications));
  out.push('', ...block('STORAGE', d.storage));
  out.push('', ...block('JOURNAL (counts only)', d.journal));
  out.push('', ...block('SETTINGS', d.settings));

  out.push('', `ERRORS (${d.errors.length}${d.errors.length ? ', oldest first' : ''})`);
  if (d.errors.length) d.errors.forEach((e) => out.push(...errorLines(e)));
  else out.push('  none recorded');

  out.push('', line('report ends', d.at));
  return out.join('\n');
}

/** Re-exported so collectors have one import for the row helpers. */
export { line, yn };
