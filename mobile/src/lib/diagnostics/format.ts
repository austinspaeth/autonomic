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
