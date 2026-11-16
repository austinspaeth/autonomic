/**
 * The shell over src/lib/fold.ts: keeps the folding iPhone's native facts
 * current and hands the layout to React.
 *
 * Facts are re-read on the native change event (size class, hinge), on every
 * window resize (a rotation on the inner display moves the camera's occlusion
 * without changing a size class) and on foreground. Every read is a fresh full
 * snapshot, so a dropped event can only delay an answer, never corrupt one.
 * On anything that is not a foldable the facts stay null and every hook below
 * answers exactly what the app drew before this existed.
 */
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { AppState, Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { onFoldStateChange, readFoldState } from '../../modules/app-env';
import {
  contentInsets, navLayoutFor, parseFoldFacts, pillAnchor, sameFacts, sceneWidth, sheetFrame, topBarFor,
  type FoldFacts, type NavLayout, type TopBar,
} from '../lib/fold';

let facts: FoldFacts | null = null;
const listeners = new Set<() => void>();
let armed = false;
let reading = false;
let again = false;

async function refresh(): Promise<void> {
  if (Platform.OS !== 'ios') return;
  // Coalesce: a burst of resize + trait events collapses into one read plus,
  // if anything arrived mid-read, one more.
  if (reading) { again = true; return; }
  reading = true;
  try {
    do {
      again = false;
      const next = parseFoldFacts(await readFoldState());
      if (!sameFacts(facts, next)) {
        facts = next;
        listeners.forEach((l) => l());
      }
    } while (again);
  } finally {
    reading = false;
  }
}

function arm(): void {
  if (armed || Platform.OS !== 'ios') return;
  armed = true;
  onFoldStateChange(() => { void refresh(); });
  AppState.addEventListener('change', (s) => { if (s === 'active') void refresh(); });
  void refresh();
}

function subscribe(l: () => void): () => void {
  arm();
  listeners.add(l);
  return () => { listeners.delete(l); };
}

const getFacts = () => facts;

/** The current facts, or null when this is not a foldable. */
export function useFoldFacts(): FoldFacts | null {
  const f = useSyncExternalStore(subscribe, getFacts, getFacts);
  const { width, height } = useWindowDimensions();
  // A resize is the one change the native event does not cover.
  useEffect(() => { void refresh(); }, [width, height]);
  return f;
}

let lastSceneWidth: number | null = null;

/**
 * Width the tab scenes are laid out in, for code that runs outside React (the
 * tab slide's interpolator). Null until the layout has rendered once, and the
 * caller falls back to the window.
 */
export function currentSceneWidth(): number | null {
  return lastSceneWidth;
}

/** Which navigation layout to draw, live. */
export function useNavLayout(): NavLayout {
  const f = useFoldFacts();
  const win = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const layout = useMemo(
    () => navLayoutFor(f, win, insets, Platform.OS === 'ios'),
    // Primitive deps: the insets object is a fresh identity on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [f, win.width, win.height, insets.top, insets.left, insets.bottom, insets.right],
  );
  lastSceneWidth = sceneWidth(layout, win);
  return layout;
}

/** Horizontal padding a tab scene's content keeps clear. */
export function useContentInsets(): { left: number; right: number } {
  const layout = useNavLayout();
  const insets = useSafeAreaInsets();
  return contentInsets(layout, insets);
}

/** Where the floating pills sit (src/lib/pillStack). */
export function usePillAnchor(): { bottom: number; left: number; right: number } {
  const layout = useNavLayout();
  const insets = useSafeAreaInsets();
  return pillAnchor(layout, insets);
}

/** A bottom sheet's horizontal frame, and the width that leaves it. */
export function useSheetFrame(): { left: number; right: number; width: number } {
  const layout = useNavLayout();
  const win = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { left, right } = sheetFrame(layout, win, insets);
  return { left, right, width: win.width - left - right };
}

/** The open phone in portrait: the header moved up beside the status bar
 *  (src/lib/fold.ts `topBarFor`). Null everywhere else. */
export function useTopBar(): TopBar | null {
  const f = useFoldFacts();
  const win = useWindowDimensions();
  return useMemo(
    () => topBarFor(f, win, Platform.OS === 'ios'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [f, win.width, win.height],
  );
}

/** The top inset the header sits under: the safe area's, unless the top bar
 *  has moved up beside the status bar. */
export function useHeaderTop(): number {
  const tb = useTopBar();
  const insets = useSafeAreaInsets();
  return tb ? tb.top : insets.top;
}
