/**
 * A URL may never drop the app onto a TAB.
 *
 * The app's own deep links deliberately use QUERY params rather than paths
 * (`autonomic://?capture=hrv`, see `useCaptureDeepLink`), and the one
 * path-based link it answers is Garmin Connect's `device-select-resp` callback,
 * whose URL Garmin builds. Nothing is meant to enter Journal / Progress /
 * Insights by name.
 *
 * Without this the initial route is whatever the launch URL resolves to, and on
 * iOS that URL outlives a JS reload: `Linking.getLinkingURL()` returns the last
 * URL that opened the PROCESS, so one deep link opened while testing goes on
 * deciding the route on every `r` in Metro until the app is killed. That is how
 * a dev build ends up starting on Insights — the one tab that has to build a
 * report before it can paint.
 *
 * Deliberately a deny-list of the tab names rather than an allow-list of what we
 * own: this receives the RAW url (expo-router calls it before extracting a
 * path), which in a dev client is the launcher's own `?url=` wrapper, and
 * rewriting that would break loading the bundle at all.
 */
const TAB_ROUTES = ['index', 'analysis', 'insights'];

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const after = path.split('://').pop() || '';
    const name = after.replace(/^\/+/, '').split(/[/?#]/)[0];
    return TAB_ROUTES.includes(name) ? '/' : path;
  } catch {
    // Never let a malformed URL take the app down on launch.
    return '/';
  }
}
