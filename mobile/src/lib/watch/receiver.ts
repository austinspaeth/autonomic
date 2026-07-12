/**
 * Watch companion receiver — the JS side of the WatchConnectivity bridge.
 *
 * Inbound: stand-test result payloads (modules/watch-bridge inbox + live
 * events) become `standTest` readings via the pure mapper in ./payload. The
 * 1 Hz HR series never touches the journal — it goes to the waveform sidecar
 * (sampledHr) BEFORE the entry is upserted, mirroring the live-HRV write
 * order. The write is flushed to disk before the ack, because an acked result
 * is never re-sent by the watch.
 *
 * Outbound: the applicationContext the watch mirrors — `pro` (subscription),
 * plus `age`/`sex` so the watch can compute a max-HR ceiling. Re-pushed on
 * entitlement changes, profile edits, and session activation; deduped so
 * journal churn doesn't spam WCSession.
 */
import { watchBridge, type WatchUserInfo } from '../../../modules/watch-bridge';
import { getIapState, subscribeIap } from '../../store/iap';
import { flushSave, getState, storeWaveform, subscribeStore, upsertEntry } from '../../store/store';
import { ageFromBirthday } from '../dates';
import { computeScores } from '../scoring';
import { mapStandTestPayload } from './payload';

let started = false;
let lastContext = '';

function pushContext() {
  const bridge = watchBridge();
  if (!bridge) return;
  const profile = getState().profile;
  const age = ageFromBirthday(profile?.birthday);
  const context: Record<string, unknown> = { pro: getIapState().isPro };
  if (age != null) context.age = age;
  if (profile?.sex) context.sex = profile.sex;
  const key = JSON.stringify(context);
  if (key === lastContext) return; // journal churn — nothing the watch cares about
  lastContext = key;
  bridge.updateContext(context).catch(() => { lastContext = ''; }); // not activated yet — retry on next change
}

function receive(info: WatchUserInfo) {
  const bridge = watchBridge();
  if (!bridge) return;
  const mapped = mapStandTestPayload(info);
  if (!mapped) return;
  // Sidecar first, then the journal entry, then flush — only after the entry
  // is on disk is it safe to ack (the watch never re-sends an acked id).
  if (mapped.waveform) storeWaveform(mapped.entry.id, mapped.waveform);
  const profile = getState().profile;
  mapped.entry.scores = computeScores(mapped.entry, { sex: profile?.sex, height: profile?.height });
  upsertEntry(mapped.dayKey, 'readings', mapped.entry);
  flushSave();
  bridge.sendAck(mapped.entry.id).catch(() => { /* still inboxed natively; retried next launch */ });
}

/** Call once at app start (alongside initIap). No-op without the native module. */
export function initWatchReceiver() {
  if (started) return;
  started = true;
  const bridge = watchBridge();
  if (!bridge) return;
  bridge.addListener('onUserInfo', receive);
  bridge.addListener('onStateChange', () => {
    // Session state changed (activation, watch app installed, reachability).
    // A context set before the watch app existed may never have landed, so
    // bypass the dedupe and re-send unconditionally.
    lastContext = '';
    pushContext();
  });
  subscribeIap(pushContext);
  subscribeStore(pushContext);
  // Drain results that arrived before JS attached (background deliveries).
  bridge.pendingUserInfo().then((list) => list.forEach(receive)).catch(() => {});
  pushContext();
}
