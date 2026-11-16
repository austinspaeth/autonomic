/**
 * Where the navigation goes on a folding iPhone (iPhone Duo), and what that
 * means for everything laid out around it. Pure + tested; src/store/fold.ts is
 * the shell that feeds it the native facts (modules/app-env FoldState.swift).
 *
 * Three layouts:
 *
 * - `bar`: the floating bottom bar every other phone has. Also the open phone
 *   held in PORTRAIT, which is just a wider phone.
 * - `rail`: the CLOSED phone. Its outer display keeps a strip clear down the
 *   trailing edge beside the camera, reported as the safe area's side inset;
 *   the bar turns vertical and stands in the bottom of that strip, so it costs
 *   the content nothing.
 * - `sidebar`: the OPEN phone in LANDSCAPE. A navigation column
 *   carrying the three views, today's score and the pacing budget, down the
 *   RIGHT edge, with the content in the rest of the width.
 *
 * Apple ships no "is this an iPhone Duo" API on purpose, so nothing here names
 * a model. "Is this a foldable" is "has a hinge reported" (only a device with
 * one ever does), and "which display" is the size classes, which is Apple's own
 * rule: the inner display is regular in both, the outer one is not. Everything
 * defaults to `bar`: an unreadable fact, Android, an older binary and every
 * other iPhone keep exactly the layout they had.
 */

export interface FoldRect { x: number; y: number; w: number; h: number }
export interface Insets { top: number; left: number; bottom: number; right: number }
export interface WindowSize { width: number; height: number }

export type HingeStatus = 'closed' | 'partial' | 'open' | 'unknown';
export type SizeClass = 'compact' | 'regular' | 'unspecified';

export interface FoldFacts {
  hinge: HingeStatus;
  hSize: SizeClass;
  vSize: SizeClass;
  /** Active occlusion regions (the camera), in window points. */
  occlusions: FoldRect[];
}

export type NavLayout =
  | { kind: 'bar' }
  /** `width` is the strip the system keeps clear on `edge`. */
  | { kind: 'rail'; edge: 'left' | 'right'; width: number }
  /** `width` is the whole column, the right safe inset included. */
  | { kind: 'sidebar'; width: number };

/** Below this a side inset is a rounded corner, not a strip to stand a bar in. */
export const RAIL_MIN_STRIP = 52;
/** The column's own width, before the right safe inset. */
export const SIDEBAR_W = 264;
/** The least the content may be left with beside the column. */
export const SIDEBAR_MIN_CONTENT = 420;
/** Wider than this in portrait is the inner display, never the outer one. */
export const OUTER_MAX_W = 520;
/** A sheet wider than this reads as a wall rather than a card; it is centred. */
export const SHEET_MAX_W = 620;

const HINGES: readonly string[] = ['closed', 'partial', 'open', 'unknown'];
const SIZES: readonly string[] = ['compact', 'regular', 'unspecified'];
const BAR: NavLayout = { kind: 'bar' };

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * The native snapshot, validated. Null means "not a foldable": no snapshot, no
 * hinge, or a shape this build does not understand.
 */
export function parseFoldFacts(raw: unknown): FoldFacts | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.hinge !== 'string' || !HINGES.includes(r.hinge)) return null;
  const size = (v: unknown): SizeClass => (typeof v === 'string' && SIZES.includes(v) ? (v as SizeClass) : 'unspecified');
  const occlusions: FoldRect[] = [];
  if (Array.isArray(r.occlusions)) {
    for (const o of r.occlusions) {
      if (!o || typeof o !== 'object') continue;
      const q = o as Record<string, unknown>;
      const x = num(q.x), y = num(q.y), w = num(q.w), h = num(q.h);
      if (x != null && y != null && w != null && h != null && w > 0 && h > 0) occlusions.push({ x, y, w, h });
    }
  }
  return { hinge: r.hinge as HingeStatus, hSize: size(r.hSize), vSize: size(r.vSize), occlusions };
}

/** The inner (unfolded) display: regular in both size classes. */
export function isInnerDisplay(f: FoldFacts): boolean {
  return f.hSize === 'regular' && f.vSize === 'regular';
}

/**
 * Which layout to draw.
 *
 * `win` and `insets` come from React Native rather than the snapshot: they are
 * what the views are actually laid out in, and they update in the same commit
 * as the layout that has to agree with them.
 */
export function navLayoutFor(f: FoldFacts | null, win: WindowSize, insets: Insets, infer = false): NavLayout {
  if (!f) {
    // No native facts: a binary without the module, or the first frames before
    // the snapshot lands. On iOS (`infer`) the two postures are still
    // recognisable from the window alone, because the app is portrait-locked
    // on every iPhone and only the folding phone's inner display ignores that:
    // a LANDSCAPE window can only be the open phone, and a narrow PORTRAIT
    // window with a side strip can only be the closed one (no other iPhone has
    // a side inset in portrait). Never inferred elsewhere: an Android foldable
    // or tablet answers neither question this way.
    if (!infer) return BAR;
    if (win.width > win.height) return sidebarFor(win, insets);
    return win.width <= OUTER_MAX_W ? railFor(insets) : BAR;
  }
  if (isInnerDisplay(f)) {
    // Open. Portrait is a wider phone and keeps the bar; landscape gets the
    // column, provided the content keeps a usable width beside it.
    if (win.width <= win.height) return BAR;
    return sidebarFor(win, insets);
  }
  // Closed.
  return railFor(insets);
}

/** The column, provided the content keeps a usable width beside it. */
function sidebarFor(win: WindowSize, insets: Insets): NavLayout {
  const width = SIDEBAR_W + insets.right;
  return win.width - width - insets.left >= SIDEBAR_MIN_CONTENT ? { kind: 'sidebar', width } : BAR;
}

/** The strip is the larger side inset; a phone with nothing clear on either
 *  side has nowhere to stand a vertical bar and keeps the bottom one. */
function railFor(insets: Insets): NavLayout {
  const edge = insets.right >= insets.left ? 'right' : 'left';
  const width = Math.max(insets.left, insets.right);
  return width >= RAIL_MIN_STRIP ? { kind: 'rail', edge, width } : BAR;
}

/**
 * The horizontal room a tab scene's content keeps clear, inside the scene.
 *
 * Beside the sidebar the scene already stops short of the column (and the
 * right inset with it), so only the left inset remains. Everywhere else it is the
 * safe area's own sides, which for the rail includes the strip the rail stands
 * in.
 */
export function contentInsets(l: NavLayout, insets: Insets): { left: number; right: number } {
  if (l.kind === 'sidebar') return { left: insets.left, right: 0 };
  return { left: insets.left, right: insets.right };
}

/**
 * Where the floating pills (minimized reading, imports, What's new, the AI
 * button) sit. With a bottom bar they float above it; with no bottom bar they
 * drop to the bottom of the content area and centre on it, not on the window.
 */
export function pillAnchor(l: NavLayout, insets: Insets): { bottom: number; left: number; right: number } {
  if (l.kind === 'bar') return { bottom: insets.bottom + 88, left: 0, right: 0 };
  const trail = l.kind === 'sidebar' ? l.width : insets.right;
  return { bottom: insets.bottom + 16, left: insets.left, right: trail };
}

/**
 * A bottom sheet's horizontal frame. On a wide window it is centred at
 * `SHEET_MAX_W`; on the closed phone it stops at the strip, so nothing in it
 * sits beside the camera. Otherwise edge to edge, as it always was.
 */
export function sheetFrame(l: NavLayout, win: WindowSize, insets: Insets): { left: number; right: number } {
  if (win.width > SHEET_MAX_W + 32) {
    const side = Math.round((win.width - SHEET_MAX_W) / 2);
    return { left: side, right: side };
  }
  if (l.kind === 'rail') return { left: insets.left, right: insets.right };
  return { left: 0, right: 0 };
}

/** Width the tab scenes are laid out in. */
export function sceneWidth(l: NavLayout, win: WindowSize): number {
  return l.kind === 'sidebar' ? Math.max(0, win.width - l.width) : win.width;
}

/** Stable comparison for the store, so an unchanged snapshot is no news. */
export function sameFacts(a: FoldFacts | null, b: FoldFacts | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.hinge !== b.hinge || a.hSize !== b.hSize || a.vSize !== b.vSize) return false;
  if (a.occlusions.length !== b.occlusions.length) return false;
  return a.occlusions.every((o, i) => {
    const p = b.occlusions[i];
    return o.x === p.x && o.y === p.y && o.w === p.w && o.h === p.h;
  });
}

/* ---------- the open phone in portrait: the top bar beside the status bar ---------- */

/**
 * On the inner display the status bar and the camera sit together in the top
 * RIGHT corner, and iOS reports a top safe inset deep enough to clear them
 * across the whole width, which left a band of nothing above the header. So
 * there, the header moves UP into the status bar's row and keeps clear of the
 * corner sideways instead: `top` replaces the safe area's top inset for the
 * header, and `right` is the room its contents leave for the system UI.
 *
 * Portrait only: in landscape the sidebar has the right edge, and the closed
 * phone's status bar is in its side strip already. With facts, the camera's
 * occlusion region places it; without them (an older binary) the measured
 * defaults below stand in.
 */
export interface TopBar { top: number; right: number }

/** Status bar row centre and corner width on the inner display, measured off
 *  the iPhone Duo simulator (Xcode 27.1): clock plus camera, in points. */
export const TOPBAR_ROW_CENTER = 48;
export const TOPBAR_RESERVE = 132;
/** The clock sits left of the camera and is not part of its region. */
const CLOCK_W = 76;
/** Header band height (components/Header HEADER_CONTENT_HEIGHT) and the 6pt
 *  it sits below its top inset; repeated here so this module stays pure. */
const BAND_H = 58;
const BAND_GAP = 6;

export function topBarFor(f: FoldFacts | null, win: WindowSize, infer = false): TopBar | null {
  if (win.width > win.height) return null; // landscape
  const inner = f ? isInnerDisplay(f) : infer && win.width > OUTER_MAX_W;
  if (!inner) return null;
  let center = TOPBAR_ROW_CENTER;
  let right = TOPBAR_RESERVE;
  // The camera's region, if it is in the top-right corner, fixes both.
  const cam = f?.occlusions.find((o) => o.y < 120 && o.x > win.width / 2);
  if (cam) {
    center = cam.y + cam.h / 2;
    right = Math.max(TOPBAR_RESERVE, Math.ceil(win.width - cam.x + CLOCK_W));
  }
  return { top: Math.max(0, Math.round(center - BAND_H / 2 - BAND_GAP)), right };
}
