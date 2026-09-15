/**
 * What to tell somebody whose reading will not come out — pure, framework-free,
 * unit-tested.
 *
 * This exists because the app had almost nothing to say. A camera capture that
 * failed offered one sentence ("Hold your finger still with light pressure and
 * try again") and the setup card offered one more ("Rest your hand, light
 * pressure"), and a user who had spent twenty minutes on it had been told the
 * same two things seven times. The advice that actually fixes a fingertip PPG
 * reading is specific, and most of it was nowhere in the app: pressing HARDER
 * is the single most common cause and the instinct everybody has, cold hands
 * halve the signal, and an unsupported arm is where the movement comes from.
 *
 * Two rules shape the list.
 *
 * ORDER IS BY HOW OFTEN IT IS THE CAUSE, not by how easy it is to say. The
 * pressure tip leads because pressing occludes the capillaries whose pulsation
 * IS the measurement, so the harder somebody tries the worse their reading
 * gets — which is exactly the loop a frustrated user is in.
 *
 * THE LEAD TIP IS CHOSEN FROM WHAT WE ACTUALLY SAW. `ppgTrace` already knows
 * the difference between "frames arrived and the lens never read as covered"
 * and "the pulse locked and kept being lost", and those two have different
 * answers. Guessing would be worse than the fixed order, so the evidence is
 * passed in explicitly and a shape we cannot read leads with nothing.
 */

export type TroubleSource = 'camera' | 'polar';

/**
 * Which sensor the tips are about, or null when there are none worth giving.
 *
 * Only the two sensors the user holds against themselves can be noisy in a way
 * advice helps with. A wrist reading is taken on the wrist and arrives
 * finished, so offering "warm your hands" for one would be the app advising on
 * a process it cannot see.
 *
 * Takes a plain string rather than `SessionConfig['source']` on purpose: this
 * module must stay free of the session store, or the card that renders the
 * tips ends up in a require cycle with the card that opens the capture.
 */
export const troubleSourceFor = (s: string | undefined | null): TroubleSource | null =>
  (s === 'camera' || s === 'polar' ? s : null);

export interface Tip {
  id: string;
  title: string;
  body: string;
  /**
   * Can this only be acted on BEFORE the reading starts?
   *
   * The split matters because the two halves belong on different screens.
   * Warming your hands, taking a case off and finding somewhere to rest your
   * arm are preparation: read them at 2:30 into a failing reading and there is
   * nothing to do but abandon it, so they go on the camera setup card's first
   * step, where they can still be acted on.
   *
   * The rest are diagnosis — they answer "why did THAT one fail" — and putting
   * them in front of someone before their first attempt would be six
   * paragraphs between a new user and their first reading, which is the exact
   * thing the welcome wizard deleted a whole step to avoid. Advice also does
   * not land before you have felt the problem it solves.
   */
  prep?: boolean;
  /** The one-line form, for the setup card's compact list. Only prep tips
   *  carry it, and it is an imperative rather than a sentence. */
  brief?: string;
}

/**
 * Fingertip tips. Ordered by how often each one is the actual cause of a
 * refused reading; `leadTipId` may promote one of them to the front.
 */
export const CAMERA_TIPS: Tip[] = [
  {
    id: 'pressure',
    title: 'Rest your finger, do not press',
    body: 'Let the weight of your fingertip do the work. Pressing squeezes blood out of the fingertip, and that pulse is the whole measurement, so pressing harder makes the reading worse.',
    prep: true,
    brief: 'Rest your finger on the lens. Do not press.',
  },
  {
    id: 'warm',
    title: 'Warm your hands first',
    body: 'Cold fingers carry much less blood flow. Half a minute under warm water, or hands tucked under your arms, changes the signal more than anything else on this list.',
    prep: true,
    brief: 'Warm your hands if they are cold.',
  },
  {
    id: 'steady',
    title: 'Support your hand and your elbow',
    body: 'Rest the phone in your lap or on a table and let your elbow take the weight. Holding it up unsupported is where most of the movement comes from.',
    prep: true,
    brief: 'Rest the phone in your lap, elbow supported.',
  },
  {
    id: 'cover',
    title: 'Cover the lens and the flash together',
    body: 'One fingertip flat across both, touching the glass. With the flash uncovered its light reaches the lens around your finger instead of through it.',
  },
  {
    id: 'case',
    title: 'Take a thick case off',
    body: 'A case that stands proud of the camera holds your finger off the glass and lets light in at the edge.',
    prep: true,
    brief: 'Take off a case that stands proud of the lens.',
  },
  {
    id: 'light',
    title: 'Move out of bright light',
    body: 'Sunlight or a lamp close to the lens swamps the pulse. A normally lit room is ideal.',
  },
];

/** Chest-strap tips. Shorter, because a strap that is on properly works. */
export const STRAP_TIPS: Tip[] = [
  {
    id: 'wet',
    title: 'Wet the electrodes',
    body: 'The two ribbed pads on the underside of the strap need to be damp. A dry strap is the most common reason a reading is noisy.',
  },
  {
    id: 'position',
    title: 'Snug, just below the chest muscles',
    body: 'It should not slide when you move. A loose strap loses contact every time you breathe.',
  },
  {
    id: 'still',
    title: 'Stay still and breathe normally',
    body: 'Sit supported, feet on the floor, and let your breathing settle before you start.',
  },
  {
    id: 'battery',
    title: 'Try a fresh battery',
    body: 'A strap low on battery keeps its connection but drops beats. Swapping the coin cell is worth trying if nothing else helps.',
  },
];

export const TIPS_BY_SOURCE: Record<TroubleSource, Tip[]> = {
  camera: CAMERA_TIPS,
  polar: STRAP_TIPS,
};

/**
 * What the capture attempt showed, reduced to the few facts that change the
 * advice. Taken from `ppgTrace` for the camera; a strap has no equivalent, so
 * every field is optional and an empty object is a valid answer.
 */
export interface TroubleEvidence {
  /** Frames the processor actually received. 0 means the camera never ran. */
  frames?: number;
  /** Did the lens ever read as covered by a fingertip? */
  fingerOn?: boolean;
  /** Did a steady pulse ever lock, at any point? */
  everLocked?: boolean;
}

/**
 * The one tip to lead with, or null to use the fixed order.
 *
 * The three camera cases, and why each gets the answer it does:
 *
 *  - NO FRAMES AT ALL. Nothing about placement can explain this — it is a
 *    permission, a busy camera or a driver, and the camera diagnostics dump is
 *    the tool for it. Leading with "warm your hands" to somebody whose camera
 *    never started would be nonsense, so this leads with nothing.
 *  - FRAMES, NEVER COVERED. The fingertip is not on the glass: either it is on
 *    the wrong part of the module or a case is holding it off. Placement.
 *  - LOCKED, THEN LOST. The finger is in the right place and the reading kept
 *    breaking, which is movement before it is anything else.
 *  - COVERED, NEVER LOCKED. A fingertip is there and no pulse comes through it,
 *    which is pressure or cold. Pressure leads, because it is both more common
 *    and the thing the user is actively doing wrong.
 */
export function leadTipId(source: TroubleSource, ev: TroubleEvidence = {}): string | null {
  if (source !== 'camera') return null;
  if (ev.frames === 0) return null;
  if (ev.frames != null && ev.frames > 0 && ev.fingerOn === false && !ev.everLocked) return 'cover';
  if (ev.everLocked) return 'steady';
  if (ev.fingerOn) return 'pressure';
  return null;
}

/** The tips to show, lead first. Never reorders anything else, and never
 *  invents or drops a tip — a promoted lead is the same list, re-ranked. */
export function tipsFor(source: TroubleSource, ev: TroubleEvidence = {}): Tip[] {
  const all = TIPS_BY_SOURCE[source] || CAMERA_TIPS;
  const lead = leadTipId(source, ev);
  if (!lead) return all;
  const hit = all.find((t) => t.id === lead);
  return hit ? [hit, ...all.filter((t) => t !== hit)] : all;
}

/**
 * The tips worth saying before the first attempt, in the main list's own order.
 *
 * Deliberately a SUBSET and deliberately brief. The full list is diagnosis and
 * belongs at the moment of failure; this is the handful a reader can act on
 * while they are still setting up, and it is four short lines rather than six
 * paragraphs because it sits between a new user and their first reading.
 */
export const CAMERA_PREP_TIPS: Tip[] = CAMERA_TIPS.filter((t) => t.prep);

/**
 * How long the setup card waits for a pulse to lock before offering help.
 *
 * Twenty seconds, not ten. A successful lock needs a few consecutive
 * finger-present frames, then three beats at a consistent rhythm inside a 5 s
 * window, on top of however long the camera took to bind — so a good reading
 * routinely takes 8-12 s to start, and a help link at 10 s would appear on most
 * successful attempts a moment before the reading began. That teaches the
 * reader that something is wrong every time, which is worse than saying
 * nothing: the offer has to mean "this is not working", and at 20 s with no
 * lock it does.
 *
 * This is the earliest point in the whole flow where help can be offered at
 * all, and the most valuable — a reading that never locks never starts, so
 * nothing downstream ever gets to fail and explain itself.
 */
export const TROUBLE_WAIT_SEC = 20;
