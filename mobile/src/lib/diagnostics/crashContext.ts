/**
 * WHERE the user was when an uncaught error hit, stamped onto its message.
 *
 * A release build's stack is mangled names over bytecode offsets, so an
 * uncaught error arrives as its message and nothing else — and for React's own
 * invariants the message is a fixed sentence that names no component at all.
 * "Maximum update depth exceeded" on the Failures tab could be any of a hundred
 * components. What survives minification is our OWN strings, so the app notes
 * the two things that narrow a render loop to a screen — the route, and how
 * many sheets were stacked over it — and the uncaught paths prefix them:
 * `[insights, 2 sheets] Maximum update depth exceeded`.
 *
 * Deliberately low-cardinality. The fault reporter groups by message, so
 * anything that varies per occurrence (a time since launch, a count) would
 * split one bug into a row per occurrence. A route, a small sheet count and
 * background-or-not split a bug only by WHERE it happens, which is the point.
 *
 * Pure apart from two module variables: no react-native import, so it is
 * testable and safe to call from a dying runtime.
 */

let route = '';
let sheets = 0;

/** Called from the root layout whenever expo-router's pathname changes. */
export function noteRoute(pathname: string): void {
  route = routeLabel(pathname);
}

/** Called by SheetProvider whenever its open (non-closing) depth changes. */
export function noteSheetDepth(depth: number): void {
  sheets = Number.isFinite(depth) && depth > 0 ? Math.floor(depth) : 0;
}

/**
 * A pathname as a short word: `/` is the Journal tab, `/insights` is
 * `insights`, a nested path joins with dots. No slashes, because the fault
 * redactor reads two of them as a filesystem path and cuts it to a basename.
 */
export function routeLabel(pathname: string | null | undefined): string {
  if (!pathname) return '';
  const parts = pathname.split(/[?#]/)[0].split('/').filter(Boolean);
  if (!parts.length) return 'journal';
  return parts
    .map((p) => p.replace(/[^\w.-]/g, ''))
    .filter(Boolean)
    .join('.')
    .slice(0, 24);
}

/** The context as it will be prefixed, or '' when nothing is known. */
export function crashContext(opts?: { background?: boolean }, state = { route, sheets }): string {
  const parts: string[] = [];
  if (state.route) parts.push(state.route);
  if (state.sheets > 0) parts.push(state.sheets === 1 ? '1 sheet' : `${state.sheets} sheets`);
  if (opts?.background) parts.push('bg');
  return parts.join(', ');
}

/**
 * React's invariant messages spend 100+ characters explaining themselves, and
 * the fault report keeps 140. The first sentence IS the signature; the rest is
 * advice that never varies, and it is what pushed the context off the end.
 */
const REACT_BOILERPLATE = [
  'Maximum update depth exceeded.',
  'Too many re-renders.',
  'Rendered more hooks than during the previous render.',
  'Rendered fewer hooks than expected.',
  'Objects are not valid as a React child',
];

export function condenseReactMessage(msg: string): string {
  for (const head of REACT_BOILERPLATE) {
    const at = msg.indexOf(head);
    if (at === -1) continue;
    // Keep anything BEFORE the sentence (an error type, a native wrapper) and
    // the sentence itself, minus its full stop; drop the explanation after it.
    return msg.slice(0, at + head.length).replace(/\.$/, '');
  }
  return msg;
}

/** `[insights, 2 sheets] Maximum update depth exceeded`. */
export function withContext(msg: string, context: string): string {
  const body = condenseReactMessage(msg);
  return context ? `[${context}] ${body}` : body;
}
