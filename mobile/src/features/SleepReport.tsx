/**
 * The sleep report — the card the Journal's "Last night" opens.
 *
 * Same shape as the workout report (`WorkoutSummarySheet` + `WorkoutSummary`):
 * a scrolling sheet of `<Section>` blocks, each opened by a `<SectionHead>`,
 * with the edit pencil still reaching the sleep editor through the sheet's
 * floating action pill.
 *
 * All of the arithmetic lives in `src/lib/sleep` and is unit-tested there;
 * this file reads state and renders. Every section is driven by a nullable
 * field of the report, so a night with only bed, wake and quality still reads
 * as a complete report rather than a grid of dashes — see the "absent, not
 * empty" rule in that module.
 */
import React, { useMemo, useState } from 'react';
import Animated from 'react-native-reanimated';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Section, SectionHead } from '../components/summary';
import {
  DipTrendChart, Hypnogram, LineChart, NightSeriesChart, SleepBalanceChart,
  SleepScheduleChart, ZonesToggle,
} from '../components/charts';
import { Icon } from '../components/Icon';
import { StageBar } from '../components/StageBar';
import { useAccordion } from '../components/ui';
import { useSheets } from '../components/Sheet';
import { fonts, radius, usePalette } from '../theme';
import type { HelpContent } from '../lib/help';
import { SCORE_COLORS, catFromBands } from '../lib/scoring';
import { resolveProtocol, scoreCat } from '../lib/scoring/day';
import { addDays, fmtDateLong, fmtShort, fmtTime12 } from '../lib/dates';
import { acBandsToZones, onDay } from '../lib/analysis/buckets';
import {
  DIP_BANDS, DIP_TREND_NIGHTS, OVERNIGHT_HR_BANDS, STAGE_COLORS, STAGE_LABEL, STAGE_ORDER,
  WAKE_MINUTES_BANDS, buildSleepReport, clockFromNoon, dipBandFor, fmtMin,
  WAKEUP_MIN_SEC, nightMinutes, overnightMean, respMedian, timeToFloor, wakeCat,
  type DipResult, type GradeReason, type HrPoint, type SleepReport, type StageKey,
} from '../lib/sleep';
import { getSleepSeries, getState, useAppState } from '../store/store';
import { useEntryForms } from './forms';

const SLEEP_HELP: Record<string, HelpContent> = {
  grade: {
    what: 'How long you actually slept, and the recovery grade that came out of it. On a night your watch staged, this is time asleep rather than time in bed; on a night you logged by hand it is the window you entered. Duration and whether you marked it interrupted set the base grade, then an elevated overnight heart rate can demote it, because a long night spent at a high rate is not restorative sleep.',
    why: 'Sleep is the single biggest daily lever on autonomic recovery, and it is one of the components behind your Autonomic Score. Open "Why this grade" to see exactly which input moved it and by how much, so you can act on the one that did rather than guess.',
    learnMore: '/insights/recovery/sleep-and-autonomic-recovery/',
  },
  hr: {
    what: 'The lowest and highest heart rate recorded across the night by your watch or band. The low usually lands in the first half of the night, during deep sleep; the high reflects arousals, dreams and REM.',
    why: 'Your overnight low is the closest thing to a true resting heart rate you can measure: horizontal, unstimulated and hours clear of caffeine and effort. A low that creeps up over several nights is one of the earliest signals you get.',
    learnMore: '/insights/basics/overnight-heart-rate-while-you-sleep/',
  },
  dip: {
    what: 'How far your overnight low sat below your own daytime resting heart rate, as a percentage. It is measured against the median of your recent resting readings, not against a population average.',
    why: 'Heart rate normally settles well below the daytime rate overnight, and how far it settles is a picture of how much recovery the night actually bought. This describes a pattern in your own log, not a diagnosis: a run of nights worth raising with your clinician is not a finding on its own.',
    learnMore: '/insights/basics/overnight-heart-rate-while-you-sleep/',
  },
  stages: {
    what: 'Minutes of deep, REM and core sleep as your watch scored them, charted night by night. Awake time is not a stage — it is what is left when the night stopped being sleep — so it has its own card below.',
    why: 'Stage minutes move around a lot night to night, so a single figure says very little while the run across a couple of weeks says a lot. Deep and REM trading against core is normal, and chasing any one of them upward is not a useful goal.',
    learnMore: '/insights/recovery/sleep-and-autonomic-recovery/',
  },
  awake: {
    what: 'Minutes your watch scored you as awake while in bed, on the scale sleep medicine uses for wakefulness: under about a quarter of an hour is settled, up to half an hour is ordinary, and past that a night is fragmented.',
    why: 'Every night has some, and brief stirrings you never remember are normal. What is worth reading is the run rather than any one night: awake time climbing across several nights is one of the plainer signs a night is getting worse, and it often moves before you notice feeling less rested.',
    learnMore: '/insights/recovery/sleep-and-autonomic-recovery/',
  },
  schedule: {
    what: 'Your last two weeks of nights on one clock, each bar running from bed at the top to wake at the bottom. Bars are coloured by how long the night was, so a short night is a short bar in a warmer colour.',
    why: 'Bedtime is usually the half of the schedule you can actually move, and a consistent one tends to matter more than any single long night. Note that no hour is graded as right or wrong here: a steady 2am is a steady schedule, and only the length of the night is graded.',
    learnMore: '/insights/recovery/sleep-and-autonomic-recovery/',
  },
  hypnogram: {
    what: 'The night as a timeline: one block for every stretch your watch scored as deep, REM, core or awake, in the order they happened. It shares its clock with the heart-rate curve above, so the two line up.',
    why: 'Stage totals cannot tell you whether your deep sleep came in one early block or in scraps all night, and they cannot put a wake-up beside the moment your heart rate rose. This is where a night that felt wrong usually shows what it was doing.',
    learnMore: '/insights/recovery/sleep-and-autonomic-recovery/',
  },
  resp: {
    what: 'Your breathing rate through the night in breaths per minute, with heart rate drawn over it on its own scale. Most adults sit somewhere between 12 and 20 breaths at rest, and your own usual number matters far more than the range.',
    why: 'Overnight breathing rate is steady night to night, which is exactly what makes a change worth noticing: it often moves before you feel anything. Seeing it against heart rate matters too, since a night where both climb together reads differently from one where only the heart rate does. Read a run of nights rather than one.',
    learnMore: '/insights/recovery/sleep-and-autonomic-recovery/',
  },
  balance: {
    what: 'Each recent night against the sleep target in your protocol, with the running total over or under it.',
    why: 'You set the target yourself in your protocol. It is a line to steer by rather than a debt to clear, and no single night has to make up for another.',
    learnMore: '/insights/recovery/sleep-and-autonomic-recovery/',
  },
};

/* ---------- the sheet ---------- */

export function SleepReportSheet({ dk }: { dk: string }) {
  const p = usePalette();
  useAppState(); // re-render after an edit underneath
  const state = getState();
  const report = useMemo(() => {
    const ctx = { sex: state.profile.sex, height: state.profile.height };
    // The night's series lives in the waveform sidecar, never the journal, so
    // it is read here and handed to the (store-free) builder.
    const w = getSleepSeries(dk);
    // The dip trend's other nights need their curves too, or the bars would be
    // measured off stored single minimums while the headline used the settled
    // stretch — and the number would jump when you touched the last bar.
    const hrByDay: Record<string, HrPoint[] | undefined> = {};
    for (let i = 0; i < DIP_TREND_NIGHTS; i++) {
      const key = addDays(dk, -i);
      hrByDay[key] = key === dk ? w?.sampledHr : getSleepSeries(key)?.sampledHr;
    }
    return buildSleepReport(state.days, dk, addDays, ctx, state.settings.protocol, {
      hr: w?.sampledHr, resp: w?.sampledResp, spans: w?.stageSpans, hrByDay,
    });
  }, [state.days, dk, state.settings.protocol, state.profile.sex, state.profile.height]);

  if (!report) return null;
  // "Logged by hand" is the honest label for a night with no heart rate and no
  // staging — it says what the report could see, rather than looking sparse.
  const byHand = !report.staged && report.hrLow == null && report.hrHigh == null;
  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      {/* The edit + close pill floats top-right — keep the header text clear of it. */}
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, paddingRight: 100 }}>Sleep report</Text>
      <Text style={{ color: p.textDim, fontSize: 14, marginTop: 2, marginBottom: 14, paddingRight: 100 }}>
        {`${fmtDateLong(dk)}${byHand ? ' · logged by hand' : ''}`}
      </Text>
      <SleepReportBody report={report} />
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

/* ---------- the body ---------- */

export function SleepReportBody({ report }: { report: SleepReport }) {
  return (
    <>
      <Verdict report={report} />
      <OvernightHr report={report} />
      <NightShape report={report} />
      <Dip report={report} />
      <Stages report={report} />
      <TimeAwake report={report} />
      <Schedule report={report} />
      <Balance report={report} />
      <Respiratory report={report} />
      <NextDay report={report} />
    </>
  );
}

/* ---------- verdict ---------- */

/**
 * The report's hero, built exactly like the top card of the reading reports
 * (the "Autonomic score" card on a training HRV summary): `<Section cat>` for
 * the grade tint and corner tag, then a plain `<SectionHead>` carrying the
 * title, the value at the shared readout size and its dim unit tail. Nothing
 * here sets its own type scale — a second one is how two report cards start
 * looking like two different apps.
 */
function Verdict({ report }: { report: SleepReport }) {
  const { night, grade } = report;
  return (
    <Section cat={grade}>
      <SectionHead
        title="Time asleep"
        help={SLEEP_HELP.grade}
        value={fmtMin(nightMinutes(night))}
        unit={night.asleepMin != null ? 'asleep' : 'in bed'}
        desc={`${fmtTime12(clockFromNoon(night.bedAt))} → ${fmtTime12(clockFromNoon(night.wakeAt))} · ${night.interrupted ? 'interrupted' : 'uninterrupted'}`}
      />
      <WhyThisGrade report={report} />
    </Section>
  );
}

/**
 * Why the night graded the way it did — a darkened panel inside the graded
 * card rather than a card of its own, because the mechanism belongs to the
 * grade and a second card would read as a second subject.
 *
 * It starts collapsed and opens in place, the reasons appearing inside the
 * same rounded container: someone checking last night's hours should not
 * scroll past three bullet points about thresholds to reach the dip, while
 * someone asking "why Good?" finds the answer one tap away. `p.overlay` is a
 * black wash rather than a fixed colour, so it darkens whichever grade tint
 * the card is wearing instead of fighting it.
 */
function WhyThisGrade({ report }: { report: SleepReport }) {
  const p = usePalette();
  const [open, setOpen] = useState(false);
  const { chevStyle, bodyStyle, onContentLayout, measureStyle } = useAccordion(open, false, { from: 0, to: 180 });
  if (!report.reasons.length) return null;
  return (
    <View style={{ marginTop: 16, borderRadius: radius.control, backgroundColor: p.overlay, overflow: 'hidden' }}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={({ pressed }) => [{ paddingHorizontal: 13, paddingVertical: 12 }, pressed && { opacity: 0.7 }]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ flexShrink: 1, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, color: p.textDim }}>
            Why this grade
          </Text>
          <View style={{ flex: 1 }} />
          <Animated.View style={chevStyle}>
            <Icon name="chevron" size={18} color={p.textDim} />
          </Animated.View>
        </View>
      </Pressable>
      <Animated.View style={[{ overflow: 'hidden' }, bodyStyle]}>
        <View onLayout={onContentLayout} style={[measureStyle, { paddingHorizontal: 13, paddingBottom: 13 }]}>
          <View style={{ gap: 10 }}>
            {report.reasons.map((r, i) => <Reason key={i} reason={r} />)}
          </View>
          {report.gradeNote ? (
            <Text style={{ fontSize: 12, lineHeight: 17, color: p.textDim, marginTop: 12 }}>{report.gradeNote}</Text>
          ) : null}
        </View>
      </Animated.View>
    </View>
  );
}

function Reason({ reason }: { reason: GradeReason }) {
  const p = usePalette();
  const color = reason.cat ? SCORE_COLORS[reason.cat] : p.textDim;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, marginTop: 6 }} />
      <Text style={{ flex: 1, fontSize: 13, lineHeight: 19, color: p.text }}>{reason.text}</Text>
    </View>
  );
}

/* ---------- overnight heart rate ---------- */

/**
 * The night's heart rate, minute by minute — the section this report existed
 * without for one release and shouldn't have.
 *
 * One dot per sample, graded through the SAME thresholds the sleep grade
 * demotes on, with a smoothed line through them and the user's own typical low
 * as the reference. Totals could say "49 to 92"; only the curve can say the 92
 * was at 3am and lasted four minutes, which is the question a person actually
 * has about a night that felt wrong.
 *
 * Falls back to the two stat tiles when there is no series — a night imported
 * by an older build, or logged by hand.
 */
function OvernightHr({ report }: { report: SleepReport }) {
  const p = usePalette();
  const [sel, setSel] = useState<{ t: number; v: number } | null>(null);
  const hr = report.hr;
  const low = report.hrLow, high = report.hrHigh;
  if (!hr && low == null && high == null) return null;

  const settle = hr ? timeToFloor(hr) : null;
  const shownVal = sel ? Math.round(sel.v) : low;
  const shownWhen = sel != null
    ? `at ${fmtTime12(clockFromNoon(report.night.bedAt + sel.t / 60))}`
    : null;

  return (
    <Section>
      <SectionHead
        title="Overnight heart rate"
        help={SLEEP_HELP.hr}
        cat={shownVal != null ? (catFromBands(shownVal, OVERNIGHT_HR_BANDS) as never) : null}
        value={shownVal != null ? String(shownVal) : '–'}
        unit="bpm"
        when={shownWhen}
        desc={hr
          ? 'Every sample your watch took across the night, coloured by the same thresholds the grade above uses. Drag to read any moment.'
          : 'The lowest and highest rate recorded across the night.'}
      />
      {hr ? (
        <View style={{ marginTop: 12 }}>
          <NightSeriesChart
            points={hr.map((q) => ({ t: q.t, v: q.bpm }))}
            bedAt={report.night.bedAt}
            color={p.text}
            bands={OVERNIGHT_HR_BANDS}
            scatter
            refLine={report.typicalLow != null
              ? { v: report.typicalLow, label: `typical low ${Math.round(report.typicalLow)}`, color: SCORE_COLORS.good }
              : null}
            onSelect={setSel}
          />
        </View>
      ) : null}
      <View style={{ marginTop: 12 }}>
        <StatTiles stats={[
          ...(low != null ? [{ value: String(Math.round(low)), label: 'Lowest, bpm' }] : []),
          ...(high != null ? [{ value: String(Math.round(high)), label: 'Peak, bpm' }] : []),
          ...(settle != null ? [{ value: fmtMin(settle / 60), label: 'Time to settle' }] : []),
        ]} />
      </View>
    </Section>
  );
}

/** The small figure tiles the report uses for two- and three-up stat rows. */
function StatTiles({ stats }: { stats: { value: string; label: string; color?: string }[] }) {
  const p = usePalette();
  if (!stats.length) return null;
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {stats.map((s) => (
        <View key={s.label} style={{ flex: 1, backgroundColor: p.surface, borderColor: p.border, borderWidth: 1, borderRadius: radius.control, padding: 11 }}>
          <Text style={{ fontSize: 18, fontFamily: fonts.numHeavy, color: s.color || p.text, fontVariant: ['tabular-nums'] }}>{s.value}</Text>
          <Text style={{ fontSize: 11, lineHeight: 14, color: p.textDim, marginTop: 3 }}>{s.label}</Text>
        </View>
      ))}
    </View>
  );
}

/* ---------- nocturnal dip ---------- */

/**
 * Built like a Progress metric card, because that is what it is: a grade dot
 * beside the title, the value at the Progress readout size with its dim tail
 * ("18% dip on Aug 11"), a one-line description, then the history — and
 * selecting a night in that history moves the headline to it, exactly as
 * dragging a Progress sparkline does. The value itself is never coloured; the
 * dot and the band strip carry the grade.
 */
function Dip({ report }: { report: SleepReport }) {
  const [sel, setSel] = useState<{ dk: string; pct: number } | null>(null);
  if (report.dipPrompt) return <DipPrompt report={report} />;
  if (!report.dip) return null;
  // The selected night's whole result, so the low and the baseline below move
  // with the headline rather than contradicting it.
  const night = sel ? report.dipTrend.find((n) => n.dk === sel.dk)?.dip : null;
  const dip = night || report.dip;
  const dk = sel ? sel.dk : report.dk;
  return (
    <Section>
      <SectionHead
        title="Nocturnal dip"
        help={SLEEP_HELP.dip}
        cat={dip.band.cat}
        value={`${Math.round(dip.pct)}%`}
        unit="dip"
        when={onDay(fmtShort(dk))}
        desc="How far your overnight heart rate settled below your own daytime resting rate."
      />
      <View style={{ marginTop: 14 }}><DipBandStrip pct={dip.pct} /></View>
      <DipDetail dip={dip} />
      <DipTrend report={report} onSelect={setSel} />
    </Section>
  );
}

function DipDetail({ dip }: { dip: DipResult }) {
  const p = usePalette();
  return (
    <View style={{ backgroundColor: p.surface, borderColor: p.border, borderWidth: 1, borderRadius: radius.control, padding: 12, marginTop: 14 }}>
      <DipLine label="Overnight low" value={`${Math.round(dip.low)} bpm`} />
      <DipLine label="Your daytime resting HR" value={`${Math.round(dip.baseline.bpm)} bpm`} />
      <View style={{ borderTopWidth: 1, borderTopColor: p.border, marginTop: 8, paddingTop: 8 }}>
        <Text style={{ fontSize: 12, color: p.textDim }}>
          {`Median of ${dip.baseline.count} reading${dip.baseline.count === 1 ? '' : 's'}, last ${dip.baseline.days} days`}
        </Text>
      </View>
    </View>
  );
}

function DipLine({ label, value }: { label: string; value: string }) {
  const p = usePalette();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
      <Text style={{ fontSize: 12.5, color: p.textDim }}>{label}</Text>
      <Text style={{ fontSize: 15, fontFamily: fonts.numHeavy, color: p.text, fontVariant: ['tabular-nums'] }}>{value}</Text>
    </View>
  );
}

/** The four dip bands as a strip, with the shown night's band lit. Colours are
 *  the app's grade scale (SCORE_COLORS) via each band's `cat` — this picks none
 *  of its own. */
function DipBandStrip({ pct }: { pct: number }) {
  const p = usePalette();
  const here = dipBandFor(pct);
  const grow = (b: { key: string }) => (b.key === 'dipping' ? 1.5 : 1);
  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 3 }}>
        {DIP_BANDS.map((b) => (
          <View
            key={b.key}
            style={{
              flexGrow: grow(b), flexBasis: 0, height: 10, borderRadius: 3,
              backgroundColor: SCORE_COLORS[b.cat], opacity: b.key === here.key ? 1 : 0.32,
            }}
          />
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 3, marginTop: 6 }}>
        {DIP_BANDS.map((b) => {
          const on = b.key === here.key;
          return (
            <Text
              key={b.key}
              numberOfLines={1}
              style={{
                flexGrow: grow(b), flexBasis: 0, fontSize: 10,
                fontWeight: on ? '700' : '500', color: on ? SCORE_COLORS[b.cat] : p.textDim,
              }}
            >{b.label}</Text>
          );
        })}
      </View>
    </View>
  );
}

function DipTrend({ report, onSelect }: { report: SleepReport; onSelect: (pt: { dk: string; pct: number } | null) => void }) {
  const p = usePalette();
  const points = report.dipTrend.map((n) => ({ dk: n.dk, pct: n.dip ? n.dip.pct : null }));
  if (points.filter((q) => q.pct != null).length < 2) return null;
  return (
    <View style={{ marginTop: 16 }}>
      <Text style={{ fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, color: p.textDim, marginBottom: 8 }}>
        {`Last ${points.length} nights`}
      </Text>
      <DipTrendChart
        points={points}
        colorFor={(pct) => SCORE_COLORS[dipBandFor(pct).cat]}
        onSelect={onSelect}
      />
    </View>
  );
}

/** No baseline yet: the low is still shown, so nothing reads as withheld. */
function DipPrompt({ report }: { report: SleepReport }) {
  const p = usePalette();
  const { closeAll } = useSheets();
  const { openReadingForm } = useEntryForms(report.dk);
  const prompt = report.dipPrompt!;
  return (
    <Section>
      <SectionHead title="Nocturnal dip" help={SLEEP_HELP.dip} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 }}>
        <View style={{ width: 30, height: 30, borderRadius: radius.control, backgroundColor: p.surface, borderWidth: 1, borderColor: p.border, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="heart" size={15} color={p.textDim} />
        </View>
        <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: p.text }}>Nocturnal dip needs a daytime number</Text>
      </View>
      <Text style={{ fontSize: 13, lineHeight: 19, color: p.textDim, marginTop: 10 }}>
        {`Your overnight low was ${Math.round(prompt.low)} bpm. To turn that into a dip percentage it has to be measured against your own daytime resting rate, and you have ${prompt.baselineCount} ${prompt.baselineCount === 1 ? 'reading' : 'readings'} in the last three weeks. A few more and this fills in on its own.`}
      </Text>
      <Pressable
        onPress={() => { closeAll(); openReadingForm('restingHr', null); }}
        style={({ pressed }) => [
          { marginTop: 14, alignItems: 'center', justifyContent: 'center', borderRadius: radius.control, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface, paddingVertical: 12 },
          pressed && { opacity: 0.6 },
        ]}
      >
        <Text style={{ color: p.text, fontWeight: '600', fontSize: 14 }}>Take a resting reading</Text>
      </Pressable>
    </Section>
  );
}

/* ---------- the night itself ---------- */

/**
 * The hypnogram, with the night's wakefulness read off the same spans.
 *
 * Stage totals cannot say whether the deep sleep arrived in one early block or
 * in scraps all night, and they cannot put a wake-up next to the moment the
 * heart rate rose. This card is the only place in the app that can, which is
 * why it sits directly under the heart-rate curve: the two share an axis and
 * are meant to be read together.
 */
function NightShape({ report }: { report: SleepReport }) {
  const p = usePalette();
  const spans = report.spans;
  const wake = report.wake;
  if (!spans) return null;
  return (
    <Section>
      <SectionHead
        title="Through the night"
        help={SLEEP_HELP.hypnogram}
        desc="Every stage block in the order it happened, on the same clock as the curve above."
      />
      <View style={{ marginTop: 12 }}>
        <Hypnogram
          spans={spans}
          bedAt={report.night.bedAt}
          rows={['awake', 'rem', 'core', 'deep']}
          colors={STAGE_COLORS}
          labels={STAGE_LABEL}
        />
      </View>
      {/* The same stacked bar the Journal's "Last night" card carries, so the
          hypnogram's blocks and their totals are read off one legend. */}
      {report.night.stages ? <StageBar stages={report.night.stages} style={{ marginTop: 14 }} /> : null}
      {wake && wake.blocks.length ? (
        <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: p.border, paddingTop: 14 }}>
          <StatTiles stats={[
            { value: String(wake.count), label: wake.count === 1 ? 'Wake-up' : 'Wake-ups' },
            { value: fmtMin(wake.totalMin), label: 'Awake total' },
            { value: fmtMin(wake.longestMin), label: 'Longest' },
          ]} />
          <Text style={{ fontSize: 12.5, lineHeight: 18, color: p.textDim, marginTop: 12 }}>
            {`Blocks under ${Math.round(WAKEUP_MIN_SEC / 60)} minutes are counted in the total but not as wake-ups. Brief stirrings you never remember are ordinary sleep.`}
          </Text>
        </View>
      ) : null}
    </Section>
  );
}

/* ---------- stages ---------- */

/**
 * Every stage, night by night, as a Progress-style chart card.
 *
 * There is no stage picker: with three short series the overlay IS the reading —
 * deep and REM trade against core, and the whole point is seeing them move
 * together. A picker would hide three quarters of that behind a tap and make
 * the card answer a narrower question than it can.
 *
 * There is also no stacked bar. The Journal's "Last night" card, the thing you
 * tapped to get here, already shows the night's composition; this card answers
 * the question that one can't — whether tonight is normal for you.
 */
/** The three stages that are sleep. Awake is the leftover, and it gets its own
 *  card below — it is graded on a different scale and would otherwise sit in a
 *  legend implying it is a fourth kind of sleep. */
const SLEEP_STAGES: StageKey[] = STAGE_ORDER.filter((k) => k !== 'awake');

function Stages({ report }: { report: SleepReport }) {
  const [sel, setSel] = useState<number | null>(null);
  const nights = report.stageNights;
  if (!nights.some((n) => n.stages)) return null;

  const valsFor = (k: StageKey) => nights.map((n) => (n.stages ? n.stages[k] : null));
  const series = SLEEP_STAGES.map((k) => ({ values: valsFor(k), color: STAGE_COLORS[k], label: STAGE_LABEL[k] }));

  // The latest night with data, unless a drag selected one. A selection can
  // outlive its dataset, so an out-of-range index falls back to the latest —
  // the same guard the Progress cards use.
  const selIdx = sel != null && sel < nights.length ? sel : null;
  const latestIdx = (() => {
    for (let i = nights.length - 1; i >= 0; i--) if (series.some((sr) => sr.values[i] != null)) return i;
    return null;
  })();
  const shownIdx = selIdx ?? latestIdx;

  return (
    <Section>
      <SectionHead
        title="Sleep stages"
        help={SLEEP_HELP.stages}
        pair={SLEEP_STAGES.map((k) => {
          const v = shownIdx != null ? valsFor(k)[shownIdx] : null;
          return { label: STAGE_LABEL[k], color: STAGE_COLORS[k], text: v != null ? `${Math.round(v)}m` : null };
        })}
        when={shownIdx != null ? onDay(fmtShort(nights[shownIdx].dk)) : null}
        tailBelow
      />
      <View style={{ marginTop: 12 }}>
        <LineChart
          buckets={nights.map((n) => ({ label: fmtShort(n.dk) }))}
          series={series}
          integer
          hideHeader
          onSelect={setSel}
        />
      </View>
    </Section>
  );
}

/**
 * Time awake in bed, on its own card.
 *
 * Graded in minutes on the wake-after-sleep-onset ladder (WAKE_MINUTES_BANDS),
 * which is what lets this behave like every other chart in the app: the scale
 * is the number on the y-axis, so the trace takes the grade-zone gradient, the
 * dots grade themselves, and "Show zones" can draw the boundaries. A grade on
 * a share of the night could not have done any of that — its boundaries move
 * with each night's length, so there is nothing to draw.
 */
function TimeAwake({ report }: { report: SleepReport }) {
  const [sel, setSel] = useState<number | null>(null);
  const [showZones, setShowZones] = useState(false);
  const nights = report.stageNights;
  if (!nights.some((n) => n.stages)) return null;

  const values = nights.map((n) => (n.stages ? n.stages.awake : null));
  const selIdx = sel != null && sel < nights.length ? sel : null;
  const latestIdx = (() => {
    for (let i = values.length - 1; i >= 0; i--) if (values[i] != null) return i;
    return null;
  })();
  const shownIdx = selIdx ?? latestIdx;
  const stages = shownIdx != null ? nights[shownIdx].stages : null;

  return (
    <Section>
      <SectionHead
        title="Time awake"
        help={SLEEP_HELP.awake}
        cat={wakeCat(stages)}
        value={stages != null ? `${Math.round(stages.awake)}m` : '–'}
        when={shownIdx != null ? onDay(fmtShort(nights[shownIdx].dk)) : null}
        desc="Minutes your watch scored you as awake in bed. Every night has some."
        right={<ZonesToggle on={showZones} onPress={() => setShowZones((v) => !v)} />}
      />
      <View style={{ marginTop: 12 }}>
        <LineChart
          buckets={nights.map((n) => ({ label: fmtShort(n.dk) }))}
          series={[{ values, color: STAGE_COLORS.awake, label: 'Awake', pointBands: WAKE_MINUTES_BANDS }]}
          zones={acBandsToZones(WAKE_MINUTES_BANDS)}
          zonesOn={showZones}
          integer
          hideHeader
          onSelect={setSel}
        />
      </View>
    </Section>
  );
}

/* ---------- schedule ---------- */

/**
 * One bar per night, bed at the top and wake at the bottom.
 *
 * The bar is graded on how long the night was, which is also how long the bar
 * is — colour and picture saying the same thing. Bedtime itself is deliberately
 * NOT graded: no hour of the night is correct for everyone, and telling a
 * night-shift worker that 2am is a bad bedtime would be both wrong and useless.
 * Drift is still perfectly legible; it is the endpoints wandering up and down
 * the clock, which the eye reads without needing a band drawn behind them.
 */
function Schedule({ report }: { report: SleepReport }) {
  const [sel, setSel] = useState<number | null>(null);
  const series = report.schedule;
  if (!series) return null;

  const lastIdx = (() => {
    for (let i = series.length - 1; i >= 0; i--) if (series[i].bedAt != null) return i;
    return null;
  })();
  const idx = sel != null && sel < series.length && series[sel].bedAt != null ? sel : lastIdx;
  const shown = idx != null ? series[idx] : null;

  return (
    <Section>
      <SectionHead
        title="Sleep schedule"
        help={SLEEP_HELP.schedule}
        cat={shown?.cat ?? null}
        pair={shown ? [
          { label: 'Bed', text: shown.bedAt != null ? fmtTime12(clockFromNoon(shown.bedAt)) : null },
          { label: 'Wake', text: shown.wakeAt != null ? fmtTime12(clockFromNoon(shown.wakeAt)) : null },
        ] : null}
        when={shown ? onDay(fmtShort(shown.dk)) : null}
        tailBelow
        desc="Each bar is one night, bed to wake. Graded on how long you slept."
      />
      <View style={{ marginTop: 12 }}>
        <SleepScheduleChart nights={series} onSelect={setSel} />
      </View>
    </Section>
  );
}

/* ---------- sleep balance ---------- */

function Balance({ report }: { report: SleepReport }) {
  const p = usePalette();
  const bal = report.balance;
  if (!bal) return null;
  const deltaMin = Math.round(bal.totalDeltaHours * 60);
  const enabled = resolveProtocol(getState().settings.protocol).sleep.enabled;
  return (
    <Section>
      <SectionHead title="Sleep balance" help={SLEEP_HELP.balance} />
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginTop: 10 }}>
        <View>
          <Text style={{ fontSize: 26, fontFamily: fonts.numHeavy, color: p.text, fontVariant: ['tabular-nums'] }}>
            {`${deltaMin < 0 ? '−' : '+'}${fmtMin(Math.abs(deltaMin))}`}
          </Text>
          <Text style={{ fontSize: 11.5, color: p.textDim, marginTop: 3 }}>
            {`Against your ${bal.targetHours}h target, ${bal.nights.length} nights`}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontSize: 16, fontFamily: fonts.numHeavy, color: p.text, fontVariant: ['tabular-nums'] }}>
            {fmtMin(bal.avgHours * 60)}
          </Text>
          <Text style={{ fontSize: 11.5, color: p.textDim, marginTop: 2 }}>Nightly average</Text>
        </View>
      </View>
      <View style={{ marginTop: 12 }}>
        <SleepBalanceChart
          hours={bal.nights.map((n) => nightMinutes(n) / 60)}
          target={bal.targetHours}
        />
      </View>
      <Text style={{ fontSize: 12.5, lineHeight: 18, color: p.textDim, marginTop: 10 }}>
        {enabled
          ? `You set the ${bal.targetHours} hour target yourself, in your protocol. It is a line to steer by, not a debt to clear.`
          : `Measured against the ${bal.targetHours} hour target in your protocol. It is a line to steer by, not a debt to clear.`}
      </Text>
    </Section>
  );
}

/* ---------- respiratory rate ---------- */

/** The two overnight lines. Blue reads as breath, red as heart, and they are
 *  the only thing saying which axis is which — so they must not drift. */
const RESP_LINE = '#60a5fa';
const HR_LINE = '#ef4444';

/**
 * Breathing rate across the night, with heart rate over it on its own axis.
 *
 * The pair is the point. Breaths and beats rarely move for the same reason,
 * so a night where they rise together reads differently from one where only
 * the heart rate climbs — and neither is legible from two separate cards you
 * have to hold in your head. They cannot share a y-axis (15 br/min against 60
 * bpm would flatten the breathing line into a straight one), so each keeps its
 * own scale and its axis labels take its colour.
 *
 * The readout defaults to the night's averages rather than a date, because the
 * whole card is one night. Touch it and both values become that moment's, and
 * the time rides the tail of the last value exactly as the date does on a
 * Progress card ("62 at 3:00am") — two values fit inline, so it does not drop
 * to its own line.
 */
function Respiratory({ report }: { report: SleepReport }) {
  const [sel, setSel] = useState<{ t: number; v: number; rv: number | null } | null>(null);
  const resp = report.resp;
  if (!resp) return null;
  const median = respMedian(resp);
  if (median == null) return null;
  const hrMean = report.hr ? overnightMean(report.hr) : null;

  const brShown = sel ? sel.v : median;
  const hrShown = sel ? sel.rv : hrMean;
  return (
    <Section>
      <SectionHead
        title="Breathing and heart rate"
        help={SLEEP_HELP.resp}
        pair={[
          { label: 'Br/min', color: RESP_LINE, text: brShown != null ? brShown.toFixed(1) : null },
          ...(hrMean != null || sel ? [{ label: 'HR', color: HR_LINE, text: hrShown != null ? String(Math.round(hrShown)) : '–' }] : []),
        ]}
        when={sel ? `at ${fmtTime12(clockFromNoon(report.night.bedAt + sel.t / 60))}` : null}
        desc={sel
          ? 'Both lines at the moment you are touching.'
          : 'Averages across the night. Touch the chart to read any moment.'}
      />
      <View style={{ marginTop: 12 }}>
        <NightSeriesChart
          points={resp.map((q) => ({ t: q.t, v: q.br }))}
          bedAt={report.night.bedAt}
          color={RESP_LINE}
          right={report.hr ? { points: report.hr.map((q) => ({ t: q.t, v: q.bpm })), color: HR_LINE } : null}
          onSelect={setSel}
        />
      </View>
    </Section>
  );
}

/* ---------- what this night did ---------- */

function NextDay({ report }: { report: SleepReport }) {
  const p = usePalette();
  if (!report.nextDay.length && !report.shared.length) return null;
  return (
    <Section>
      <SectionHead title="What this night did" desc="What the day after this night looked like in your journal." />
      {report.nextDay.length ? (
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          {report.nextDay.map((s) => {
            const color = s.unit === '/ 100' ? scoreCat(s.value).color : p.text;
            return (
              <View key={s.label} style={{ flex: 1, backgroundColor: p.surface, borderColor: p.border, borderWidth: 1, borderRadius: radius.control, padding: 12 }}>
                <Text style={{ fontSize: 11, color: p.textDim, marginBottom: 6 }}>{s.label}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
                  <Text style={{ fontSize: 22, fontFamily: fonts.numHeavy, color, fontVariant: ['tabular-nums'] }}>{s.value}</Text>
                  <Text style={{ fontSize: 11, color: p.textDim }}>{s.unit}</Text>
                </View>
                {s.median != null ? (
                  <Text style={{ fontSize: 11, color: p.textDim, marginTop: 5 }}>{`Your median is ${s.median}${s.unit === 'ms' ? ' ms' : ''}`}</Text>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
      {report.shared.length ? (
        <View style={{ borderTopWidth: 1, borderTopColor: p.border, marginTop: 14, paddingTop: 14 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, color: p.textDim, marginBottom: 10 }}>
            Your highest scoring days share
          </Text>
          <View style={{ gap: 8 }}>
            {report.shared.map((s) => (
              <View key={s} style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                <Icon name="check" size={14} color={SCORE_COLORS.good} />
                <Text style={{ flex: 1, fontSize: 13, color: p.text }}>{s}</Text>
              </View>
            ))}
          </View>
          <Text style={{ fontSize: 12, lineHeight: 17, color: p.textDim, marginTop: 11 }}>
            These are patterns in your own log, not proof of cause.
          </Text>
        </View>
      ) : null}
    </Section>
  );
}
