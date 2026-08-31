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
 * Outbound: the applicationContext the watch mirrors — `pro` (freemium tier:
 * true while trialing or subscribed, gating the watch POTS captures), plus
 * `age`/`sex` so the watch can compute a max-HR ceiling. Re-pushed on tier
 * changes (entitlement AND local-trial expiry), profile edits, and session
 * activation; deduped so journal churn doesn't spam WCSession.
 */
import { watchBridge, type WatchUserInfo } from '../../../modules/watch-bridge';
import { getTier, subscribeTier } from '../../store/tier';
import { flushSave, getState, storeWaveform, subscribeStore, upsertEntry } from '../../store/store';
import { pingWristReading } from '../../store/ping';
import { ageFromBirthday, todayKey } from '../dates';
import { SYMPTOM_TYPES } from '../registry';
import { computeScores } from '../scoring';
import type { Entry } from '../types';
import { mapWatchPayload } from './payload';

let started = false;
let lastContext = '';

/** Readings that arrive from the watch while the app is running: the UI
 *  subscribes to auto-open the results card. Only live deliveries notify —
 *  the launch-time backlog drain would otherwise stack a sheet per queued
 *  result over onboarding/paywall gates. */
type ArrivalListener = (dayKey: string, entry: Entry) => void;
const arrivalListeners = new Set<ArrivalListener>();
export function subscribeWatchArrivals(fn: ArrivalListener): () => void {
  arrivalListeners.add(fn);
  return () => { arrivalListeners.delete(fn); };
}

function pushContext() {
  const bridge = watchBridge();
  if (!bridge) return;
  const profile = getState().profile;
  const age = ageFromBirthday(profile?.birthday);
  const context: Record<string, unknown> = { pro: getTier() !== 'free' };
  if (age != null) context.age = age;
  if (profile?.sex) context.sex = profile.sex;
  // The quick-log symptom list the watch mirrors — id + label in registry order.
  context.symptomTypes = Object.entries(SYMPTOM_TYPES).map(([id, def]) => ({ id, label: def.label }));
  const key = JSON.stringify(context);
  if (key === lastContext) return; // journal churn — nothing the watch cares about
  lastContext = key;
  // sentAt makes each payload unique: WCSession silently skips delivery of an
  // applicationContext identical to the previous one, which strands a watch
  // whose app was installed after the first push. Excluded from the dedupe key.
  context.sentAt = new Date().toISOString();
  bridge.updateContext(context).catch(() => { lastContext = ''; }); // not activated yet — retry on next change
}

function receive(info: WatchUserInfo, live = false) {
  const bridge = watchBridge();
  if (!bridge) return;
  const mapped = mapWatchPayload(info);
  if (!mapped) return;
  // A failed ack makes the watch re-send an id we already hold — upserting is
  // harmless, but only a genuinely new reading should pop the results card.
  const fresh = !(getState().days[mapped.dayKey]?.[mapped.section] || []).some((e) => e.id === mapped.entry.id);
  // Sidecar first, then the journal entry, then flush — only after the entry
  // is on disk is it safe to ack (the watch never re-sends an acked id).
  if (mapped.waveform) storeWaveform(mapped.entry.id, mapped.waveform);
  if (mapped.section === 'readings') {
    const profile = getState().profile;
    mapped.entry.scores = computeScores(mapped.entry, { sex: profile?.sex, height: profile?.height });
  }
  upsertEntry(mapped.dayKey, mapped.section, mapped.entry);
  flushSave();
  bridge.sendAck(mapped.entry.id).catch(() => { /* still inboxed natively; retried next launch */ });
  // A reading taken on the wrist ran no phone session, so the capture counters
  // in `sessionStore` never saw it. Gated on `fresh` and on the reading being
  // TODAY'S, not on `live`: an inboxed reading delivered at launch is still a
  // reading this install took, as long as it was taken today.
  if (fresh && mapped.entry.type === 'hrv' && mapped.dayKey === todayKey()) pingWristReading('watch');
  if (live && fresh && mapped.section === 'readings') arrivalListeners.forEach((fn) => fn(mapped.dayKey, mapped.entry));
}

/** Call once at app start (alongside initIap). No-op without the native module. */
export function initWatchReceiver() {
  if (started) return;
  started = true;
  const bridge = watchBridge();
  if (!bridge) return;
  bridge.addListener('onUserInfo', (info) => receive(info, true));
  bridge.addListener('onStateChange', () => {
    // Session state changed (activation, watch app installed, reachability).
    // A context set before the watch app existed may never have landed, so
    // bypass the dedupe and re-send unconditionally.
    lastContext = '';
    pushContext();
  });
  subscribeTier(pushContext);
  subscribeStore(pushContext);
  // Drain results that arrived before JS attached (background deliveries).
  bridge.pendingUserInfo().then((list) => list.forEach((info) => receive(info))).catch(() => {});
  pushContext();
}
