/**
 * Tapping anywhere that is not the focused input blurs it, the way tapping
 * blank UI does. Spread `tapAwayBlur` onto a View wrapping the screen: these
 * are plain touch events, so the wrapper never claims the responder and the
 * tap still lands on whatever it was aimed at.
 *
 * Two things it must not do. A DRAG is not a tap: scrolling a form keeps the
 * keyboard up (the sheet's own keyboardDismissMode decides that). And a tap on
 * ANOTHER input moves focus rather than dropping it, so the blur waits a beat
 * and is addressed to the input that had focus at touch-down: by then the new
 * field owns the keyboard and blurring the old one is a no-op, where
 * Keyboard.dismiss() would bounce the keyboard down and up again.
 */
import { findNodeHandle, TextInput, type GestureResponderEvent } from 'react-native';

type Input = ReturnType<typeof TextInput.State.currentlyFocusedInput>;

const TAP_SLOP = 8;
const SETTLE_MS = 60;

let start: { x: number; y: number; input: Input } | null = null;

const isTarget = (e: GestureResponderEvent, input: NonNullable<Input>) => {
  const t = e.target as unknown;
  return t === input || (typeof t === 'number' && t === findNodeHandle(input as never));
};

let keep = false;
/** Put on a control that acts ON the focused field (its sign flip): a tap
 *  there is not a tap away, and must not drop the keyboard mid-entry. Touch
 *  events bubble, so this runs before the wrapper's own handler below. */
export const keepsFocus = { onTouchStart: () => { keep = true; } };

export const tapAwayBlur = {
  onTouchStart: (e: GestureResponderEvent) => {
    // Not cleared here: a sheet sits inside the root wrapper in the React
    // tree, so this handler runs twice per touch and both runs must see it.
    if (keep) { start = null; return; }
    const input = TextInput.State.currentlyFocusedInput();
    start = input && !isTarget(e, input) ? { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, input } : null;
  },
  onTouchEnd: (e: GestureResponderEvent) => {
    const s = start;
    start = null;
    keep = false;
    if (!s?.input) return;
    if (Math.abs(e.nativeEvent.pageX - s.x) > TAP_SLOP || Math.abs(e.nativeEvent.pageY - s.y) > TAP_SLOP) return;
    const input = s.input;
    setTimeout(() => { TextInput.State.blurTextInput(input); }, SETTLE_MS);
  },
};
