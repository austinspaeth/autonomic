/**
 * Pure rendering helpers shared by the diagnostics dumps. Kept free of
 * `react-native` imports so the formatters that use them stay unit-testable
 * (jest here runs plain ts-jest with no native transform).
 */

export const yn = (v: boolean | null | undefined) => (v == null ? '?' : v ? 'yes' : 'no');

/** Two-column report row: label padded to a fixed width, em-dash for nothing.
 *  A label longer than the column still keeps one space before its value —
 *  padEnd alone silently runs the two together (`react-native-cameraloaded`). */
export function line(label: string, value: unknown): string {
  return `  ${label.padEnd(22).padEnd(label.length + 1)}${value == null || value === '' ? '—' : String(value)}`;
}

/** Report block: `HEADING` then one padded row per entry. */
export function block(heading: string, rows: Record<string, unknown>): string[] {
  return [heading, ...Object.entries(rows).map(([k, v]) => line(k, v))];
}

/**
 * Native errors arrive in three different shapes (ble-plx codes, VisionCamera
 * `code`, plain Error) — flatten whichever one turned up into one line.
 *
 * The error's own TYPE leads when there is no native code to lead with, because
 * it is the cheapest half of a diagnosis and `message` alone throws it away:
 * "undefined is not a function" says nothing that "TypeError: undefined is not
 * a function" does not say better, and in a release build — where the stack is
 * minified bytecode offsets and worth nothing — the type and the call-site tag
 * are the whole of the location. `Error` itself is omitted: it is the default
 * and names nothing.
 */
export function describeError(e: unknown): string {
  const err = e as {
    name?: string; errorCode?: number; code?: string; reason?: string;
    message?: string; cause?: { message?: string };
  } | null;
  if (!err) return 'unknown';
  const kind = err.name && err.name !== 'Error' ? String(err.name) : '';
  const head = err.errorCode != null ? `code ${err.errorCode}`
    : err.code ? String(err.code)
    : kind;
  const body = err.reason || err.message || String(e);
  const cause = err.cause?.message ? ` (cause: ${err.cause.message})` : '';
  // `String(e)` on a real Error already reads "TypeError: ...", so a type head
  // would say it twice.
  const line = head && body.startsWith(`${head}:`) ? body : [head, body].filter(Boolean).join(': ');
  return line + cause;
}
