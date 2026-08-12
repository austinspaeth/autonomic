/**
 * Whole-app diagnostics collection — the impure half of ./appReport.ts.
 *
 * Reads, never requests. A dump must observe the current state, not change it:
 * asking for a permission here would rewrite the very fact the report exists to
 * establish, and on Android would burn the user's last prompt. Every health,
 * camera and Bluetooth call below is a status read.
 *
 * Never throws. A missing native module, an unreadable permission, a store
 * connection that never answered — those ARE the diagnosis, not a reason to
 * fail. Each section is wrapped so one bad reader can't cost the whole report.
 *
 * PRIVACY (the rule this file enforces): no health data and nothing
 * identifying. Journal contents are counted, never sampled. Absolute
 * timestamps become ages in days. The profile reports which fields are filled,
 * never their values. An import reports that it happened, not the file name.
 * The saved strap keeps its name (a product model, e.g. "Polar H10") because
 * that is the whole diagnostic value and the Bluetooth dump already shows it.
 */
import { Platform } from 'react-native';
import { appInfo, describeError, platformInfo } from './env';
import { getErrorLog } from './errorLog';
import type { AppDiagnostics, Rows } from './appReport';
import { getState, loadIssue, storageStats } from '../../store/store';
import { getIapState } from '../../store/iap';
import { getTier, getTrialDaysLeft } from '../../store/tier';
import { reviewMemory } from '../review';
import { lastUpsellSurface } from '../upsell';
import { formatMsLeft, offerMsLeft } from '../upsell/annual';
import { annualMemory } from '../upsell/annualMemory';
import { getDeclinedKeys } from '../health/declined';
import { health, healthAppName } from '../health';
import { bleIfStarted } from '../ble/manager';
import { isSideloadedAndroidBuild, isTestFlightBuild } from '../../../modules/app-env';
import { watchBridge } from '../../../modules/watch-bridge';
import { trustedReadings } from '../hrvQuality';
import { dateFromKey } from '../dates';
import type { AppState } from '../types';

/** Run a reader, turning any failure into a printable value. Sections use this
 *  so a single throwing native call degrades one row, not the report. */
async function safe<T>(fn: () => T | Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch { return fallback; }
}

/** Same, but the failure text IS the answer worth printing. */
async function safeText(fn: () => unknown | Promise<unknown>): Promise<string> {
  try { return String(await fn()); } catch (e) { return `unreadable (${describeError(e)})`; }
}

/** VisionCamera, or null when it isn't in this build — a missing module is a
 *  fact to print, not an error to report. */
function visionCamera(): { Camera?: {
  getCameraPermissionStatus(): string;
  getAvailableCameraDevices(): { hasTorch: boolean }[];
}; getCameraDevice?: (list: unknown, pos: string) => { hasTorch: boolean } | undefined } | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-vision-camera');
  } catch {
    return null;
  }
}

/** expo-notifications reports the iOS grant as a raw enum; name it. */
const IOS_AUTH_STATUS = ['not determined', 'denied', 'authorized', 'provisional', 'ephemeral'];

const DAY_MS = 86_400_000;

/** Absolute time → age in whole days, so a dump carries no dates. `null` for
 *  anything missing or unparseable, which prints as —. */
function ageDays(at: string | number | null | undefined, now = Date.now()): number | null {
  if (at == null) return null;
  const ms = typeof at === 'number' ? at : Date.parse(at);
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.round((now - ms) / DAY_MS));
}

const daysAgo = (at: string | number | null | undefined): string | null => {
  const n = ageDays(at);
  return n == null ? null : n === 0 ? 'today' : n === 1 ? '1 day ago' : `${n} days ago`;
};

const kb = (bytes: number | null): string | null =>
  bytes == null ? null : bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024).toLocaleString()} KB`;

/* ---------- sections ---------- */

/** Counts only — the journal's shape without a byte of its content. */
function journalRows(s: AppState): Rows {
  const keys = Object.keys(s.days).sort();
  let readings = 0, activities = 0, meds = 0, symptoms = 0, movements = 0, meals = 0;
  let hrv = 0, hrvTrusted = 0, imported = 0, sleepNights = 0, staged = 0, water = 0;
  for (const k of keys) {
    const d = s.days[k];
    readings += d.readings?.length ?? 0;
    activities += d.activities?.length ?? 0;
    meds += d.meds?.length ?? 0;
    symptoms += d.symptoms?.length ?? 0;
    movements += d.digestion?.movements?.length ?? 0;
    meals += d.food?.meals?.length ?? 0;
    if (d.food?.water) water++;
    if (d.sleep?.bed || d.sleep?.wake) sleepNights++;
    if (d.sleep?.stages) staged++;
    const hrvRows = (d.readings ?? []).filter((r) => r.type === 'hrv');
    hrv += hrvRows.length;
    hrvTrusted += trustedReadings(hrvRows).length;
    imported += [...(d.readings ?? []), ...(d.activities ?? []), ...(d.meds ?? [])]
      .filter((e) => (e as { imported?: boolean }).imported).length;
  }
  const first = keys[0], last = keys[keys.length - 1];
  const span = first && last
    ? Math.round((dateFromKey(last).getTime() - dateFromKey(first).getTime()) / DAY_MS) + 1
    : 0;
  return {
    'days logged': keys.length,
    'span (days)': span,
    'oldest day': first ? daysAgo(dateFromKey(first).getTime()) : null,
    'newest day': last ? daysAgo(dateFromKey(last).getTime()) : null,
    readings,
    'hrv readings': hrv,
    'hrv counted': hrvTrusted,   // the rest are short imported samples (hrvQuality)
    activities,
    meds,
    symptoms,
    meals,
    'bowel movements': movements,
    'days with water': water,
    'nights of sleep': sleepNights,
    'nights with stages': staged,
    'imported entries': imported,
  };
}

/** Which settings are set, and to what — all product configuration, no content.
 *  The profile is reported as filled/not, since its values are personal. */
function settingsRows(s: AppState): Rows {
  const st = s.settings;
  const prof = s.profile || {};
  return {
    theme: st.theme,
    'reminder enabled': st.reminder?.enabled ?? false,
    'reminder time': st.reminder?.time ?? null,
    'crash alert': st.crashAlert?.enabled == null ? 'never chosen' : st.crashAlert.enabled,
    'crash alert fired': st.crashAlert?.lastFired ? daysAgo(dateFromKey(st.crashAlert.lastFired).getTime()) : 'never',
    'custom protocol': !!st.protocol,
    'protocol set': st.protocolSetOn ? daysAgo(dateFromKey(st.protocolSetOn).getTime()) : 'never',
    'last hrv source': st.lastHrvSource ?? null,
    'camera layout': st.cameraLayout ? `${st.cameraLayout.shape} / flash ${st.cameraLayout.flash}` : 'not set',
    'saved strap': st.lastBleDeviceName ?? (st.lastBleDeviceId ? 'saved (unnamed)' : 'none'),
    'custom types': Object.values(s.customTypes ?? {}).reduce((n, m) => n + Object.keys(m ?? {}).length, 0),
    'hidden built-ins': Object.values(s.hiddenTypes ?? {}).reduce((n, a) => n + (a?.length ?? 0), 0),
    'profile fields set': ['sex', 'birthday', 'height', 'weight']
      .filter((k) => (prof as unknown as Record<string, string | undefined>)[k]).join(', ') || 'none',
    onboarded: s.meta?.onboarded ? daysAgo(s.meta.onboarded) : 'no',
  };
}

function subscriptionRows(): Rows {
  const iap = getIapState();
  const tier = getTier();
  return {
    tier,
    'store ready': iap.ready,
    entitled: iap.isPro,
    'active plan': iap.activeSku ?? null,
    'products loaded': iap.products.map((p) => p.productId).join(', ') || 'none',
    'trial days left': tier === 'trial' ? getTrialDaysLeft() : null,
    'purchase in flight': iap.purchasing ?? false,
  };
}

function distributionRows(): Rows {
  const review = reviewMemory();
  return {
    'ios sandbox receipt': Platform.OS === 'ios' ? isTestFlightBuild() : null,
    'android sideload': Platform.OS === 'android' ? isSideloadedAndroidBuild() : null,
    'review asked': review.lastAskedAtMs ? daysAgo(review.lastAskedAtMs) : 'never',
    'review asked on version': review.askedVersion ?? null,
    // Which proactive offer this user last saw — the only conversion signal an
    // app with no analytics has. A surface name, never a count of their data.
    'last upsell surface': lastUpsellSurface() ?? 'none',
    // The half-off annual offer: which milestone was awarded and whether its
    // 24h window (and the Pro unlock riding on it) is still open. Two integers.
    'annual offer': annualOfferRow(),
  };
}

/** "day-30, 21h left" / "day-30, closed" / "none" — see src/lib/upsell/annual. */
function annualOfferRow(): string {
  const m = annualMemory();
  const spent = m.consumed.length ? `day-${Math.max(...m.consumed)}` : null;
  if (!spent) return 'none';
  const left = offerMsLeft(Date.now(), m);
  return left > 0 ? `${spent}, ${formatMsLeft(left)} left` : `${spent}, closed`;
}

/** Notification permission + what is actually on the OS schedule. The gap
 *  between `settings.reminder` and this list is the whole diagnosis for
 *  "the reminder stopped arriving". */
async function notificationRows(): Promise<Rows> {
  const rows: Rows = {};
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const N = require('expo-notifications');
    const perm = await N.getPermissionsAsync();
    rows['permission'] = String(perm?.status ?? 'unknown');
    rows['granted'] = !!perm?.granted;
    rows['can ask again'] = perm?.canAskAgain ?? null;
    if (Platform.OS === 'ios') {
      const st = perm?.ios?.status;
      rows['ios setting'] = typeof st === 'number' ? (IOS_AUTH_STATUS[st] ?? `status ${st}`) : null;
    }
    const scheduled = await N.getAllScheduledNotificationsAsync();
    rows['scheduled'] = Array.isArray(scheduled) ? scheduled.length : null;
    if (Array.isArray(scheduled)) {
      rows['scheduled ids'] = scheduled.map((n: { identifier?: string }) => n.identifier ?? '?').join(', ') || 'none';
    }
    if (Platform.OS === 'android') {
      const channels = await N.getNotificationChannelsAsync();
      rows['channels'] = Array.isArray(channels)
        ? channels.map((c: { id: string; importance: number }) => `${c.id}(imp ${c.importance})`).join(', ')
        : null;
    }
  } catch (e) {
    rows['permission'] = `unreadable (${describeError(e)})`;
  }
  return rows;
}

/** Permission grants, read without prompting. A row reading "—" means the
 *  platform has no such concept, not that it was refused. */
async function permissionRows(): Promise<Rows> {
  const rows: Rows = {};

  // Camera: VisionCamera's own view, which is the one the reading flow gates on.
  rows['camera'] = await safeText(() => {
    const vc = visionCamera();
    return vc?.Camera ? vc.Camera.getCameraPermissionStatus() : 'no native module';
  });

  if (Platform.OS === 'android') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PermissionsAndroid } = require('react-native');
    const check = async (label: string, perm: string | undefined) => {
      if (!perm) return;
      rows[label] = await safeText(async () => ((await PermissionsAndroid.check(perm)) ? 'granted' : 'denied'));
    };
    const P = PermissionsAndroid.PERMISSIONS;
    await check('android camera', P.CAMERA);
    await check('bluetooth scan', P.BLUETOOTH_SCAN);
    await check('bluetooth connect', P.BLUETOOTH_CONNECT);
    await check('fine location', P.ACCESS_FINE_LOCATION);
    await check('post notifications', P.POST_NOTIFICATIONS);
    await check('activity recognition', P.ACTIVITY_RECOGNITION);
  }

  // Health read access. HealthKit never reveals read grants, so iOS can only
  // ever report 'unknown' for a scope it has already asked about — that is the
  // platform answering, not a fault.
  const api = health();
  rows[`${healthAppName().toLowerCase()} read`] = api.available
    ? await safeText(() => api.readAuthStatus('all'))
    : 'not available';
  rows['workout read'] = api.available ? await safeText(() => api.readAuthStatus('workouts')) : 'not available';

  return rows;
}

/** What this build and this phone can actually do — the difference between
 *  "the user refused" and "the feature was never here". */
async function capabilityRows(): Promise<Rows> {
  const rows: Rows = {};
  const mod = (name: string, probe: () => boolean) => {
    try { rows[name] = probe() ? 'loaded' : 'MISSING'; } catch (e) { rows[name] = `MISSING (${describeError(e)})`; }
  };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  mod('vision-camera', () => !!require('react-native-vision-camera')?.Camera);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  mod('worklets-core', () => !!require('react-native-worklets-core')?.useRunOnJS);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  mod('ble-plx', () => !!require('react-native-ble-plx')?.BleManager);

  rows['rear camera'] = await safeText(() => {
    const vc = visionCamera();
    if (!vc?.Camera) return 'no native module';
    const list = vc.Camera.getAvailableCameraDevices();
    const back = vc.getCameraDevice?.(list, 'back');
    if (!back) return `none (${list.length} camera(s) listed)`;
    return `present, torch ${back.hasTorch ? 'yes' : 'no'}`;
  });

  rows['health module'] = health().available ? `${healthAppName()} available` : `${healthAppName()} unavailable`;
  rows['watch bridge'] = watchBridge() ? 'loaded' : Platform.OS === 'ios' ? 'MISSING' : 'n/a';
  rows['widget bridge'] = await safeText(() => {
    if (Platform.OS === 'ios') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('../../../modules/widget-bridge').widgetBridge() ? 'loaded' : 'MISSING';
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-android-widget') ? 'loaded' : 'MISSING';
  });
  rows['store review'] = await safeText(async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const SR = require('expo-store-review');
    return (await SR.isAvailableAsync()) ? ((await SR.hasAction()) ? 'available' : 'no action') : 'unavailable';
  });
  rows['sharing'] = await safeText(async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const S = require('expo-sharing');
    return (await S.isAvailableAsync()) ? 'available' : 'unavailable';
  });
  return rows;
}

/**
 * Bluetooth, read WITHOUT starting the radio. Creating a BleManager builds a
 * CBCentralManager, and that is what raises the iOS Bluetooth permission alert
 * — so a user who has never opened Devices would be prompted by the act of
 * collecting a report about whether they'd been prompted. If nothing started it
 * this session, say exactly that and stop; the Bluetooth dump (hold "Scan for
 * straps") is the tool for the rest.
 */
async function bluetoothRows(s: AppState): Promise<Rows> {
  const mgr = bleIfStarted();
  const savedStrap = s.settings.lastBleDeviceName ?? (s.settings.lastBleDeviceId ? 'saved (unnamed)' : 'none');
  if (!mgr) {
    return {
      'native module': await safeText(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return require('react-native-ble-plx')?.BleManager ? 'present (not started)' : 'MISSING';
      }),
      'adapter state': 'not started this session — open Devices to read it',
      'saved strap': savedStrap,
    };
  }
  const readiness = await safe(() => mgr.ready(), { ok: false, state: 'unreadable', message: null });
  return {
    'native module': mgr.available,
    'adapter state': readiness.state,
    'can scan now': readiness.ok,
    blocker: readiness.message,
    'saved strap': savedStrap,
  };
}

function healthRows(s: AppState): Rows {
  return {
    app: healthAppName(),
    available: health().available,
    'connected in settings': !!s.settings.healthEnabled,
    'history imported': s.meta?.healthHistoryImported ? daysAgo(s.meta.healthHistoryImported) : 'never',
    'declined samples': getDeclinedKeys().size,
  };
}

async function watchRows(): Promise<Rows | null> {
  if (Platform.OS !== 'ios') return null;
  const bridge = watchBridge();
  if (!bridge) return { bridge: 'MISSING from this build' };
  const st = await safe(() => bridge.getState(), null);
  if (!st) return { bridge: 'loaded', state: 'unreadable' };
  return {
    supported: st.supported,
    'session activated': st.activated,
    paired: st.paired,
    'watch app installed': st.watchAppInstalled,
    reachable: st.reachable,
    'queued results': await safe(async () => (await bridge.pendingUserInfo()).length, null),
  };
}

function storageRows(s: AppState): Rows {
  const st = storageStats();
  return {
    encrypted: st.encrypted,
    'journal size': kb(st.journalBytes),
    'waveform blobs': st.waveformCount,
    'waveform size': kb(st.waveformBytes),
    'orphan waveforms': st.orphanWaveforms,
    'launch load': loadIssue ? loadIssue.kind : 'ok',
    'last saved': s.meta?.lastUpdated ? daysAgo(s.meta.lastUpdated) : 'never',
    'last import': s.meta?.lastImport ? daysAgo(s.meta.lastImport.at) : 'never',   // name withheld
    'schema version': s.version,
  };
}

/* ---------- notes ---------- */

/** The things worth saying out loud, in the order they bite. Everything here is
 *  derived from rows already in the report — a note is a shortcut for the
 *  reader, never a fact that appears nowhere else. */
function buildNotes(d: Omit<AppDiagnostics, 'notes'>): string[] {
  const notes: string[] = [];
  if (loadIssue?.kind === 'corrupt') {
    notes.push('The journal on disk could NOT be parsed at launch. The raw blob was stashed under the recovery key and the app started on an empty journal — this is the "all my data vanished" case, and it is recoverable.');
  }
  if (!d.storage.encrypted) {
    notes.push('The Keychain was unavailable, so the journal is on the plaintext store rather than the encrypted one. Usually a restored-from-backup device before first unlock.');
  }
  if (d.journal['days logged'] === 0) {
    notes.push('No days logged at all — Progress and Insights are showing the demo month, not this user\'s data.');
  }
  const notif = d.notifications['granted'];
  const reminderOn = d.settings['reminder enabled'];
  if (reminderOn === true && notif === false) {
    notes.push('The morning reminder is switched ON in settings but notification permission is NOT granted, so it cannot fire. Nothing in the app will say so.');
  }
  if (reminderOn === true && d.notifications['scheduled'] === 0) {
    notes.push('The reminder is on and permitted, but the OS has nothing scheduled. syncReminder() should have reconciled this at launch.');
  }
  if (String(d.permissions['camera']) === 'denied' || String(d.permissions['camera']) === 'restricted') {
    notes.push('Camera permission is refused, so finger (PPG) readings can never start. On Android the prompt will not reappear — it needs system Settings.');
  }
  if (d.capabilities['worklets-core'] !== 'loaded' || d.capabilities['vision-camera'] !== 'loaded') {
    notes.push('A camera native module is missing from this build, so camera readings cannot work here at all.');
  }
  if (d.bluetooth['native module'] === true && d.bluetooth['can scan now'] === false) {
    notes.push(`Bluetooth cannot scan right now: adapter is ${d.bluetooth['adapter state']}.`);
  }
  if (d.health['connected in settings'] === true && d.health['available'] === false) {
    notes.push(`${healthAppName()} is marked connected in settings but the platform reports it unavailable, so every import will read as "nothing new".`);
  }
  if (d.subscription['store ready'] === false) {
    notes.push('The store connection never became ready, so the entitlement shown is the last remembered answer rather than a fresh one. A user reporting "it forgot my subscription" belongs here.');
  }
  if (d.watch && d.watch['paired'] === true && d.watch['watch app installed'] === false) {
    notes.push('A watch is paired but the Autonomic watch app is not installed on it.');
  }
  if (d.watch && typeof d.watch['queued results'] === 'number' && (d.watch['queued results'] as number) > 0) {
    notes.push(`${d.watch['queued results']} watch result(s) are still sitting in the native inbox, i.e. they arrived but were never drained into the journal.`);
  }
  const fatal = d.errors.filter((e) => e.fatal).length;
  if (fatal) notes.push(`${fatal} uncaught error(s) in the log below — those are crashes or red boxes, not handled failures.`);
  if (!d.errors.length) notes.push('The error log is empty: nothing has failed loudly enough to be recorded since it was last cleared.');
  return notes;
}

/**
 * Collect the whole-app support dump. Safe to call from anywhere: it reads
 * only, never prompts, and never throws.
 */
export async function collectAppDiagnostics(): Promise<AppDiagnostics> {
  const s = getState();
  const partial: Omit<AppDiagnostics, 'notes'> = {
    at: new Date().toISOString(),
    app: await safe(appInfo, {}),
    platform: await safe(platformInfo, {}),
    distribution: await safe(distributionRows, {}),
    subscription: await safe(subscriptionRows, {}),
    permissions: await safe(permissionRows, {}),
    capabilities: await safe(capabilityRows, {}),
    health: await safe(() => healthRows(s), {}),
    watch: await safe(watchRows, null),
    bluetooth: await safe(() => bluetoothRows(s), {}),
    notifications: await safe(notificationRows, {}),
    storage: await safe(() => storageRows(s), {}),
    journal: await safe(() => journalRows(s), {}),
    settings: await safe(() => settingsRows(s), {}),
    errors: getErrorLog(),
  };
  return { ...partial, notes: await safe(() => buildNotes(partial), []) };
}
