/**
 * App-initiated upgrade offers — stateful shell around ./eligibility.
 *
 * Only PROACTIVE surfaces come through here: the app deciding, unprompted, to
 * put an offer in front of a free user. Reactive paywalls (the user tapped a
 * locked thing) go straight to usePaywall and are never gated, delayed or
 * counted — see the header of ./eligibility for why that boundary is the whole
 * point of the module.
 *
 * Memory lives in the plaintext flags MMKV next to the trial stamp, the review
 * stamps and the health-import declines: it isn't health data, must never ride
 * export/import, and should survive "Erase journal". Nothing written here
 * describes the journal — a surface name, three counters and two timestamps.
 *
 * "Ignored" is resolved at process start rather than on a timer: a surface that
 * was shown in the previous session and never tapped or dismissed is an ignore,
 * and the honest definition of "the session ended" is that the app is starting
 * again.
 */
import { MMKV } from 'react-native-mmkv';
import { todayKey } from '../dates';
import { resolveProtocol } from '../scoring/day';
import { getState } from '../../store/store';
import { getTier } from '../../store/tier';
import { reviewAskedThisSession } from '../review';
import {
  SURFACE_ORDER, nextUpsell, retireUntil,
  type UpsellMemory, type UpsellSurface, type UpsellVerdict, type SurfaceMemory,
} from './eligibility';

export {
  nextUpsell, retireUntil, SURFACE_ORDER,
  MIN_DAYS_BETWEEN_PROMPTS, RETIRE_DAYS, DISMISSALS_TO_RETIRE, IGNORES_TO_RETIRE,
  HISTORY_HORIZON_DAYS, MONTH_MILESTONE_DAYS,
} from './eligibility';
export type { UpsellMemory, UpsellSurface, UpsellVerdict, SurfaceMemory, UpsellInput } from './eligibility';

/** TEMP (dev only): force a surface to show regardless of every rule, to check
 *  its copy and placement in a dev build. Leave null in committed code. */
const FORCE_UPSELL: UpsellSurface | null = null;

const FLAGS_ID = 'autonomic.flags';
const KEY_MEMORY = 'upsellMemory';           // JSON UpsellMemory
const KEY_PENDING = 'upsellPending';         // surface shown in the live session
/** The surface shown most recently. Without analytics this is the only
 *  conversion signal that exists: when a purchase lands, this says what
 *  preceded it. A surface name only — never a count of the user's entries. */
const KEY_LAST_SURFACE = 'upsellLastSurface';

/* MMKV can be unavailable (jest, web); degrade to an in-memory map so the
 * module still works for one session rather than throwing at import. */
let kv: MMKV | null | undefined;
const mem = new Map<string, string>();
function store(): MMKV | null {
  if (kv !== undefined) return kv;
  try { kv = new MMKV({ id: FLAGS_ID }); } catch { kv = null; }
  return kv;
}
function readFlag(key: string): string | undefined {
  const s = store();
  if (!s) return mem.get(key);
  try { return s.getString(key) ?? mem.get(key); } catch { return mem.get(key); }
}
function writeFlag(key: string, value: string): void {
  mem.set(key, value);
  try { store()?.set(key, value); } catch { /* in-memory only this session */ }
}
function clearFlag(key: string): void {
  mem.delete(key);
  try { store()?.delete(key); } catch { /* in-memory only this session */ }
}

const blank = (): SurfaceMemory => ({ shown: 0, dismissed: 0, ignored: 0 });

export function upsellMemory(): UpsellMemory {
  const raw = readFlag(KEY_MEMORY);
  if (!raw) return { lastPromptAtMs: null, perSurface: {} };
  try {
    const parsed = JSON.parse(raw) as UpsellMemory;
    return { lastPromptAtMs: parsed.lastPromptAtMs ?? null, perSurface: parsed.perSurface ?? {} };
  } catch {
    return { lastPromptAtMs: null, perSurface: {} };
  }
}

/** Read-modify-write one surface's record, re-deriving its retirement stamp. */
function mutate(surface: UpsellSurface, fn: (m: SurfaceMemory) => void, stampPrompt = false): void {
  const memory = upsellMemory();
  const m = { ...(memory.perSurface[surface] ?? blank()) };
  fn(m);
  const until = retireUntil(m);
  if (until) m.retiredUntilMs = Math.max(m.retiredUntilMs ?? 0, until);
  memory.perSurface = { ...memory.perSurface, [surface]: m };
  if (stampPrompt) memory.lastPromptAtMs = Date.now();
  writeFlag(KEY_MEMORY, JSON.stringify(memory));
}

/** The last surface put in front of this user, for the diagnostics dump. */
export function lastUpsellSurface(): UpsellSurface | null {
  return (readFlag(KEY_LAST_SURFACE) as UpsellSurface | undefined) ?? null;
}

/**
 * A surface reached the screen. Stamps the global pacing clock, so the next
 * offer of any kind is MIN_DAYS_BETWEEN_PROMPTS away, and leaves the surface
 * pending — an ignore unless a tap or a ✕ follows.
 */
export function noteUpsellShown(surface: UpsellSurface): void {
  mutate(surface, (m) => { m.shown++; m.lastShownAtMs = Date.now(); }, true);
  writeFlag(KEY_LAST_SURFACE, surface);
  writeFlag(KEY_PENDING, surface);
}

/**
 * The half-off annual offer opened its window (./annual — it has its own
 * lifecycle and isn't one of the rotating surfaces). Stamp only the global
 * pacing clock, so once the 24 hours are up the generic upsell still keeps its
 * MIN_DAYS_BETWEEN_PROMPTS distance instead of arriving the same afternoon.
 */
export function noteAnnualOfferPacing(): void {
  const memory = upsellMemory();
  memory.lastPromptAtMs = Date.now();
  writeFlag(KEY_MEMORY, JSON.stringify(memory));
}

export function noteUpsellDismissed(surface: UpsellSurface): void {
  clearFlag(KEY_PENDING);
  mutate(surface, (m) => { m.dismissed++; });
}

/** The CTA was pressed — the offer landed, whatever the purchase does next. */
export function noteUpsellTapped(surface: UpsellSurface): void {
  clearFlag(KEY_PENDING);
  mutate(surface, (m) => { m.ignored = 0; });
}

/** Shown last session, never answered: an ignore. Run once, at import. */
function resolvePendingIgnore(): void {
  const pending = readFlag(KEY_PENDING) as UpsellSurface | undefined;
  if (!pending || !SURFACE_ORDER.includes(pending)) { clearFlag(KEY_PENDING); return; }
  clearFlag(KEY_PENDING);
  mutate(pending, (m) => { m.ignored++; });
}
resolvePendingIgnore();

/** The verdict for right now — exported so a dev build can log why a surface is
 *  (not) showing without duplicating the wiring. */
export function upsellVerdict(sheetOpen = false): UpsellVerdict {
  // A representative trigger phrase rather than the word "forced": the point of
  // the pin is to preview the card's real copy, and the trigger is half of it.
  if (__DEV__ && FORCE_UPSELL) return { ok: true, surface: FORCE_UPSELL, trigger: '31 days logged' };
  const s = getState();
  const dk = todayKey();
  return nextUpsell({
    days: s.days,
    dk,
    tier: getTier(),
    ctx: { sex: s.profile.sex, height: s.profile.height },
    protocol: resolveProtocol(s.settings.protocol),
    custom: s.customTypes,
    memory: upsellMemory(),
    nowMs: Date.now(),
    crashAlertFiredToday: s.settings.crashAlert?.lastFired === dk,
    reviewAskedThisSession: reviewAskedThisSession(),
    sheetOpen,
  });
}
