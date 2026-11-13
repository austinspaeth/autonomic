/**
 * Marketing screenshot driver — DEV ONLY, never reachable from a release build.
 *
 * The problem it solves: there is no tap tooling against the iOS simulator from
 * here (idb/axe will not build, Apple events are blocked), so a flow that a
 * human reaches with a thumb cannot be reached at all. This mounts an invisible
 * listener for `autonomic://?shot=<id>`, and each shot puts a fixture journal on
 * disk, navigates, and opens the card it wants — then renders nothing, so what
 * lands in the screenshot is the real screen with nothing of this on top of it.
 *
 * The registry below is also the SOURCE of `marketing/screenshots/INDEX.md`:
 * every shot carries the purpose it was taken for, so a marketing piece can be
 * matched to a still without opening the app. Add a shot here, regenerate the
 * index, re-run the capture script.
 */
import React from 'react';
import { Text, View } from 'react-native';
import * as ExpoLinking from 'expo-linking';
import { router } from 'expo-router';

import { useSheets, type SheetControls } from '../components/Sheet';
import { applyFixture, type FixtureName } from './fixtures';
import { getState } from '../store/store';
import { setDevTier } from '../store/tier';
import { setDevPreviewPaywall } from '../store/iap';
import { noteStepsSeen } from '../lib/budget/stepsMemory';
import { resetTrendMemory } from '../lib/trends/memory';
import { getCachedInsights, resetInsightsCache } from '../lib/insights/cache';
import { resetPauseMemory } from '../lib/budget/pauseMemory';
import { setCurrentKey, refreshToday, requestProgressRange, scrollJournalTo } from '../store/nav';
import { todayKey, addDays } from '../lib/dates';
import { profileCtx } from '../lib/scoring';
import { scoreSet, resolveProtocol } from '../lib/scoring/day';
import { detectDownturn } from '../lib/scoring/downturn';
import { detectStrain } from '../lib/scoring/strain';
import { buildBudget } from '../lib/budget';
import { DownturnExplain, ScoreExplain } from '../features/DaySummary';
import { SleepReportSheet } from '../features/SleepReport';
import { MilestonesSheet } from '../features/Milestones';
import { PaywallCard } from '../features/Paywall';
import { ChangeSheet } from '../features/insights/FindingSheet';
import { insightsAnchor } from '../lib/insights/anchorMemory';
import { openBudgetSheet } from '../features/budget/open';
import { openSpendSheet } from '../features/budget/SpendSheet';
import { openReadingReport, ReadingPicker } from '../features/forms';
import { HrvSetup } from '../features/hrv/Setup';
import { SourcePicker } from '../features/hrv/SourcePicker';
import { AiReportsSheet } from '../features/insights/AskAi';
import { Calendar } from '../features/Calendar';

type Open = ReturnType<typeof useSheets>['openSheet'];
interface Ctx { openSheet: Open; closeAll: () => void }

export interface Shot {
  id: string;
  /** Which section of the index it files under. */
  group: string;
  title: string;
  /** Why a marketer would reach for this still. One sentence, written for
   *  somebody choosing a shot, not for somebody maintaining this file. */
  purpose: string;
  fixture: FixtureName;
  tier?: 'free' | 'trial' | 'pro';
  /** Milliseconds to let the screen settle before the capture — charts and the
   *  Insights build are deferred, so a shot taken too early is of a skeleton. */
  settle?: number;
  run?: (c: Ctx) => void | Promise<void>;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/* ---------- helpers the shots share ---------- */

const ctxOf = () => profileCtx(getState().profile);

function budgetOf(dk: string) {
  const s = getState();
  const ctx = ctxOf();
  const isToday = dk === todayKey();
  const downturn = detectDownturn(s.days, dk, ctx, resolveProtocol(s.settings.protocol), s.customTypes);
  const strain = downturn ? null : detectStrain(s.days, dk, ctx);
  return buildBudget(s, dk, ctx, {
    now: isToday ? new Date() : new Date(`${dk}T23:59:00`),
    addDays,
    downturn: !!downturn,
    strain: strain ? strain.severity : null,
    past: !isToday,
    stepsGranted: true,
  });
}

/** The day's first HRV reading, which is what every reading-card shot wants. */
function firstReading(dk: string) {
  return (getState().days[dk]?.readings || []).find((r) => r.type === 'hrv' || r.type === 'breathHrv');
}

/* ---------- the registry ---------- */

export const SHOTS: Shot[] = [
  /* ===== Journal ===== */
  {
    id: 'journal-good',
    group: 'Journal',
    title: 'Journal — a settled green day',
    purpose: 'The default hero. Use wherever a piece needs "this is the app": the Outlook dial, the pacing strip and the day stack in one frame, on a journal two months deep.',
    fixture: 'arc',
    settle: 2600,
    run: () => { setCurrentKey(todayKey()); router.replace('/'); },
  },
  {
    id: 'journal-crash',
    group: 'Journal',
    title: 'Journal — a bad day with the downturn card up',
    purpose: 'The honesty shot. Pair with any claim that the app tells you the truth rather than gamifying you — a red dial and a warning sitting where the congratulation usually is.',
    fixture: 'arcCrash',
    settle: 2600,
    run: () => { setCurrentKey(todayKey()); router.replace('/'); },
  },
  {
    id: 'journal-entries',
    group: 'Journal',
    title: 'Journal — the logged sections',
    purpose: 'What a tracked day actually holds: readings, activities, meds, symptoms, water, digestion. Use for "one place for all of it" and for any logging-focused piece.',
    fixture: 'arc',
    settle: 2600,
    run: async () => { setCurrentKey(todayKey()); router.replace('/'); await wait(1800); scrollJournalTo(1250); },
  },
  {
    id: 'journal-fresh',
    group: 'Journal',
    title: 'Journal — day one, before any reading',
    purpose: 'The new-user frame: no score is shown until there is a first reading. Use for onboarding pieces and for the "it does not make things up" angle.',
    fixture: 'fresh',
    settle: 2200,
    run: () => { setCurrentKey(todayKey()); router.replace('/'); },
  },
  {
    id: 'journal-early',
    group: 'Journal',
    title: 'Journal — ten days in',
    purpose: 'The realistic middle: enough data to grade a day, not enough to conclude anything. Good for "week one" and expectation-setting content.',
    fixture: 'early',
    settle: 2600,
    run: () => { setCurrentKey(todayKey()); router.replace('/'); },
  },

  /* ===== The score ===== */
  {
    id: 'score-explain',
    group: 'The score',
    title: 'What powers this — the score breakdown',
    purpose: 'Proof the number is computed, not vibes: every component with its weight and its own grade. The single best answer to "where does that score come from".',
    fixture: 'arc',
    settle: 2000,
    run: async ({ openSheet }) => {
      router.replace('/');
      await wait(1400);
      const dk = todayKey();
      const s = getState();
      const d = s.days[dk];
      const all = scoreSet(d?.readings || [], d, dk, s.days, ctxOf());
      openSheet(() => <ScoreExplain all={all} dk={dk} />);
    },
  },
  {
    id: 'downturn-sheet',
    group: 'The score',
    title: 'Downturn explained — why it thinks you are sliding',
    purpose: 'The crash-warning story. Shows the named causes and the rest advice, which is the part that separates this from a step counter.',
    fixture: 'arcCrash',
    settle: 2000,
    run: async ({ openSheet }) => {
      router.replace('/');
      await wait(1400);
      const dk = todayKey();
      const s = getState();
      const w = detectDownturn(s.days, dk, ctxOf(), resolveProtocol(s.settings.protocol), s.customTypes);
      if (w) openSheet(() => <DownturnExplain w={w} dk={dk} />);
    },
  },

  /* ===== Pacing ===== */
  {
    id: 'pacing-sheet',
    group: 'Pacing',
    title: 'Pacing budget — the envelope',
    purpose: 'The flagship differentiator. How much today can absorb, in effort minutes, with the inputs that narrowed it and how often the estimate has held.',
    fixture: 'arcAhead',
    settle: 3400,
    run: async ({ openSheet }) => {
      router.replace('/');
      // NOTE: this sheet leads with a "turn on pacing alerts" ask whenever
      // notification permission is missing, which on a fresh simulator it
      // always is. It cannot be granted from the CLI — `simctl privacy grant
      // notifications` answers "Operation not permitted" on iOS 26.5, and
      // `grant all` does not cover it — and requesting it from here raises a
      // system alert that nothing in this harness can tap, which then sits on
      // top of the shot. So the ask is left standing. To lose it, tap Allow
      // once by hand on the shots simulator; the grant sticks and every later
      // run of this shot leads with the budget instead.
      await wait(1600);
      const dk = todayKey();
      openBudgetSheet(openSheet, dk, budgetOf(dk));
    },
  },
  {
    id: 'pacing-ahead',
    group: 'Pacing',
    title: 'Journal — ahead of pace',
    purpose: 'The gold strip and the sentence that makes the feature click: "at this pace the budget runs out around 8:29pm". The single clearest frame of what pacing means.',
    fixture: 'arcAhead',
    settle: 2600,
    run: () => { setCurrentKey(todayKey()); router.replace('/'); },
  },
  {
    id: 'pacing-over',
    group: 'Pacing',
    title: 'Journal — over budget',
    purpose: 'The red strip with the ember. Use for "it tells you before you pay for it" and anything about post-exertional crashes.',
    fixture: 'arcOver',
    settle: 2600,
    run: () => { setCurrentKey(todayKey()); router.replace('/'); },
  },
  {
    id: 'pacing-spend',
    group: 'Pacing',
    title: 'Where the day went — the spend drill-in',
    purpose: 'Every minute accounted for: upright time, minutes above your own exertion line, recovery credit. The receipt behind the bar.',
    fixture: 'arcOver',
    settle: 2400,
    run: async ({ openSheet }) => {
      router.replace('/');
      await wait(1500);
      const dk = todayKey();
      const b = budgetOf(dk);
      const row = b.burn?.rows?.[0];
      if (row) openSpendSheet(openSheet, dk, b, row);
      else openBudgetSheet(openSheet, dk, b);
    },
  },

  /* ===== Readings ===== */
  {
    id: 'reading-card',
    group: 'Readings',
    title: 'An HRV reading, graded',
    purpose: 'A single measurement with its band strip and its grade against this person\'s own age and sex. Use whenever a piece needs "what you get out of a reading".',
    fixture: 'arc',
    settle: 2000,
    run: async ({ openSheet }) => {
      router.replace('/');
      await wait(1400);
      const dk = todayKey();
      const r = firstReading(dk);
      if (r) openReadingReport(openSheet, r, dk);
    },
  },
  {
    id: 'sleep-report',
    group: 'Readings',
    title: 'Sleep report',
    purpose: 'The night in full: grade, nocturnal dip, stages, schedule drift. Strong standalone piece for sleep-led content.',
    fixture: 'arc',
    settle: 2400,
    run: async ({ openSheet }) => {
      router.replace('/');
      await wait(1400);
      openSheet(() => <SleepReportSheet dk={todayKey()} />);
    },
  },
  {
    id: 'milestones',
    group: 'Readings',
    title: 'Milestones',
    purpose: 'Progress that is not a streak badge: the recovery markers this person has actually reached. Good for motivation-angle content.',
    fixture: 'arc',
    settle: 2000,
    run: async ({ openSheet }) => {
      router.replace('/');
      await wait(1300);
      openSheet(() => <MilestonesSheet />);
    },
  },

  /* ===== Progress ===== */
  // NOTE on the range: these ask for the DAY view, not Month. `mode` is the
  // GROUPING, so a Month view of a two-month journal is two or three points on
  // a twelve-month axis — technically correct and useless as a picture. Day
  // plots every logged day, which is what the recovery arc actually looks like.
  {
    id: 'progress-arc',
    group: 'Progress',
    title: 'Progress — the recovery arc',
    purpose: 'The clearest single image of "this is getting better": every scored day across two months, crash days and all. The chart most pieces will want.',
    fixture: 'arc',
    settle: 4200,
    run: async () => { router.replace('/analysis'); await wait(900); requestProgressRange('day', 'outlook'); },
  },
  {
    id: 'progress-hrv',
    group: 'Progress',
    title: 'Progress — HRV with grade zones',
    purpose: 'RMSSD day by day against graded bands. For HRV-literate audiences, and for any piece contrasting this with a generic wearable chart.',
    fixture: 'arc',
    settle: 4200,
    run: async () => { router.replace('/analysis'); await wait(900); requestProgressRange('day', 'hrv'); },
  },
  {
    id: 'progress-week',
    group: 'Progress',
    title: 'Progress — weekly averages',
    purpose: 'The same arc smoothed into weeks, which is the frame that reads best in motion. Good for a scroll-through or a before/after cut.',
    fixture: 'arc',
    settle: 4200,
    run: async () => { router.replace('/analysis'); await wait(900); requestProgressRange('week', 'outlook'); },
  },
  {
    id: 'progress-locked',
    group: 'Progress',
    title: 'Progress — the free-tier mask',
    purpose: 'The paywall shot that is not a price list: a real document built from real data, masked, with the upgrade card over it. For upgrade prompts and store listings.',
    fixture: 'arc',
    tier: 'free',
    settle: 4200,
    run: async () => { router.replace('/analysis'); await wait(900); requestProgressRange('month', 'outlook'); },
  },

  /* ===== Insights ===== */
  {
    id: 'insights',
    group: 'Insights',
    title: 'Insights — the full sweep',
    purpose: 'The differentiator nobody else ships: what is linked to what, in this person\'s own data, with the statistics done properly. Lead shot for any "it finds your patterns" piece.',
    fixture: 'arc',
    settle: 6000,
    run: async () => { router.replace('/insights'); },
  },
  {
    id: 'insights-change',
    group: 'Insights',
    title: 'Insights — a finding opened',
    purpose: 'The evidence behind the headline: the two windows, the split where the supplement started, and the days it was taken shaded on the chart. This is the shot that answers "how would it even know that".',
    fixture: 'arc',
    settle: 6000,
    run: async ({ openSheet }) => {
      router.replace('/insights');
      await wait(3500);
      const rep = getCachedInsights(getState(), todayKey(), false, insightsAnchor());
      const change = rep?.change;
      if (!change) return;
      openSheet(() => <ChangeSheet change={change} series={rep?.detail?.[change.id] || null} />);
    },
  },
  {
    id: 'insights-empty',
    group: 'Insights',
    title: 'Insights — 0 of 14 days',
    purpose: 'What a new user sees: no demo data, no fabricated finding, a countdown and what to log. Use for trust-angle content and honest onboarding.',
    fixture: 'fresh',
    settle: 3200,
    run: async () => { router.replace('/insights'); },
  },

  {
    id: 'reading-picker',
    group: 'Readings',
    title: 'What do you want to log?',
    purpose: 'The logging menu, with live HRV capture sitting beside blood pressure and a stand test. Use for "it is not just another HRV app".',
    fixture: 'arc',
    settle: 2000,
    run: async ({ openSheet }) => {
      router.replace('/');
      await wait(1300);
      openSheet(() => <ReadingPicker isToday onLive={() => undefined} onBaseline={() => undefined} onPick={() => undefined} />);
    },
  },
  {
    id: 'hrv-setup',
    group: 'Readings',
    title: 'Before a paced reading',
    purpose: 'What a training reading is and what it is for, with the breathing pace and the sensor in hand. Good for explaining paced breathing to people who have never heard of it.',
    fixture: 'arc',
    settle: 2200,
    run: async ({ openSheet }) => {
      router.replace('/');
      await wait(1300);
      openSheet((c: SheetControls) => <HrvSetup kind="breath" controls={c} />);
    },
  },
  {
    id: 'hrv-sensors',
    group: 'Readings',
    title: 'Four ways to measure',
    purpose: 'Apple Watch, chest strap, phone camera, Garmin. The answer to "do I need to buy anything" — the phone camera row is the one to point at.',
    fixture: 'arc',
    settle: 2200,
    run: async ({ openSheet }) => {
      router.replace('/');
      await wait(1300);
      openSheet((c: SheetControls) => <SourcePicker value="camera" onPick={() => undefined} controls={c} />);
    },
  },
  {
    id: 'calendar',
    group: 'Readings',
    title: 'The month, graded',
    purpose: 'Every day coloured by its own score. Reads at a glance and works as a thumbnail — good for a cold open or a cut to "two months later".',
    fixture: 'arc',
    settle: 2400,
    run: async ({ openSheet }) => {
      router.replace('/');
      await wait(1300);
      openSheet((c: SheetControls) => <Calendar current={todayKey()} onPick={() => undefined} controls={c} />);
    },
  },
  {
    id: 'reports',
    group: 'Insights',
    title: 'AI reports',
    purpose: 'Twelve deep-dive reports built from the journal, including a doctor summary. For "bring this to your appointment" content.',
    fixture: 'arc',
    settle: 6000,
    run: async ({ openSheet }) => {
      router.replace('/insights');
      await wait(3000);
      openSheet((c: SheetControls) => <AiReportsSheet controls={c} />, { fitContent: true });
    },
  },

  /* ===== Selling ===== */
  {
    id: 'journal-free',
    group: 'Selling',
    title: 'Journal — the free tier',
    purpose: 'What a free user sees: the score, the day and the Trend card all still work, with pacing offered rather than taken away. The honest version of a freemium frame.',
    fixture: 'arc',
    tier: 'free',
    settle: 2800,
    run: () => { setCurrentKey(todayKey()); router.replace('/'); },
  },
  {
    id: 'paywall',
    group: 'Selling',
    title: 'Paywall',
    purpose: 'The plans card as a user meets it, raised by tapping something locked. For store listings and upgrade pieces.',
    fixture: 'arc',
    tier: 'free',
    settle: 2400,
    run: async ({ openSheet }) => {
      router.replace('/');
      await wait(1400);
      openSheet((c: SheetControls) => <PaywallCard controls={c} />);
    },
  },
];

export const SHOT_IDS = SHOTS.map((s) => s.id);

/* ---------- the driver ---------- */

export function ShotDriver() {
  const { openSheet, closeAll } = useSheets();
  // A shot that fails has to say so ON SCREEN: there is no console to read from
  // here (Hermes forwards console to Metro, which belongs to another session),
  // and a driver that silently does nothing is indistinguishable from a deep
  // link that never arrived.
  const [err, setErr] = React.useState<string | null>(null);
  React.useEffect(() => {
    const handle = async (url: string | null) => {
      if (!url) return;
      const q = ExpoLinking.parse(url).queryParams;
      const id = typeof q?.shot === 'string' ? q.shot : null;
      if (!id) return;
      const shot = SHOTS.find((s) => s.id === id);
      if (!shot) { setErr(`no such shot: ${id}`); return; }
      try {
        setErr(null);
        closeAll();
        // Everything below is a CLAIM about the journal that is about to be
        // replaced, held in the flags MMKV, which a fixture import does not
        // touch. Leaving them is how a crash-day shot came to carry the
        // previous shot's "up 45 points since last month!" pinned from a
        // journal it no longer holds — the Trend card is deliberately pinned
        // for the rest of its journal day, so only an explicit reset clears
        // it. Same set `clearAllData` resets, for the same reason.
        resetInsightsCache();
        resetPauseMemory();
        scrollJournalTo(0);
        // The dev build's own bypass reports `isPro`, and PaywallCard closes
        // itself on that, so a free-tier shot needs both switches.
        setDevPreviewPaywall(shot.tier === 'free');
        setDevTier(shot.tier || 'pro');
        applyFixture(shot.fixture);
        // AFTER the import, and again on the next tick. A claim is pinned for
        // the rest of its journal day and renders from its own memory alone,
        // so a reset before the new journal lands is re-pinned by the render
        // that happens in between — which is how a FRESH install came to show
        // "your daily scores are up 45 points since last month".
        resetTrendMemory();
        setTimeout(resetTrendMemory, 0);
        // The fixture days genuinely carry step counts, so "steps have reached
        // this install" is true and the strip's "Todo: Connect steps" is not
        // the state to photograph. This is the same flag a real read sets.
        noteStepsSeen();
        refreshToday();
        setCurrentKey(todayKey());
        await wait(500);
        await shot.run?.({ openSheet, closeAll });
      } catch (e) {
        setErr(`${shot.id}: ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`);
      }
    };
    const sub = ExpoLinking.addEventListener('url', (e) => void handle(e.url));
    // A cold launch carries its URL here instead, which is how a shot is taken
    // against a freshly started app.
    void ExpoLinking.getInitialURL().then((u) => { if (u && u.includes('shot=')) void handle(u); });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!err) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 8, right: 8, bottom: 90, backgroundColor: '#b00', padding: 10, borderRadius: 8 }}>
      <Text style={{ color: '#fff', fontSize: 12 }}>SHOT ERROR {err}</Text>
    </View>
  );
}
