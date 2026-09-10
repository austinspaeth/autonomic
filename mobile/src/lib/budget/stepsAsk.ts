/**
 * Should the pacing strip ask for steps?
 *
 * It used to answer from what LANDED: a read ran today and brought back no step
 * count, so the permission must be missing. That is also exactly what a GRANTED
 * permission over an empty store looks like — an Android phone with nothing
 * writing steps into Health Connect, an iPhone at seven in the morning, or the
 * read that runs a moment after the grant and beats it — so the user tapped
 * Connect, granted everything, and the card went on telling them steps were not
 * connected. The ask is a claim about a PERMISSION, and it is now answered from
 * the permission:
 *
 *   `shouldRequest` — never asked (iOS) — and `denied` — provably not granted
 *   (Health Connect reports its grants) — raise it;
 *   `granted`, and `unknown` — HealthKit's answer for every type it has already
 *   asked about, granted or refused alike — do not. Once somebody has answered
 *   the sheet on iOS there is nothing true left to accuse them of;
 *   `null` — not checked yet this launch — does not either, so the mark never
 *   appears on a launch that has not looked.
 *
 * Steps that have actually arrived still outrank all of it (`everSeen`, the
 * install-wide latch, and `recentSteps`, the week's lookback): a count in hand
 * is proof whatever the permission API says.
 */
import type { HealthAuthStatus } from '../health';

export interface StepsAskInput {
  healthEnabled: boolean;
  /** A health read has ever brought back a step count on this install. */
  everSeen: boolean;
  /** A day in the recent lookback carries a step count. */
  recentSteps: boolean;
  /** The platform's answer for the steps read scope, or null if not read yet. */
  auth: HealthAuthStatus | null;
}

export function stepsAskDue(i: StepsAskInput): boolean {
  if (i.everSeen) return false;
  // Health switched off: nothing is read at all, whatever was granted.
  if (!i.healthEnabled) return true;
  if (i.recentSteps) return false;
  return i.auth === 'shouldRequest' || i.auth === 'denied';
}
