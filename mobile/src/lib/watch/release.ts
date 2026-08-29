/**
 * The release gate for the non-Apple watch link.
 *
 * ONE flag, deliberately in its own pure module rather than beside the UI that
 * reads it: the Garmin surfaces span a feature card, the welcome wizard, the
 * source picker, the receiver and the release notes, and a gate living inside
 * any one of those cannot be imported by the others without dragging React or
 * the store along with it.
 *
 * Why it exists: nothing in the app may point a user at a watch app they cannot
 * install. The Connect IQ companion is submitted but not approved, so every
 * surface that OFFERS Garmin — the "Garmin watches are now supported" tab on the
 * HRV setup card, the brand row in the source picker and in the last step of the
 * welcome wizard, the linked-watch source row those two grow once a watch is
 * paired, the sync pill and arrival card behind it, and the release-note bullet
 * announcing all of it — is held behind this until it is.
 *
 * Nothing is deleted. Flip this to `true` on the day the watch app is approved
 * and every one of those comes back exactly as it was built; that is the whole
 * point of the flag, and the reason the code behind it is untouched. Readings
 * that already arrived from a watch keep their `garmin` source and their device
 * name in the journal either way — hiding the offer must never relabel data the
 * user already has.
 */
export const GARMIN_RELEASED = false;
