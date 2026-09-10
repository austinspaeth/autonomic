/**
 * The pacing block the phone mirrors onto the Apple Watch.
 *
 * The watch COMPUTES NOTHING. It draws the very frames the home-screen widgets
 * draw (`WidgetPacingFrame` in ../widgets), so the strip in the Outlook card,
 * the widgets and the wrist can never disagree about today's budget — and,
 * exactly as on iOS, a frame per `PACING_FRAME_MIN` means the pace marker walks
 * the day on the watch's own clock without the phone being reachable.
 *
 * `date` is the day key the frames describe. The watch renders `awaiting`
 * rather than a stale figure once its own day has moved on, which is the same
 * rule the widgets follow: a budget from yesterday is not a small error, it is
 * an invitation to spend minutes that were already spent.
 */
import type { WidgetPacingFrame, WidgetPayload } from '../widgets';

/** Bumped when the frame shape changes. A watch build that does not understand
 *  the version shows nothing rather than half-drawing it. */
export const WATCH_PACING_SCHEMA = 1;

export interface WatchPacing {
  schemaVersion: number;
  date: string;
  frames: WidgetPacingFrame[];
}

export function watchPacing(payload: WidgetPayload): WatchPacing {
  return {
    schemaVersion: WATCH_PACING_SCHEMA,
    date: payload.date,
    frames: payload.pacing.frames,
  };
}

/**
 * The dedupe key, with every frame's `at` stripped.
 *
 * Frames are absolute instants, so a list whose CONTENT has not changed is
 * still correct a few minutes later — the watch simply picks a later frame out
 * of the one it already holds. Keying on the instants instead would push a new
 * applicationContext on every journal save, all day, for a budget that had not
 * moved.
 */
export function watchPacingKey(p: WatchPacing): string {
  return JSON.stringify({
    v: p.schemaVersion,
    date: p.date,
    frames: p.frames.map((f) => ({ ...f, at: '' })),
  });
}
