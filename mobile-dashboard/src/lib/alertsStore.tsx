/* The shell around lib/alerts.ts: polling, memory, toasts and celebrations.
 *
 * While the app is in front it asks for the last 45 days of pings every
 * POLL_MS, diffs them against the baseline it last saw, and announces what
 * rose: a toast per event (they stack until dismissed), an entry in the
 * history the bell opens, and the celebration for its kind. The baseline is
 * remembered on disk, so what arrived while the app was closed is announced
 * when it opens, up to MAX_CATCHUP_MS; a first launch seeds in silence.
 *
 * (With the app closed, instant alerts are the job of native push, which
 * needs a development build; see the project memory.)
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import * as Haptics from 'expo-haptics';
import { api } from './api';
import { mergeReport, useData } from './data';
import { onPush, registerForPush } from './push';
import { addDays, easternDay, shortDate } from './dates';
import { diff, MAX_CATCHUP_MS, records, snapshot, type AlertEvent, type Snapshot } from './alerts';
import { celebrate, type CelebrationKind } from '../components/Celebration';

const BASE_KEY = 'master.alerts.baseline.v1';
const HISTORY_KEY = 'master.alerts.history.v1';
const SEEN_KEY = 'master.alerts.seen.v1';
const PURGE_KEY = 'master.alerts.crashPurge.v1';
const POLL_MS = 45 * 1000;
const HISTORY_MAX = 500;

const CELEBRATION: Partial<Record<AlertEvent['kind'], CelebrationKind>> = {
  sale: 'sale',
  download: 'download',
  visitor: 'return',
  record: 'record',
};

type AlertsState = {
  history: AlertEvent[];
  /** Ids currently up as toasts. */
  live: string[];
  unread: number;
  dismiss: (id: string) => void;
  dismissAll: () => void;
  markRead: () => void;
  clearHistory: () => void;
  /** Raise sample alerts of each kind, without touching the baseline or history. */
  preview: (kind: AlertEvent['kind'] | 'all') => void;
};

const Ctx = createContext<AlertsState>({
  history: [],
  live: [],
  unread: 0,
  dismiss: () => {},
  dismissAll: () => {},
  markRead: () => {},
  clearHistory: () => {},
  preview: () => {},
});

export function AlertsProvider({ children }: { children: ReactNode }) {
  const [history, setHistory] = useState<AlertEvent[]>([]);
  const [previews, setPreviews] = useState<AlertEvent[]>([]);
  const [live, setLive] = useState<string[]>([]);
  const [seenAt, setSeenAt] = useState(0);
  const busy = useRef(false);
  const { snap } = useData();
  const snapRef = useRef(snap);
  snapRef.current = snap;
  const fired = useRef<Set<string>>(new Set());

  useEffect(() => {
    AsyncStorage.multiGet([HISTORY_KEY, SEEN_KEY, PURGE_KEY])
      .then(([[, h], [, s], [, purged]]) => {
        if (h) {
          let list: AlertEvent[] = JSON.parse(h);
          /* One-time cleanup: an early build announced a backlog of old
             crashes as new (its baseline predated crash tracking). */
          if (!purged) {
            list = list.filter((e) => e.kind !== 'crash');
            AsyncStorage.multiSet([[HISTORY_KEY, JSON.stringify(list)], [PURGE_KEY, '1']]).catch(() => {});
          }
          setHistory(list);
          list.forEach((e) => fired.current.add(e.id));
        }
        if (s) setSeenAt(Number(s) || 0);
      })
      .catch(() => {});
  }, []);

  const announce = useCallback((events: AlertEvent[], save = true) => {
    if (!events.length) return;
    if (save) {
      setHistory((cur) => {
        const next = [...events, ...cur].slice(0, HISTORY_MAX);
        AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    } else {
      setPreviews((cur) => [...events, ...cur]);
    }
    setLive((cur) => [...cur, ...events.map((e) => e.id)]);
    const kinds = new Set(events.map((e) => CELEBRATION[e.kind]).filter(Boolean) as CelebrationKind[]);
    (['record', 'sale', 'download', 'return'] as CelebrationKind[]).forEach((k, i) => {
      if (kinds.has(k)) setTimeout(() => celebrate(k), i * 350);
    });
    Haptics.notificationAsync(
      events.some((e) => e.kind === 'crash')
        ? Haptics.NotificationFeedbackType.Error
        : events.some((e) => e.kind === 'sale' || e.kind === 'record')
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning,
    ).catch(() => {});
  }, []);

  const check = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      // Only the last two days: a sliding window that never misses a ping
      // between checks, at a fraction of the full report's size.
      const since = addDays(easternDay(), -1);
      const report = await api.pings(since);
      const next = snapshot(report);
      // Records need history; the phone's own copy has it, topped up with this.
      const history = mergeReport(snapRef.current?.pings, report, since);
      const raw = await AsyncStorage.getItem(BASE_KEY);
      const prev: Snapshot | null = raw ? JSON.parse(raw) : null;
      await AsyncStorage.setItem(BASE_KEY, JSON.stringify(next));
      // First launch, or away too long: seed in silence rather than replay history.
      if (!prev || next.at - prev.at > MAX_CATCHUP_MS) {
        records(history, easternDay()).forEach((r) => fired.current.add(r.id));
        return;
      }
      const events = diff(prev, next);
      const recs = records(history, easternDay()).filter((r) => !fired.current.has(r.id));
      recs.forEach((r) => fired.current.add(r.id));
      announce([...recs, ...events]);
    } catch {
      // Offline is a phone's normal state; the next poll tries again.
    } finally {
      busy.current = false;
    }
  }, [announce]);

  // Register for instant pushes, and treat an arriving push as "check now".
  useEffect(() => {
    registerForPush().catch(() => {});
    return onPush(() => check());
  }, [check]);

  useEffect(() => {
    check();
    let timer: ReturnType<typeof setInterval> | null = setInterval(check, POLL_MS);
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') {
        check();
        if (!timer) timer = setInterval(check, POLL_MS);
      } else if (timer) {
        clearInterval(timer);
        timer = null;
      }
    });
    return () => {
      if (timer) clearInterval(timer);
      sub.remove();
    };
  }, [check]);

  const preview = useCallback(
    (kind: AlertEvent['kind'] | 'all') => {
      const samples = sampleEvents().filter((e) => kind === 'all' || e.kind === kind);
      announce(samples, false);
    },
    [announce],
  );

  const all = [...previews, ...history];
  const value: AlertsState = {
    history: all,
    live,
    unread: history.filter((e) => e.at > seenAt).length,
    dismiss: (id) => setLive((cur) => cur.filter((x) => x !== id)),
    dismissAll: () => setLive([]),
    markRead: () => {
      const now = Date.now();
      setSeenAt(now);
      AsyncStorage.setItem(SEEN_KEY, String(now)).catch(() => {});
    },
    clearHistory: () => {
      setHistory([]);
      setPreviews([]);
      AsyncStorage.removeItem(HISTORY_KEY).catch(() => {});
    },
    preview,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAlerts = () => useContext(Ctx);

/* Sample events for the preview buttons: realistic shapes, clearly fake ids. */
function sampleEvents(): AlertEvent[] {
  const at = Date.now();
  const day = easternDay();
  const c = (n: number) => addDays(day, -n);
  const id = (k: string) => `preview-${k}-${at}-${Math.random().toString(36).slice(2, 6)}`;
  return [
    {
      id: id('record'),
      kind: 'record',
      at,
      day,
      count: 312,
      title: 'All-time high: 312 in the app',
      body: `Beat the old best of 298 on ${shortDate(c(18))}`,
      rows: [],
    },
    {
      id: id('sale'),
      kind: 'sale',
      at,
      day,
      count: 2,
      title: '2 new sales',
      body: '1 Yearly · 1 Founder year · 1 on iOS · 1 on Android',
      rows: [
        { cohort: c(9), platform: 'I', tier: 'T', slot: 'Y', age: 9, n: 1, version: '1.32.0' },
        { cohort: c(17), platform: 'A', tier: 'F', slot: 'F', age: 17, n: 1, version: '1.31.2' },
      ],
    },
    {
      id: id('download'),
      kind: 'download',
      at,
      day,
      count: 3,
      title: '3 new installs',
      body: '2 on iOS · 1 on Android',
      rows: [
        { cohort: day, platform: 'I', tier: 'T', slot: '?', age: 0, n: 2, version: '1.32.0' },
        { cohort: day, platform: 'A', tier: 'T', slot: '?', age: 0, n: 1 },
      ],
    },
    {
      id: id('reading'),
      kind: 'reading',
      at,
      day,
      count: 4,
      title: '4 new readings',
      body: '1 first ever · 2 Apple Watch · 1 chest strap · 1 phone camera',
      rows: [
        { cohort: c(1), platform: 'I', tier: 'T', slot: 'W', age: 1, n: 2 },
        { cohort: day, platform: 'I', tier: 'T', slot: 'B', age: 0, n: 1, first: true },
        { cohort: c(30), platform: 'A', tier: 'P', slot: 'F', age: 30, n: 1 },
      ],
    },
    {
      id: id('crash'),
      kind: 'crash',
      at,
      day,
      count: 2,
      title: 'Crash: ppg.frame',
      body: '2 phones · 2 on Android · Failed to lock HardwareBuffer for reading',
      rows: [],
    },
    {
      id: id('visitor'),
      kind: 'visitor',
      at,
      day,
      count: 5,
      title: '5 people came back',
      body: '3 on iOS · 2 on Android · 2 Pro · 3 Trial · median 6 days in',
      rows: [
        { cohort: c(6), platform: 'I', tier: 'T', slot: '?', age: 6, n: 3, version: '1.32.0' },
        { cohort: c(41), platform: 'A', tier: 'P', slot: '?', age: 41, n: 2 },
      ],
    },
  ];
}
