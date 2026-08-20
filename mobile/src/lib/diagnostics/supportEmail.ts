/**
 * Composing a support email that actually arrives, with the diagnostics in it.
 *
 * Pure: no Linking, no Clipboard, no React. The shell is the button that opens
 * the URL — everything decidable is decided here, because the interesting part
 * is the BUDGET and that is exactly the part a device makes hard to test.
 *
 * Why a budget at all: `mailto:` carries its body in a URL, and a URL has a
 * length past which iOS quietly refuses to open it — the tap does nothing, on a
 * screen the user reached because something was already broken. The whole-app
 * dump runs to several KB, so it cannot go in whole. `expo-mail-composer` would
 * take an attachment instead, but it is a native module and adding one now means
 * a rebuild rather than an OTA update, which is a poor trade for one button.
 *
 * So the body carries a TRIMMED dump, and the trim keeps both ends: the head has
 * the notes, build and platform, and the tail has the error log, which is the
 * half that says what went wrong. Cutting the middle out of a diagnostic is
 * survivable; cutting the errors off it is not.
 */

/** Where support mail goes. */
export const SUPPORT_EMAIL = 'austin@autonomic.care';

/**
 * How much diagnostic text the body may carry.
 *
 * Conservative on purpose. iOS has no documented `mailto:` limit and the real
 * ceiling varies with the mail client, so this sits well under every figure
 * reported for it: a mail that opens with two thirds of the dump beats a button
 * that silently does nothing.
 */
export const MAX_BODY_CHARS = 1800;

const CUT_MARK = '\n\n… middle of the report trimmed so this email would open. The full version is under Settings: hold the Autonomic card at the top for 8 seconds …\n\n';

/**
 * Trim a diagnostic dump to `budget`, keeping the head and the tail.
 *
 * Split 55/45 in favour of the head, which holds the "worth looking at first"
 * notes and the build identity, while the tail holds the errors. Both matter and
 * neither survives alone.
 */
export function trimDiagnostics(text: string, budget = MAX_BODY_CHARS): string {
  if (!text) return '';
  if (text.length <= budget) return text;
  const room = Math.max(0, budget - CUT_MARK.length);
  const head = Math.round(room * 0.55);
  const tail = room - head;
  return `${text.slice(0, head).trimEnd()}${CUT_MARK}${text.slice(text.length - tail).trimStart()}`;
}

/**
 * The email body: what the user wants to say, then what we need to read.
 *
 * The blank space at the top is deliberate and goes FIRST — the user is writing
 * to a person, and opening their own message halfway down a wall of machine
 * output is what stops people sending it at all.
 */
export function supportBody(intro: string, diagnostics: string, budget = MAX_BODY_CHARS): string {
  return [
    intro,
    '',
    '',
    '--- diagnostic report, please leave this below your message ---',
    '',
    trimDiagnostics(diagnostics, budget),
  ].join('\n');
}

/**
 * A `mailto:` URL with the subject and body escaped.
 *
 * `encodeURIComponent` rather than `encodeURI`: a body legitimately contains
 * `&`, `#` and `+`, each of which ends or corrupts the query when left raw, and
 * the last of those turns into a space in most clients.
 */
export function supportMailtoUrl(subject: string, body: string, email = SUPPORT_EMAIL): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
