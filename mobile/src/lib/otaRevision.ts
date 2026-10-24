/**
 * Which over-the-air update a phone is running, as a mark after the version at
 * the foot of Settings: "Autonomic v1.36.0 ∞3" is the third OTA on top of the
 * 1.36.0 store build. It exists so a screenshot answers "does this user have the
 * fix yet", which the version number alone cannot: every OTA on a release
 * carries the same version.
 *
 * The number is stamped into the bundle at publish time
 * (`EXPO_PUBLIC_OTA_REVISION`, set by `.github/workflows/eas-update.yml` from the
 * `ota/v<version>/<n>` git tags), counted per VERSION, so it starts over with
 * every store release. Revision 0 is the publish made from the release commit
 * itself, which is the store build's own code, so it shows nothing; ∞1 is the
 * first real update after it.
 *
 * Nothing is shown on an embedded launch (the bundle that shipped inside the
 * binary), which is what clears the mark once a new release is installed. An
 * update published by hand, with no revision stamped, shows a bare ∞: it is
 * still not the store build, and saying so is the point.
 */

export const OTA_MARK = '∞';

/** Parse the stamped revision; anything that is not a whole number is unknown. */
export function parseRevision(raw: string | undefined | null): number | null {
  if (raw == null || !/^\d+$/.test(String(raw).trim())) return null;
  return Number(String(raw).trim());
}

/** The suffix after the version, or '' for the store build's own code. */
export function otaSuffix(embedded: boolean, revision: number | null): string {
  if (embedded) return '';
  if (revision == null) return OTA_MARK;
  return revision >= 1 ? `${OTA_MARK}${revision}` : '';
}

export function versionLabel(version: string, embedded: boolean, revision: number | null): string {
  const suffix = otaSuffix(embedded, revision);
  return suffix ? `Autonomic v${version} ${suffix}` : `Autonomic v${version}`;
}

/** What this launch is running. Reads, never throws: a dev build or a missing
 *  module reads as the embedded bundle, i.e. no mark. */
export function currentOta(): { embedded: boolean; revision: number | null } {
  let embedded = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const U = require('expo-updates');
    embedded = U?.isEnabled ? U.isEmbeddedLaunch !== false : true;
  } catch { /* no module: treat as the store build */ }
  return { embedded, revision: parseRevision(process.env.EXPO_PUBLIC_OTA_REVISION) };
}
