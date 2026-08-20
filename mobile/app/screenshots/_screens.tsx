/**
 * Faithful, static recreations of the real app screens, each authored at a
 * fixed logical iPhone size (DESIGN_W × DESIGN_H) so the device frame can scale
 * one uniformly to any simulator. These mirror the production screens pixel for
 * pixel — same geometry, type, and colour — but frozen in an ideal state.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { parsePattern } from '../../src/features/hrv/BreathingViz';
import { SessionCard } from '../../src/features/hrv/Session';
import { __devMockSession } from '../../src/features/hrv/sessionStore';
import { Button, Segmented } from '../../src/components/ui';
import { BrandMark, Icon } from '../../src/components/Icon';
import { ReadingSummary } from '../../src/components/summary';
import { ScoreExplain, DaySummary } from '../../src/features/DaySummary';
import { ProtocolEditor } from '../../src/features/ProtocolEditor';
import { JournalSections } from '../../src/features/JournalSections';
import { HrvProgress, HrvFilterLinks } from '../../src/features/HrvProgress';
import { Onboarding } from '../../src/features/Onboarding';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { getState, blankDay, __devSwapState } from '../../src/store/store';
import { MED_TYPES } from '../../src/lib/registry';
import { addDays, todayKey } from '../../src/lib/dates';
import { scoreSet, scoreCat, OUTLOOK_GUIDE } from '../../src/lib/scoring/day';
import type { Entry, Protocol, AppState } from '../../src/lib/types';
import { radius, usePalette } from '../../src/theme';

/** Logical iPhone canvas every screen is drawn at (points). */
export const DESIGN_W = 393;
export const DESIGN_H = 852;

/** A minimal iOS status bar (Apple's 9:41), so the framed screen reads as a
 *  real device capture rather than a floating panel. */
function StatusBar() {
  return (
    <View style={{ height: 54, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 30, paddingBottom: 10 }}>
      <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: 0.2 }}>9:41</Text>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 7 }}>
        {/* signal bars */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>
          {[4, 6, 8, 10].map((h, i) => (
            <View key={i} style={{ width: 3, height: h, borderRadius: 1, backgroundColor: '#fff' }} />
          ))}
        </View>
        {/* battery */}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: 22, height: 11, borderRadius: 3, borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)', padding: 1.5 }}>
            <View style={{ flex: 1, borderRadius: 1.5, backgroundColor: '#fff' }} />
          </View>
          <View style={{ width: 1.5, height: 4, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.55)', marginLeft: 1 }} />
        </View>
      </View>
    </View>
  );
}

/* ---------- Scene 2 · the live reading, as the app really draws it ---------- */

/**
 * A paced chest-strap reading, mid-capture. Nothing here is a recreation: the
 * card is the app's own `SessionCard` over a fabricated store snapshot
 * (`__devMockSession`), inside a stand-in for the sheet it normally lives in —
 * so every measurement, tile and colour is the shipping design, and a redesign
 * of the reading redraws this scene for free.
 *
 * The one thing a live card cannot give a screenshot is a fixed frame: the
 * rings are paced off the wall clock, so a capture would land wherever the
 * breath happened to be. `frozenBreath` pins them just below the inhale peak.
 */
const MOCK_HR = 72;
const MOCK_SDNN = 38;
const MOCK_ELAPSED = 133; // 2:47 left of a five-minute reading

/** A paced trace: RR lengthens through the exhale and shortens through the
 *  inhale, which is exactly what the 4/6 rings are asking for — one full
 *  respiratory wave per breath, plus per-beat scatter so it reads as a
 *  measurement rather than a sine wave. Deterministic. */
function mockRr(n: number): number[] {
  const base = 60000 / MOCK_HR; // 833 ms at 72 bpm
  const rnd = (i: number) => { const x = Math.sin(i * 91.7 + 4.3) * 43758.5453; return x - Math.floor(x); };
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const beatsPerBreath = 12;           // 10 s breath at ~72 bpm
    const wave = Math.sin((i / beatsPerBreath) * 2 * Math.PI) * 62;
    const drift = Math.sin(i * 0.11 + 1.2) * 9;
    out.push(Math.round(base + wave + drift + (rnd(i) - 0.5) * 14));
  }
  return out;
}

/** Heart rate settling as the reading goes on, and SDNN climbing toward 38 —
 *  the shape a paced reading actually produces. */
function mockHrTrace(n: number): number[] {
  return Array.from({ length: n }, (_, i) => Math.round((78 - (i / n) * 6 + Math.sin(i * 0.32) * 1.4) * 10) / 10);
}
function mockSdnnTrace(n: number): number[] {
  return Array.from({ length: n }, (_, i) => Math.round((26 + (i / n) * 12 + Math.sin(i * 0.24 + 1) * 1.6) * 10) / 10);
}

export function BreathSessionScreen() {
  const p = usePalette();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    __devMockSession({
      status: 'running',
      config: { kind: 'breath', style: '4/6', source: 'polar', period: 'Morning' },
      pattern: parsePattern('4/6'),
      durationSec: 300,
      elapsed: MOCK_ELAPSED,
      connected: true,
      hr: MOCK_HR,
      sdnn: MOCK_SDNN,
      beats: Math.round((MOCK_HR * MOCK_ELAPSED) / 60),
      phase: 'in',
      hrTrace: mockHrTrace(60),
      sdnnTrace: mockSdnnTrace(60),
      rrTrace: mockRr(64),
      // Mid-inhale rather than at the peak: the light has walked out through
      // the inner rings with the outer ones still dark, so the bloom reads as
      // travelling. A nearly-full bloom is a shape at rest.
      frozenBreath: 0.6,
    });
    setReady(true);
    return () => __devMockSession({});
  }, []);

  const stub = { close: () => {}, closeAll: () => {} } as never;

  return (
    <View style={{ width: DESIGN_W, height: DESIGN_H, backgroundColor: p.bg }}>
      <StatusBar />
      {/* The journal the sheet was raised over, dimmed the way the real
          backdrop dims it. */}
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: p.overlay }} />
      {/* Stand-in for the sheet: same surface, border, corner radius and 18pt
          padding as components/Sheet, with the footer as its own bottom row
          (SheetFooter is a no-op outside the real sheet's context). */}
      <View style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, top: 64,
        backgroundColor: p.surface, borderColor: p.border, borderWidth: StyleSheet.hairlineWidth,
        borderTopLeftRadius: 18, borderTopRightRadius: 18, overflow: 'hidden',
      }}>
        <View style={{ padding: 18, paddingTop: 22 }}>
          {ready ? <SessionCard controls={stub} /> : null}
        </View>
        <View style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: 10,
          paddingHorizontal: 18, paddingTop: 12, paddingBottom: 34,
          backgroundColor: p.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.border,
        }}>
          <Button title="Finish now" variant="primary" onPress={() => {}} />
        </View>
      </View>
    </View>
  );
}

/** A lifelike RR tachogram: dense, jagged beat-to-beat variability — rapid
 *  up/down scatter every couple of beats sitting in a stable band, the way a
 *  real chest-strap trace looks. Deterministic (no RNG). */
function makeRr(n: number): number[] {
  const rnd = (i: number, s: number) => { const x = Math.sin(i * 12.9898 + s * 78.233 + 0.5) * 43758.5453; return x - Math.floor(x); };
  const base = 1000;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.sin(i * 1.2) * 46;         // primary oscillation (~34 across the width)
    const b = Math.sin(i * 0.75 + 0.7) * 26;  // second, offset frequency
    const c = Math.sin(i * 0.3 + 2) * 15;     // slow band drift (stays stable)
    const jitter = (rnd(i, 1) - 0.5) * 36;    // per-beat scatter for the jagged edge
    out.push(base + a + b + c + jitter);
  }
  return out.map((v) => Math.round(v));
}

/** 14-reading history feeding the sparklines: metrics climb into the greens,
 *  but PNS starts down in the ok/bad (yellow/orange) zones so the trace grades
 *  through its colors rather than reading as flat-green. Current reading appended. */
function synthDays(current: Entry): Record<string, ReturnType<typeof blankDay>> {
  const pns = [-0.6, 0.1, -0.2, 0.4, 0.2, 0.8, 0.5, 1.1, 0.7, 1.2, 1.0, 1.4, 1.2, 1.5];
  const sns = [1.3, 1.0, 1.1, 0.7, 0.8, 0.5, 0.6, 0.3, 0.4, 0.2, 0.3, 0.1, 0.2, 0.0];
  const stress = [290, 255, 265, 235, 245, 215, 225, 195, 205, 185, 195, 175, 185, 165];
  const rmssd = [35, 38, 36, 40, 39, 42, 41, 44, 43, 45, 44, 46, 45, 47];
  const sdnn = [45, 48, 47, 51, 50, 53, 52, 56, 55, 57, 56, 59, 58, 60];
  const pnn50 = [4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 8, 9, 9, 10];
  const days: Record<string, ReturnType<typeof blankDay>> = {};
  for (let k = 0; k < 14; k++) {
    const dk = addDays(todayKey(), -(14 - k));
    days[dk] = {
      ...blankDay(),
      readings: [{
        id: `h${k}`, type: 'hrv', time: '07:20',
        pns: String(pns[k]), sns: String(sns[k]), stressIndex: String(stress[k]),
        rmssd: String(rmssd[k]), sdnn: String(sdnn[k]), pnn50: String(pnn50[k]),
      } as Entry],
    };
  }
  days[todayKey()] = { ...blankDay(), readings: [current] };
  return days;
}

/**
 * HRV Results screen (post-capture), scrolled to the top hero. Mounts the REAL
 * ReadingSummary — hero score, beat-to-beat tachogram, and graded metric rows
 * with their own tints and sparklines. Everything is the app's own components.
 */
export function ResultsScreen() {
  const p = usePalette();
  const rr = useMemo(() => makeRr(180), []);
  const reading = useMemo<Entry>(() => ({
    id: 'shot-hrv', type: 'hrv', time: '07:20', durationSec: 300, rrClean: rr,
    rmssd: '48', sdnn: '61', pnn50: '8', pns: '1.6', sns: '0.3', stressIndex: '158',
    meanRr: '1000', mode: '1005', amo50: '35', cv: '6.4', mxdmn: '0.33',
    vlowPower: '500', lowPower: '1800', highPower: '1300', lfPeak: '0.095', hfPeak: '0.24', avgHr: '60',
  }), [rr]);

  const ctx = { sex: getState().profile.sex, height: getState().profile.height };
  const days = useMemo(() => synthDays(reading), [reading]);

  return (
    <View style={{ width: DESIGN_W, height: DESIGN_H, backgroundColor: '#000' }}>
      <StatusBar />
      <ScrollView contentContainerStyle={{ padding: 18, paddingTop: 4 }} showsVerticalScrollIndicator={false}>
        <Text style={{ fontSize: 25, fontWeight: '800', color: p.text, marginBottom: 4 }}>Reading complete</Text>
        <Text style={{ color: p.textDim, fontSize: 14, marginBottom: 16 }}>{`Structured HRV reading · ${rr.length} beats`}</Text>
        <ReadingSummary r={reading} days={days} ctx={ctx} />
      </ScrollView>
    </View>
  );
}

/**
 * Day outlook screen: the REAL "How this score was calculated" breakdown for
 * June 22's actual data, on the app's normal (grey) modal surface. The score
 * card becomes the grade-tinted "Autonomic Outlook" — its own gold border, the
 * Moderate tag, and the outlook guidance — then the graded What-helped/hurt rows.
 */
export function DayOutlookScreen() {
  const p = usePalette();
  const dk = `${todayKey().slice(0, 4)}-06-22`;
  const state = getState();
  const ctx = { sex: state.profile.sex, height: state.profile.height };
  const d = state.days[dk] || blankDay();
  const readings = (d.readings || []).slice().sort((a, b) => ((a.time as string) || '').localeCompare((b.time as string) || ''));
  const all = scoreSet(readings, d, dk, state.days, ctx);
  const cat = scoreCat(all.score ?? 60);
  const guide = OUTLOOK_GUIDE[cat.short] || '';
  const stub = { close: () => {}, closeAll: () => {} } as never;

  return (
    <View style={{ width: DESIGN_W, height: DESIGN_H, backgroundColor: '#000' }}>
      <StatusBar />
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 10 }} showsVerticalScrollIndicator={false}>
        <View style={{ backgroundColor: p.surface, borderColor: p.border, borderWidth: 1, borderRadius: radius.card, padding: 16 }}>
          <ScoreExplain
            all={all} dk={dk} controls={stub}
            hero={{ label: 'Autonomic Outlook', cat: 'ok', tip: guide }}
            hideIntro hideClose
          />
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * Protocol editor screen: the REAL ProtocolEditor, driven by a crafted clean-day
 * protocol (Water / Sleep / No triggers / two meds ON, Activities OFF) so the
 * toggles read as the user's own choices. The store is swapped in memory only
 * and restored on exit.
 */
export function ProtocolEditorScreen() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const base = getState();
    const protocol: Protocol = {
      triggers: { enabled: true, types: [] },
      hrv: { enabled: true },
      water: { enabled: true, liters: 2.5 },
      meds: { enabled: true, types: ['allegra', 'magGlycinate'] },
      activities: { enabled: false, types: [] },
      sleep: { enabled: true, hours: 8 },
    };
    // Show only the two required meds in the catalog so the section reads clean.
    const hiddenMeds = Object.keys(MED_TYPES).filter((k) => k !== 'allegra' && k !== 'magGlycinate');
    const next: AppState = {
      ...base,
      settings: { ...base.settings, protocol },
      hiddenTypes: { ...base.hiddenTypes, meds: hiddenMeds },
    };
    const restore = __devSwapState(next);
    setReady(true);
    return restore;
  }, []);

  const stub = { close: () => {}, closeAll: () => {} } as never;
  return (
    <View style={{ width: DESIGN_W, height: DESIGN_H, backgroundColor: '#000' }}>
      <StatusBar />
      <ScrollView contentContainerStyle={{ padding: 18, paddingTop: 10 }} showsVerticalScrollIndicator={false}>
        {ready ? <ProtocolEditor controls={stub} /> : null}
      </ScrollView>
    </View>
  );
}

/** The Journal's date-nav header (‹ Today ›), matching app/(tabs)/index.tsx. */
function JournalHeader() {
  const p = usePalette();
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 }}>
        <View style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: p.text, fontSize: 25 }}>‹</Text></View>
        <View style={{ flex: 1, maxWidth: 280, backgroundColor: p.surface, borderColor: p.border, borderWidth: 1, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14 }}>
          <Text style={{ color: p.accent, fontSize: 17, fontWeight: '600', textAlign: 'center' }}>Today</Text>
        </View>
        <View style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', opacity: 0.3 }}><Text style={{ color: p.text, fontSize: 25 }}>›</Text></View>
      </View>
      <View style={{ height: 1, backgroundColor: p.border }} />
    </View>
  );
}

/** The floating tab bar, matching the FloatingTabBar in app/(tabs)/_layout.tsx. */
function JournalNavBar({ active = 'Journal' }: { active?: string }) {
  const p = usePalette();
  const tabs: [Parameters<typeof Icon>[0]['name'], string, boolean][] = [
    ['clipboard', 'Journal', active === 'Journal'], ['chart', 'Progress', active === 'Progress'], ['ai', 'Insight', active === 'Insight'],
  ];
  return (
    <View style={{ position: 'absolute', bottom: 24, left: 0, right: 0, alignItems: 'center' }} pointerEvents="none">
      <BlurView intensity={40} tint="dark" style={{ borderRadius: 999, overflow: 'hidden', borderWidth: 1, borderColor: '#34343b', shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 20, shadowOffset: { width: 0, height: 10 } }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, padding: 5, backgroundColor: 'rgba(6,6,9,0.82)' }}>
          <View style={{ paddingLeft: 8, paddingRight: 6, marginRight: 8, justifyContent: 'center' }}><BrandMark size={20} /></View>
          {tabs.map(([icon, label, active]) => (
            <View key={label} style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, alignItems: 'center', backgroundColor: active ? 'rgba(255,255,255,0.14)' : 'transparent' }}>
              <Icon name={icon} size={22} color={active ? p.text : p.textDim} />
              <Text style={{ fontSize: 11, fontWeight: '600', color: active ? p.text : p.textDim, marginTop: 3 }}>{label}</Text>
            </View>
          ))}
          <View style={{ paddingHorizontal: 16, paddingVertical: 8, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="settings" size={22} color={p.textDim} />
          </View>
        </View>
      </BlurView>
    </View>
  );
}

/**
 * Scene 1 · "See your nervous system recover" — the REAL Journal day view over
 * the user's OWN journal, on the day it reads best: Sat 8 Aug 2026.
 *
 * Unlike the crafted scenes below, nothing here is authored. The imported
 * journal is swapped in with every day key SHIFTED forward so 8 Aug lands on
 * today, which is the only way the Journal can show it as "Today" — the score,
 * the streak, the trend card and the milestone count all recompute from real
 * history rather than being posed. Days after 8 Aug are dropped, so nothing on
 * screen depends on data the shifted "today" would not have had.
 */
const HERO_DK = '2026-08-08';

export function JournalHeroScreen() {
  const dk = todayKey();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const base = getState();
    // How far 8 Aug has to travel to become today.
    let shift = 0;
    while (addDays(HERO_DK, shift) < dk && shift < 3650) shift += 1;
    const days: Record<string, unknown> = {};
    for (const k of Object.keys(base.days)) {
      if (k > HERO_DK) continue; // the shifted "today" cannot know the future
      days[addDays(k, shift)] = base.days[k];
    }
    const restore = __devSwapState({ ...base, days } as AppState);
    setReady(true);
    return restore;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={{ width: DESIGN_W, height: DESIGN_H, backgroundColor: '#000' }}>
      <StatusBar />
      <JournalHeader />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 150 }}
        showsVerticalScrollIndicator={false}
        scrollEnabled={false}
      >
        {ready ? (<><DaySummary dk={dk} /><JournalSections dk={dk} /></>) : null}
      </ScrollView>
      <JournalNavBar />
    </View>
  );
}

/**
 * Journal day view: the REAL DaySummary + JournalSections for a crafted good day
 * (four meds, a headache, no triggers, water 2.0 / 2.5 L), with the real header
 * and nav bar, scrolled down to the medications / symptoms / hydration rows.
 */
export function LiveJournalScreen() {
  const dk = todayKey();
  const [ready, setReady] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const base = getState();
    const e = (o: object): Entry => o as Entry;
    const day = {
      ...blankDay(),
      readings: [
        e({ id: 'r-hrv', type: 'breathHrv', time: '07:20', period: 'Morning', style: '4/6', rmssd: '45', sdnn: '58', pnn50: '12', stressIndex: '70', vlowPower: '500', lowPower: '1700', highPower: '1200', lfPeak: '0.095', hfPeak: '0.24', hr: '56', pns: '1.4', sns: '0.1', meanRr: '1050', mode: '1040', amo50: '34', cv: '6.2', mxdmn: '0.32' }),
        e({ id: 'r-bp', type: 'bp', time: '07:50', period: 'Morning', sys: '118', dia: '76', pulse: '58' }),
        e({ id: 'r-rhr', type: 'restingHr', time: '07:15', position: 'Laying', hr: '56' }),
      ],
      meds: [
        e({ id: 'm-pep', type: 'pepsidAc', time: '08:00', amount: '1' }),
        e({ id: 'm-all', type: 'allegra', time: '08:00', amount: '1' }),
        e({ id: 'm-mag', type: 'magGlycinate', time: '08:00', amount: '200' }),
        e({ id: 'm-que', type: 'quercetin', time: '08:00', amount: '500' }),
      ],
      symptoms: [e({ id: 's-ha', type: 'headache', time: '15:00' })],
      sleep: { bed: '22:40', wake: '06:50', quality: 'good' as const, hrLow: '52', hrHigh: '66' },
      food: { water: 2.0, calories: 0, triggers: {}, meals: [] },
      digestion: { movements: [] },
    };
    const keep = ['pepsidAc', 'allegra', 'magGlycinate', 'quercetin'];
    const hiddenMeds = Object.keys(MED_TYPES).filter((k) => !keep.includes(k));
    const next: AppState = {
      ...base,
      days: { ...base.days, [dk]: day },
      hiddenTypes: { ...base.hiddenTypes, meds: hiddenMeds },
    };
    const restore = __devSwapState(next);
    setReady(true);
    return restore;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={{ width: DESIGN_W, height: DESIGN_H, backgroundColor: '#000' }}>
      <StatusBar />
      <JournalHeader />
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 150 }}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => scrollRef.current?.scrollTo({ y: 1300, animated: false })}
      >
        {ready ? (<><DaySummary dk={dk} /><JournalSections dk={dk} /></>) : null}
      </ScrollView>
      <JournalNavBar />
    </View>
  );
}

/**
 * Analysis trend screen: the REAL Progress-tab HRV section (HrvProgress) over the
 * real 12-week seed data, at Week range, filter All — scrolled to the SDNN and
 * RMSSD cards, each a grade-gradient line climbing steadily with its "Show zones"
 * link. Pinned range selector + filter header and the nav bar (Progress active).
 */
export function TrendScreen() {
  const p = usePalette();
  const days = getState().days;
  const ctx = { sex: getState().profile.sex, height: getState().profile.height };
  const scrollRef = useRef<ScrollView>(null);
  return (
    <View style={{ width: DESIGN_W, height: DESIGN_H, backgroundColor: '#000' }}>
      <StatusBar />
      {/* Pinned range selector + HRV filter (matches the Analysis header). */}
      <View style={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 12 }}>
        <Segmented
          options={[{ val: 'day', label: 'Day' }, { val: 'week', label: 'Week' }, { val: 'month', label: 'Month' }, { val: 'year', label: 'Year' }]}
          value="week" onChange={() => {}}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
          <Text style={{ fontSize: 21, fontWeight: '700', color: p.text }}>HRV</Text>
          <HrvFilterLinks value="all" onChange={() => {}} />
        </View>
      </View>
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 150 }}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => scrollRef.current?.scrollTo({ y: 402, animated: false })}
      >
        <HrvProgress days={days} mode="week" ctx={ctx} filt="all" />
      </ScrollView>
      <JournalNavBar active="Progress" />
    </View>
  );
}

/**
 * Trust screen: the REAL onboarding wizard frozen on step 2 (Private & on-device)
 * — full chrome: back button + progress dots up top, the privacy content, and the
 * Continue button. A controlled SafeAreaProvider keeps the insets sane inside the
 * scaled canvas; a faux status bar sits over the top.
 */
export function TrustScreen() {
  return (
    <View style={{ width: DESIGN_W, height: DESIGN_H, backgroundColor: '#0a0a0b' }}>
      {/* Fixed insets: top clears the status bar so the back/dots sit below it. */}
      <SafeAreaInsetsContext.Provider value={{ top: 66, left: 0, right: 0, bottom: 50 }}>
        <Onboarding onDone={() => {}} initialStep={1} />
      </SafeAreaInsetsContext.Provider>
      {/* Above the wizard (which sets zIndex:100) so the time/battery show. */}
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 200, elevation: 200 }} pointerEvents="none"><StatusBar /></View>
    </View>
  );
}
