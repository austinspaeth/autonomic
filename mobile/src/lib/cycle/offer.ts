/**
 * When the Journal offers cycle-aware tracking. Pure.
 *
 * Asked ONCE. "Not for me" is permanent and lives in the flags store (it is a
 * fact about the person, not the journal, so erasing the journal does not ask
 * again — the rule every "about the person" flag keeps). Never shown:
 *  - to a profile that says Male (Settings → Cycle still offers it to anyone,
 *    because profile sex only ever drove the HRV norms);
 *  - once tracking has been set up, whether on or off — a user who switched it
 *    off in Settings chose to;
 *  - before the first HRV reading, when the Outlook slot is the baseline ask
 *    and the Journal has nothing it could account a cycle for yet;
 *  - on any day but today.
 */
export interface CycleOfferInput {
  sex: string;
  setUp: boolean;
  dismissed: boolean;
  hasReading: boolean;
  isToday: boolean;
}

export function cycleOfferDue(i: CycleOfferInput): boolean {
  if (i.dismissed || i.setUp || !i.hasReading || !i.isToday) return false;
  return i.sex.trim().toLowerCase() !== 'male';
}

/** The card's two wordings: profile says Female, or says nothing. */
export const offerKnownFemale = (sex: string) => sex.trim().toLowerCase() === 'female';
