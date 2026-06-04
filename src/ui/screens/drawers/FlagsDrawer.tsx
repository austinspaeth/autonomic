// FlagsDrawer — "Active watch flags" (regression warnings) surfaced from the
// header caution icon. Pure port of docs/index.html:
//   acRegressionWarnings (5892)  → computeActiveFlags() below
//   activeFlags          (5982)  → useActiveFlags()
//   openFlagsDrawer      (5996)  → openFlags()
//   flagAccordion        (6007)  → <FlagAccordion>
//   openFlagPromptDrawer (6027)  → openFlagPrompt()
//
// The legacy `flag.html` wrapped its inline values in <strong>; RN has no HTML,
// so each flag carries an ordered `parts: FlagPart[]` (plain text + bold spans)
// that renders the same one-liner via nested <Text>. `explain` / `focus` are
// verbatim. The milestone-day map (md) is built with buildMilestoneDays from
// '@ui/screens/milestones/milestoneData' and fed to computeActiveFlags, exactly
// as the legacy fed acMilestoneDays() to acRegressionWarnings.

import React, { useState } from 'react';
import { View } from 'react-native';
import type { Day, DateKey, Profile } from '@core/types';
import { useRepoSelector } from '@data/RepositoryProvider';
import { Box, Text, Pressable, Icon } from '@ui/primitives';
import { H2 } from '@ui/components/SheetText';
import { Button } from '@ui/components/Button';
import { openSheet, closeSheet } from '@ui/sheets/useSheets';
import { useTheme } from '@ui/theme/ThemeProvider';
import { buildMilestoneDays, type MilestoneDays } from '@ui/screens/milestones/milestoneData';
import {
  reportDateRange,
  renderSections,
  universalHeader,
} from '@ui/screens/reports/reportSections';
import { keyOf } from '@core/date/dateUtils';

type Days = Record<DateKey, Day>;

// ---- formatting helpers (legacy fmtNum 3280 / roundTo 5559) ----
const roundTo = (v: number | null, dp?: number): number | null => {
  if (v == null) return null;
  const f = Math.pow(10, dp || 0);
  return Math.round(v * f) / f;
};
const fmtNum = (v: number | null): string => {
  if (v == null) return '-';
  if (Number.isInteger(v)) return String(v);
  return Math.abs(v) < 1 ? v.toFixed(3) : v.toFixed(1);
};

// A flag one-liner is a sequence of plain / bold text spans (legacy <strong>).
interface FlagPart {
  text: string;
  bold?: boolean;
}
export interface WatchFlag {
  key: string;
  parts: FlagPart[];
  explain: string;
  focus: string;
}

const t = (text: string): FlagPart => ({ text });
const b = (text: string): FlagPart => ({ text, bold: true });

// ---- acRegressionWarnings (5892) ----
export function computeActiveFlags(md: MilestoneDays): WatchFlag[] {
  const recent = md.keys.slice(-5).map((k) => md.map[k]);
  if (recent.length < 2) return [];
  const warns: WatchFlag[] = [];

  const rs = recent.filter((d) => d.rmssd != null).slice(-3);
  if (rs.length === 3 && rs[0].rmssd! > rs[1].rmssd! && rs[1].rmssd! > rs[2].rmssd!) {
    const seq = rs.map((d) => fmtNum(roundTo(d.rmssd, 1)));
    warns.push({
      key: 'rmssdDecline',
      parts: [
        t('RMSSD has declined three readings in a row ('),
        b(seq[0]),
        t(' → '),
        b(seq[1]),
        t(' → '),
        b(seq[2]),
        t(' ms).'),
      ],
      explain:
        'RMSSD reflects beat-to-beat parasympathetic (vagal, “rest-and-digest”) tone. Three straight drops is a trend, not an off day - usually accumulating load from poor sleep, exertion, illness or a trigger, with the vagal brake easing off and the system tilting toward sympathetic dominance. This is the kind of slide that often precedes a crash, so it’s worth easing load now.',
      focus: `My RMSSD has dropped three readings in a row (${seq.join(' → ')} ms), suggesting declining parasympathetic tone and accumulating autonomic load.`,
    });
  }

  const ss = recent.filter((d) => d.score != null).slice(-2);
  if (ss.length === 2 && ss.every((d) => d.score! < 40)) {
    warns.push({
      key: 'lowScores',
      parts: [
        t('Two consecutive low-score days ('),
        b(String(ss[0].score)),
        t(' and '),
        b(String(ss[1].score)),
        t(' / 100) - load may be accumulating.'),
      ],
      explain:
        'The daily Autonomic Score blends HRV, resting HR, symptoms and adherence into a 0–100 readiness figure. Two days running below 40 (“Compromised” or worse) means reserves didn’t rebuild overnight - the system is staying stressed instead of bouncing back. This is the window to pull back load before it compounds into a longer setback.',
      focus: `My autonomic score has been low two days running (${ss[0].score} then ${ss[1].score} out of 100), so reserves aren’t recovering between days.`,
    });
  }

  const sl = recent.filter((d) => d.sleepH != null).slice(-1)[0];
  if (sl && sl.sleepH! < 6) {
    const h = fmtNum(roundTo(sl.sleepH, 1));
    warns.push({
      key: 'shortSleep',
      parts: [t('Last logged night was '), b(h + 'h'), t(' - under 6 hours.')],
      explain:
        'Sleep is when the parasympathetic system does most of its repair and when HRV rebuilds. A night under 6 hours blunts next-day vagal tone, raises resting heart rate, lowers orthostatic tolerance, and makes symptoms and triggers hit harder. For dysautonomia recovery, consistent 7+ hour nights are one of the highest-leverage levers you have.',
      focus: `My most recent night of sleep was only ${h} hours (under 6), which tends to blunt my next-day HRV and orthostatic tolerance.`,
    });
  }

  const vl = recent.filter((d) => d.vlf != null).slice(-1)[0];
  if (vl && vl.vlf! > 700) {
    const v = Math.round(vl.vlf!);
    warns.push({
      key: 'highVlf',
      parts: [t('VLF power is elevated ('), b(String(v)), t(', over 700) - rising sympathetic load.')],
      explain:
        'Very-low-frequency power reflects slower regulatory processes - thermoregulation, the renin-angiotensin system, and sympathetic/inflammatory activity. Sustained elevation (>700) often signals rising physiological stress or inflammatory load and tracks with worse recovery. In your context it tends to accompany sympathetic over-activation and an impending dip.',
      focus: `My VLF power is elevated (${v}, above the 700 threshold), pointing to rising sympathetic or inflammatory load.`,
    });
  }

  const lf = recent.filter((d) => d.lfPeak != null).slice(-2);
  if (lf.length === 2 && lf[1].lfPeak! < lf[0].lfPeak! - 0.005) {
    const a = lf[0].lfPeak!.toFixed(3),
      c = lf[1].lfPeak!.toFixed(3);
    warns.push({
      key: 'lfPeakShift',
      parts: [
        t('LF peak shifted to a lower frequency ('),
        b(a + ' Hz'),
        t(' → '),
        b(c + ' Hz'),
        t(') vs the prior reading.'),
      ],
      explain:
        'The low-frequency peak sits near the baroreflex resonance (~0.1 Hz). A downward shift suggests the baroreflex is operating more sluggishly - slower blood-pressure regulation on standing - which in POTS/dysautonomia often accompanies reduced orthostatic tolerance and more lightheadedness. Worth watching alongside resting HR and standing symptoms.',
      focus: `My LF (baroreflex) peak shifted to a lower frequency (${a} → ${c} Hz), which can mean slower blood-pressure regulation and reduced orthostatic tolerance.`,
    });
  }

  return warns;
}

// activeFlags (5982): build md over all days + profile, then derive warnings.
export function getActiveFlags(days: Days, profile: Profile): WatchFlag[] {
  const md = buildMilestoneDays(days, profile);
  if (!md.keys.length) return [];
  return computeActiveFlags(md);
}

// Reactive hook for the header (count + presence).
export function useActiveFlags(): WatchFlag[] {
  const days = useRepoSelector((r) => r.allDays());
  const profile = useRepoSelector((r) => r.getProfile());
  return getActiveFlags(days, profile);
}

// ---- prompt drawer body (mirrors ReportsScreen's PromptBody) ----
function FlagPromptBody({ rangeText, prompt }: { rangeText: string; prompt: string }) {
  const th = useTheme();
  return (
    <>
      <H2>Improve this metric</H2>
      <Text style={{ color: th.textDim, fontSize: 13.5, marginBottom: 4 }}>
        Copy this prompt and paste it into Claude or ChatGPT.
      </Text>
      <Text style={{ color: th.textDim, fontSize: 12.5, marginBottom: 14 }}>
        {rangeText} · {prompt.length.toLocaleString()} characters
      </Text>
      <Box
        style={{
          backgroundColor: th.surface2,
          borderWidth: 1,
          borderColor: th.border,
          borderRadius: th.radiusSm,
          padding: 12,
          marginBottom: 8,
        }}
      >
        <Text selectable style={{ color: th.text, fontSize: 12.5, lineHeight: 18, fontFamily: 'Menlo' }}>
          {prompt}
        </Text>
      </Box>
    </>
  );
}

// openFlagPromptDrawer (6027): stacked drawer with the full past week of data,
// emphasizing this specific flagged problem.
function openFlagPrompt(flag: WatchFlag, days: Days, profile: Profile) {
  const todayKey = keyOf(new Date());
  const { keys: allKeys, rangeText } = reportDateRange('week', todayKey);
  const keys = allKeys.filter((k) => days[k]).sort();
  const header = universalHeader(profile, rangeText);
  const focus = `FLAGGED PROBLEM TO FOCUS ON:\n${flag.focus}\n\nThe app surfaced this as an active "watch flag." Examine my full week of data below, confirm or challenge this finding with the actual numbers, explain the most likely drivers, and give me a concrete, prioritized plan to correct it (noting where I should check with a doctor first). Be specific and use my real data - don't generalize.`;
  const data = `DATA FOR PERIOD:\n\n${renderSections(days, keys, profile, [
    'scores',
    'hrv',
    'sleep',
    'bp',
    'rhr',
    'orthostatic',
    'symptoms',
    'activities',
    'food',
    'meds',
    'supplements',
    'cleanDays',
  ])}`;
  const prompt = `${header}\n\n${focus}\n\n${data}`;
  openSheet(() => <FlagPromptBody rangeText={rangeText} prompt={prompt} />, {
    footer: (
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Button title="Close" variant="ghost" onPress={() => closeSheet()} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="Done" variant="primary" onPress={() => closeSheet()} />
        </View>
      </View>
    ),
  });
}

// flagAccordion (6007): bold one-liner is the tap target; expanded body explains
// and offers the AI prompt button.
function FlagAccordion({ flag, days, profile }: { flag: WatchFlag; days: Days; profile: Profile }) {
  const th = useTheme();
  const [open, setOpen] = useState(false);
  return (
    // .flag-card (CSS 1080): surface-2 bg, 1px border, 3px gold left border,
    // radiusSm, margin-top 10, overflow hidden.
    <Box
      style={{
        backgroundColor: th.surface2,
        borderWidth: 1,
        borderColor: th.border,
        borderLeftWidth: 3,
        borderLeftColor: '#eab308',
        borderRadius: th.radiusSm,
        marginTop: 10,
        overflow: 'hidden',
      }}
    >
      {/* .flag-head (1085): full-width row, gap 10, padding 12/14. */}
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14 }}
      >
        {/* .flag-head-text (1091): flex 1; values bold (1092 strong 800). */}
        <Text style={{ flex: 1, color: th.text, fontSize: 13, lineHeight: 18 }}>
          {flag.parts.map((p, i) => (
            <Text key={i} style={p.bold ? { fontWeight: '800' } : undefined}>
              {p.text}
            </Text>
          ))}
        </Text>
        {/* .flag-caret (1093): rotates 180 when open. */}
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
          <Icon name="chevron" size={18} color={th.textDim} />
        </View>
      </Pressable>
      {/* .flag-body (1096): padding 0 14 14, shown when open. */}
      {open ? (
        <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
          {/* .flag-explain (1098): 13px, line-height 1.5, text-dim. */}
          <Text style={{ color: th.textDim, fontSize: 13, lineHeight: 19.5, marginBottom: 12 }}>
            {flag.explain}
          </Text>
          {/* .flag-ai-btn (1099): pill, accent-soft bg, accent border/text. */}
          <Pressable
            onPress={() => openFlagPrompt(flag, days, profile)}
            accessibilityRole="button"
            accessibilityLabel="How can I improve this?"
            style={{
              alignSelf: 'flex-start',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 7,
              backgroundColor: th.accentSoft,
              borderWidth: 1,
              borderColor: th.accent,
              borderRadius: 999,
              paddingVertical: 8,
              paddingHorizontal: 14,
            }}
          >
            <Icon name="sparkles" size={16} color={th.accent} />
            <Text style={{ color: th.accent, fontSize: 13, fontWeight: '700' }}>How can I improve this?</Text>
          </Pressable>
        </View>
      ) : null}
    </Box>
  );
}

// openFlagsDrawer (5996): title + count meta + an accordion per flag.
function FlagsBody({ flags, days, profile }: { flags: WatchFlag[]; days: Days; profile: Profile }) {
  const th = useTheme();
  return (
    <>
      <H2>Active watch flags</H2>
      {/* .sum-meta (CSS 651): text-dim, 13px, pulled up 8 / 14 below. */}
      <Text style={{ color: th.textDim, fontSize: 13, marginTop: -8, marginBottom: 14 }}>
        {flags.length} {flags.length === 1 ? 'flag needs' : 'flags need'} attention
      </Text>
      {flags.map((flag) => (
        <FlagAccordion key={flag.key} flag={flag} days={days} profile={profile} />
      ))}
    </>
  );
}

export function openFlags(flags: WatchFlag[], days: Days, profile: Profile) {
  openSheet(() => <FlagsBody flags={flags} days={days} profile={profile} />);
}
