# Build prompt — `src/lib/upsell/`: one gate for every app-initiated upgrade prompt

You are working in the **Autonomic Journal** repo. Read `CLAUDE.md` at the repo root first —
its conventions (store mutation rules, MMKV instances, pure-core/stateful-shell split) are
binding, not suggestions. All app code lives in `mobile/`.

## The problem

The app is freemium (`src/store/tier.ts` → `'pro' | 'trial' | 'free'`). Locked surfaces call
`usePaywall()` to raise `PaywallCard`. That part works.

What doesn't exist is any **policy** about when the app may raise an upgrade offer *on its own
initiative*. Today that decision is made independently inside each component, so "is the app
being pushy right now?" is an emergent property no code can answer, no test can pin, and no
single edit can tune.

We already solved this exact problem once, for the store review prompt. `src/lib/review/` is
the model to copy:

- `src/lib/review/eligibility.ts` — **pure**. No MMKV, no store, no expo. Journal + `memory` +
  `nowMs` + session flags in, a verdict out. Fully unit-tested.
- `src/lib/review/index.ts` — the stateful shell. Owns the flags MMKV, calls `getState()`,
  performs the ask.

Build the mirror of that for upsells.

## The distinction that matters most

There are two kinds of upsell surface and they need **opposite** treatment. Getting this
boundary right is most of the task.

**Reactive** — the user tapped a locked thing and the paywall came up. These must **never** be
rate-limited or suppressed. The user asked. Gating them breaks the app: someone taps "Month"
and nothing happens.

Leave every one of these exactly as it is:

| Call site | Surface |
| --- | --- |
| `app/(tabs)/analysis.tsx:445` | locked Week/Month/Year segments (`onLockedPress`) |
| `app/(tabs)/insights.tsx:120,156` | locked range segments + report cards |
| `src/features/JournalSections.tsx:43` | HRV capture button past the daily allowance |
| `src/features/forms.tsx:446,508,587` | HRV / POTS capture gates |
| `src/components/summary.tsx:662` | `InsightButton` on reading summaries |
| `src/features/Settings.tsx:214` | the "Upgrade to Pro" row (user-initiated) |

**Proactive** — the app raises an offer unprompted. Today there is exactly **one**:
`ProUpsellCard`, rendered at `src/features/DaySummary.tsx:206` and defined around line 428. It
sits permanently in the day summary of every free user, expanded by default, with a `LOCKED`
badge and four generic bullets.

That single card is what this module governs now. The reason to build the module for one
consumer is that five more proactive surfaces are planned (see
`marketing/PRO_GROWTH_IDEAS.md` §2), and adding them without a central gate is how an app
becomes obnoxious.

**Passive state is neither.** A greyed-out segment or a faded chart is honest UI. It is always
visible, never counted, never gated.

## What to build

### 1. `mobile/src/lib/upsell/eligibility.ts` — pure

Mirror the structure, naming, and comment density of `src/lib/review/eligibility.ts`.

```ts
export type UpsellSurface =
  | 'history-horizon'   // 15+ days logged; the free Day view clips at 14 (analysis/buckets.ts:16)
  | 'month-milestone'   // 30 engaged days
  | 'crash-pattern'     // Nth crash day logged
  | 'streak-milestone'  // protocol streak milestone reached
  | 'improvement'       // measurable 30-day upturn
  | 'second-trial';     // the earned second-trial gift

export interface SurfaceMemory {
  shown: number;
  dismissed: number;
  ignored: number;           // shown, then the session ended with no tap
  lastShownAtMs?: number;
  retiredUntilMs?: number;
}

export interface UpsellMemory {
  lastPromptAtMs?: number | null;
  perSurface: Partial<Record<UpsellSurface, SurfaceMemory>>;
}

export interface UpsellInput {
  days: DaysMap;
  dk?: string;                      // day being evaluated; defaults to today
  tier: Tier;                       // 'pro' and 'trial' are never prompted
  ctx?: ScoreContext;
  protocol?: Protocol;
  custom?: CustomTypes;
  memory: UpsellMemory;
  nowMs: number;
  crashAlertFiredToday?: boolean;
  reviewAskedThisSession?: boolean; // see §4 — this flag does not exist yet
  sheetOpen?: boolean;              // never raise a card behind an open sheet
}

export type UpsellVerdict =
  | { ok: true; surface: UpsellSurface; trigger: string }
  | { ok: false; reason: string };

export function nextUpsell(input: UpsellInput): UpsellVerdict;
```

Two required properties of that signature:

**It returns a winning surface, not a boolean.** Exactly one surface can be live at a time, and
that is guaranteed by the return type rather than by every component remembering to check. A
boolean gate would let three surfaces pass simultaneously — the bug we have today.

**`trigger` is a short human-readable string** describing why this is the moment
(`"31 days logged"`, `"6 crash days this month"`). The function already computed it to pick a
surface; returning it means the card renders personalized copy without re-deriving anything,
and the copy can never drift from the condition that fired it.

### 2. Rules

Suppression first, in this order, each returning its own `reason` string (the review module
does exactly this and it makes failures debuggable):

1. `tier !== 'free'` → `'not-free'`
2. `sheetOpen` → `'sheet-open'`
3. `crashAlertFiredToday` → `'crash-alert-today'`
4. `reviewAskedThisSession` → `'review-this-session'`
5. `detectDownturn(days, dk, ctx, protocol, custom)` truthy → `'downturn'`
6. `nowMs - memory.lastPromptAtMs < MIN_DAYS_BETWEEN_PROMPTS * DAY_MS` → `'prompted-recently'`

Then pick the highest-priority surface whose trigger condition holds and which is not retired
(`retiredUntilMs` in the future). Priority order as listed in the `UpsellSurface` union.

Constants, exported and named like the review module's:

```ts
export const MIN_DAYS_BETWEEN_PROMPTS = 10;
export const RETIRE_DAYS = 30;
export const DISMISSALS_TO_RETIRE = 2;
export const IGNORES_TO_RETIRE = 3;
```

`MIN_DAYS_BETWEEN_PROMPTS` is 10 where the review module's `MIN_DAYS_BETWEEN_ASKS` is 120,
and the difference is deliberate: the review ask is scarce because iOS allows three a year and
silently swallows the rest, so a wasted ask is a destroyed asset. Upsells have no OS quota —
the constraint is the user's patience, not an allowance. Say so in the comment.

**Retirement counts ignores, not just dismissals.** Most people never press ✕; they scroll
past. Counting only explicit dismissals means the rule almost never fires for exactly the users
who most clearly don't want the card. Two dismissals **or** three ignores retires a surface for
30 days.

Reuse, don't reimplement: `engagedDayCount` is already exported from
`src/lib/review/eligibility.ts`, and `detectDownturn` / `detectUpturn` live in
`src/lib/scoring/`.

### 3. `mobile/src/lib/upsell/index.ts` — the stateful shell

Mirror `src/lib/review/index.ts` closely, including its MMKV degradation pattern (in-memory
`Map` fallback so jest and web don't throw at import).

- Memory lives in the **plaintext `autonomic.flags` MMKV**, alongside the trial stamp, the
  review stamps and the health declines. Same rationale, and state it in the header comment:
  it isn't health data, it must never ride export/import, and it should survive
  "Erase journal".
- Export `upsellVerdict()` (the review module exports `reviewVerdict()` for the same reason —
  a dev build can log why a surface is or isn't showing without duplicating the wiring).
- Export `noteUpsellShown(surface)`, `noteUpsellDismissed(surface)`, `noteUpsellTapped(surface)`.
- A `FORCE_UPSELL: UpsellSurface | null = null` dev escape hatch, mirroring
  `FORCE_REVIEW_PROMPT`. Leave it null in committed code.
- **Stamp `lastPromptSurface` in flags whenever a surface is shown.** Without analytics this is
  the only conversion signal that exists: when a purchase lands, we know what preceded it.
  Surface it in `src/lib/diagnostics/collectApp.ts`, which already carries no health data and
  no identifying information — keep it that way (a surface name only, never a count of the
  user's entries).

### 4. Make session awareness bidirectional

`src/lib/review/index.ts` already has `notePaywallSeen()`, so the review gate knows not to ask
for a favour in a session where the user hit a subscription wall. There is no reverse.

Add `noteReviewAsked()` to the review shell, and feed it into `UpsellInput.reviewAskedThisSession`.

This matters concretely: the `'improvement'` surface fires on a measurably good day, and
`detectUpturn` — the review prompt's precondition — fires on the same day. Both systems want
the same scarce resource, the user's goodwill on a day they feel better. **The review prompt
must win** (it is OS-quota-limited and far rarer). Today the two cannot see each other, so a
free user on a good day can get both.

### 5. Rework `ProUpsellCard`

In `src/features/DaySummary.tsx`:

- Render it only when `nextUpsell(...)` returns `ok: true`, not on `tier === 'free'`.
- Replace the four static bullets with a **single personalized line** built from the returned
  `trigger` — "31 days logged — your month view is ready", "6 crash days this month. See what
  they had in common."
- Drop the `LOCKED` badge. It frames the app as broken rather than the offer as available.
- Collapse by default rather than expanded.
- Wire the ✕ to `noteUpsellDismissed(surface)` and the CTA to `noteUpsellTapped(surface)`. An
  ✕ that does nothing is worse than no ✕.

Keep the existing visual language (`useAccordion`, palette tokens, `radius.card`) — this is a
behaviour change, not a redesign.

### 6. Tests — `mobile/src/lib/upsell/__tests__/eligibility.test.ts`

Follow `src/lib/review/__tests__/` in style. The policy is the product here, so pin it:

- every suppression rule fires and returns its own `reason`
- `'pro'` and `'trial'` are never prompted
- a crash-alert day and an active downturn suppress everything
- two prompts inside 10 days is impossible; day 11 is allowed
- 2 dismissals retires a surface for exactly 30 days; 3 ignores does the same
- a retired surface falls through to the next-priority one rather than blocking all output
- exactly one surface is ever returned
- `reviewAskedThisSession` suppresses `'improvement'`

## Non-goals — do not do these

- Do **not** gate, delay, or suppress any reactive paywall. Every `usePaywall()` call site in
  the table above stays exactly as it is.
- Do **not** touch `src/store/iap.ts`, `src/store/tier.ts`, or `PaywallCard`.
- Do **not** add analytics, network calls, or any new MMKV instance. Reuse `autonomic.flags`.
- Do **not** write health data, journal counts, or anything identifying into the flags MMKV or
  the diagnostics dump.
- Do **not** build the five unbuilt surfaces. Define the enum, implement `'history-horizon'`
  and `'month-milestone'` (both computable from `days` today), and leave the rest returning
  no trigger with a `// TODO(surface)` comment.

## Acceptance

- `npm test` and `npm run lint` pass in `mobile/`.
- `eligibility.ts` imports nothing stateful — no `react-native-mmkv`, no `../../store/*`, no
  `expo-*`. If it does, the split has failed.
- A free user with 20 days of data sees at most one proactive card, and never within 10 days of
  the last one.
- Dismissing that card twice makes it stay gone for 30 days.
- Tapping a locked Week segment still opens the paywall instantly, every time, forever.
