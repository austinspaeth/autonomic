import { Redirect } from 'expo-router';

/**
 * Garmin Connect's device-selection callback lands here.
 *
 * It returns the chosen watch by opening `autonomic-ciq://device-select-resp?…`,
 * and expo-router reads that first path segment as a ROUTE. Without a file to
 * match it the user is dumped on the Unmatched Route screen — the URL is still
 * delivered to our listener in `lib/garmin/receiver.ts` and the watch still
 * links, but the app looks broken at the exact moment it succeeded.
 *
 * The app's own deep links dodge this by using query params rather than paths
 * (see `useCaptureDeepLink`), but Garmin builds this URL, so the path is not
 * ours to choose. A route that immediately redirects is the fix.
 *
 * Nothing is parsed here: the receiver's Linking listener owns that, and doing
 * it in a component would tie device linking to a screen being mounted.
 */
export default function GarminDeviceSelectCallback() {
  return <Redirect href="/" />;
}
