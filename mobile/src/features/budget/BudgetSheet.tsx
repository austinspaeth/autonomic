/**
 * The pacing sheet: one card per question.
 *
 * Today · Where it went · What makes up your budget · How accurate is my budget. Each
 * opens with a plain sentence before any figure, the pattern the sleep report
 * already uses, and every row goes somewhere.
 *
 * Two things worth knowing before editing:
 *
 *   THE THIRD CARD'S TITLE CARRIES THE NUMBER. "Why today is 5h 30m", not
 *   "Why this size" — the reader arrives already holding the figure, so the
 *   heading can carry it and the rows can spend their width on comparisons.
 *
 *   EMPTY ROWS KEEP THE SHAPE. An input the app has not seen renders as an
 *   empty bar and the words "Not logged today", never as a dash and never as
 *   zero. The absence is the information.
 */
import React from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { CardRow, InsightCard } from '../insights/Sections';
import * as S from '../insights/style';
import { useNotificationPermission } from '../Reminders';
import { Icon } from '../../components/Icon';
import { Button } from '../../components/ui';
import { hexA } from '../../lib/color';
import { SCORE_COLORS } from '../../lib/scoring';
import { CAUTION_GOLD, fonts, usePalette } from '../../theme';
import { fmtDateLong, todayKey } from '../../lib/dates';
import { clock, hm, type BudgetView, type SpendRow } from '../../lib/budget';
import { EXERTION_RUN_MIN } from '../../lib/budget/alerts';
import { LEARN_DAYS } from '../../lib/budget/baseline';
import { BUDGET_HELP } from '../../lib/budget/help';
import type { PauseReason } from '../../lib/budget/pause';
import { MIN_EVALUATED, MIN_TREND_WEEKS, STRIP_DAYS, type AccuracyWeek } from '../../lib/budget/accuracy';
import { healthAppName } from '../../lib/health';
import { connectPacingHealth, useStepsMissing } from '../../store/budget';
import { hideBudgetAgain, showBudgetAnyway } from '../../store/budgetPause';
import { enablePacingNotifications } from '../../store/pacingAlerts';
import { useAppState } from '../../store/store';
import { BudgetBar } from './Bar';
import { CELL_H, CELL_RADIUS, FIGURE_SIZE, TILE_FIGURE } from './style';
import { openSpendSheet } from './SpendSheet';
import { runBudgetAction } from './actions';
import type { SheetControls } from '../../components/Sheet';
import type { DayLoad } from '../../lib/types';
import { useSheets } from '../../components/Sheet';

/** The app's own primary button. Every action in this sheet is one of these:
 *  red, white text, no icon, no chevron — the same object as every other
 *  commit button in the app, rather than a row dressed up as one. */
function Action({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <View style={{ flexDirection: 'row', marginTop: 12 }}>
      <Button title={title} variant="primary" onPress={onPress} />
    </View>
  );
}

/**
 * The gold block that says the app would rather this day published nothing.
 *
 * Shared by the paused card and by a day showing its number anyway, which is
 * the whole design: the override reveals a figure, it does not clear a
 * warning, and using the same object in both states is what makes that
 * legible without a sentence explaining it.
 */
function PauseNote({ text, children }: { text: string; children?: React.ReactNode }) {
  const p = usePalette();
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4,
      backgroundColor: hexA(CAUTION_GOLD, 0.08), borderWidth: 1, borderColor: hexA(CAUTION_GOLD, 0.22),
      borderRadius: 15, padding: 13,
    }}>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {[0, 1].map((i) => <View key={i} style={{ width: 3.4, height: 15, borderRadius: 2, backgroundColor: CAUTION_GOLD }} />)}
      </View>
      <Text style={{ flex: 1, fontSize: 13.5, fontWeight: '700', color: p.text }}>{text}</Text>
      {children}
    </View>
  );
}

/** The paragraph under the note. One per reason: the card used to say "the
 *  app had flagged a downturn" whatever the finding was. */
function pauseReasonWhy(reason: PauseReason, past: boolean): string {
  if (reason === 'strain-alert') {
    return past
      ? 'Several of the markers the app watches had moved away from your own baseline together, so it published no number.'
      : 'Several of the markers the app watches have moved away from your own baseline together. That is an early warning, not a diagnosis, and the card below your Outlook has the detail.';
  }
  if (reason === 'crash') {
    return past
      ? 'That day scored well below your own recent days, so the app published no number.'
      : 'Today is scoring well below your own recent days. This is about the drop, not the number itself: a day at your usual level always gets a budget.';
  }
  return past
    ? 'The app had flagged a downturn, so it published no number.'
    : 'Resumes when the warning card below your Outlook clears.';
}

function Tile({ value, label, color }: { value: string; label: string; color?: string }) {
  const p = usePalette();
  return (
    <View style={[S.TILE, { backgroundColor: p.bg, borderColor: p.border }]}>
      <Text style={{ fontFamily: fonts.numHeavy, fontSize: TILE_FIGURE, color: color || p.text, fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
      <Text style={{ fontSize: 11, color: p.textDim, marginTop: 3 }}>{label}</Text>
    </View>
  );
}

/**
 * How sure the ceiling is, said in words — the SAME words the Journal strip
 * puts in its right-hand slot, and in the same order of precedence.
 *
 * The strip already says "Low confidence" / "Medium confidence" there, and
 * says "Learning · day 3" INSTEAD while the ceiling is still being fitted,
 * because which of those two a reader is looking at is the more useful fact.
 * It stays quiet on a confident day; the sheet is where the reader came for
 * the answer, so it names that case too. Reading the strip's own label rather
 * than the raw confidence is what stops the sheet claiming "High confidence"
 * on a day the card outside it called day 13 of learning.
 */
function confidenceLabel(budget: BudgetView): string {
  return budget.rightLabel ?? 'High confidence';
}

/** An empty row's bar: the track, and nothing in it. No texture — the words
 *  beside it already say "Not logged today". */
function EmptyBar() {
  const p = usePalette();
  return <View style={{ height: 5, borderRadius: 999, backgroundColor: hexA(p.text, 0.06) }} />;
}


/**
 * The ask, when the app is not getting steps.
 *
 * First card in the sheet, because it is the reason the rest of the sheet is
 * thinner than it should be — explaining the budget's coverage underneath an
 * unexplained gap reads as an excuse. It says what is missing and what it buys
 * in two sentences, and offers the one button that fixes it.
 */
function StepsCard() {
  const p = usePalette();
  return (
    <InsightCard title="Steps are not connected" bg={p.sunk}>
      <Text style={{ fontSize: 13.5, lineHeight: 20, color: hexA(p.text, 0.78), marginTop: 2 }}>
        {`Your phone counts its own steps, with or without a watch. Letting ${healthAppName()} share them gives the budget a picture of the hours you did not log, which is most of them.`}
      </Text>
      <Text style={{ fontSize: 12.5, lineHeight: 18, color: p.textDim, marginTop: 8 }}>
        Without it the budget only sees what you write down, so it reads a busy day as a quiet one.
      </Text>
      <Action title={`Connect steps from ${healthAppName()}`} onPress={() => { void connectPacingHealth(); }} />
    </InsightCard>
  );
}

/**
 * The other ask: pacing alerts need notification permission, and the budget is
 * most useful at exactly the moments nobody has the app open.
 *
 * Below the steps card when both show, since steps change what the budget
 * knows and this only changes who hears about it. Gone the moment permission
 * lands, which is also the moment every alert the user never chose for turns
 * on. When the OS will not ask again the button goes to system settings rather
 * than offering a tap that could only fail.
 */
function NotifyCard({ dk }: { dk: string }) {
  const p = usePalette();
  const { status, refresh } = useNotificationPermission();
  const lineBpm = useAppState().days[dk]?.load?.lineBpm ?? null;
  if (status == null || status === 'granted') return null;
  const blocked = status === 'blocked';
  const heart = lineBpm != null
    ? `your heart rate stays above ${Math.round(lineBpm)} bpm for ${EXERTION_RUN_MIN} minutes`
    : `your heart rate stays high for ${EXERTION_RUN_MIN} minutes`;
  const onPress = () => {
    if (blocked) { void Linking.openSettings(); return; }
    void enablePacingNotifications().then((r) => {
      if (r === 'blocked') void Linking.openSettings();
      refresh();
    });
  };
  return (
    <InsightCard title="Turn on pacing alerts" bg={p.sunk}>
      <Text style={{ fontSize: 13.5, lineHeight: 20, color: hexA(p.text, 0.78), marginTop: 2 }}>
        {`Get a notification when today is running ahead of pace, nearly spent or over budget, and when ${heart}.`}
      </Text>
      <Text style={{ fontSize: 12.5, lineHeight: 18, color: p.textDim, marginTop: 8 }}>
        {blocked
          ? 'Notifications are turned off for Autonomic in system settings.'
          : 'Checked through the day, even with the app closed. Nothing leaves your phone.'}
      </Text>
      <Action title={blocked ? 'Open Settings' : 'Turn on notifications'} onPress={onPress} />
    </InsightCard>
  );
}

/* ------------------------------------------------------------------ *
 * 1. Today
 * ------------------------------------------------------------------ */

function TodayCard({ dk, budget }: { dk: string; budget: BudgetView }) {
  const p = usePalette();
  const { openSheet } = useSheets();
  const state = useAppState();
  const load = state.days[dk]?.load;
  const spent = budget.burn.effortMin;
  const env = budget.envelope.effortMin;

  if (budget.state === 'suppressed') {
    const reason = budget.pausedReason || 'downturn';
    return (
      <InsightCard
        title={budget.past ? 'That day' : 'Today'}
        desc="No budget is published on a day like this one, since a number here invites someone to spend it."
        bg={p.sunk}
      >
        <PauseNote text={budget.figure} />
        <Text style={{ fontSize: 12.5, lineHeight: 18, color: p.textDim, marginTop: 12 }}>
          {pauseReasonWhy(reason, budget.past)}
        </Text>
        {/* The way out, and it lives here rather than only on the strip so the
            reader meets the reason before the number. It is a GHOST button:
            the app would rather they rested, and a primary here would be the
            app suggesting its own warning be ignored. */}
        {!budget.past ? (
          <View style={{ flexDirection: 'row', marginTop: 14 }}>
            <Button
              title="Show it anyway"
              variant="ghost"
              icon="play"
              onPress={() => showBudgetAnyway(dk)}
            />
          </View>
        ) : null}
      </InsightCard>
    );
  }

  // A finished day that went over is still an over-budget day: the figure is
  // red and the third tile counts the overage, exactly as it does live.
  const over = budget.state === 'over' || budget.state === 'final-over';

  return (
    <InsightCard
      title={budget.past ? 'That day' : 'Budget'}
      helpText={BUDGET_HELP.today}
      desc={budget.past
        ? "What that day could absorb, and what it actually cost."
        : "Today's estimate, and how much of it the day has used so far."}
      bg={p.sunk}
    >
      {/* A paused day showing its number. The warning keeps the top of the
          card — it is still the most important thing on this screen — and the
          figure sits UNDER it rather than beside it, so the reader is never
          handed the number first. */}
      {budget.unpaused && budget.pausedReason ? (
        <View style={{ marginBottom: 12 }}>
          <PauseNote text={budget.unpaused === 'user' ? 'Shown at your request' : 'Shown after three paused days'}>
            {/* Back to paused. Only the reader's own choice is reversible:
                the run valve is the app's, and a button that re-hid the
                budget for the rest of a week would just be the bug again. */}
            {budget.unpaused === 'user' ? (
              <Pressable
                onPress={() => hideBudgetAgain(dk)}
                accessibilityRole="button"
                accessibilityLabel="Hide the budget again"
                hitSlop={10}
                style={({ pressed }) => [{ paddingHorizontal: 4 }, pressed && { opacity: 0.6 }]}
              >
                <Text style={{ fontSize: 12.5, fontWeight: '700', color: hexA(p.text, 0.7) }}>Hide</Text>
              </Pressable>
            ) : null}
          </PauseNote>
          <Text style={{ fontSize: 12.5, lineHeight: 18, color: p.textDim, marginTop: 10 }}>
            {pauseReasonWhy(budget.pausedReason, budget.past)}
          </Text>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 6, marginBottom: 11 }}>
        <Text style={{
          fontFamily: fonts.numHeavy, fontSize: FIGURE_SIZE, lineHeight: FIGURE_SIZE + 2,
          letterSpacing: -0.4, color: over ? p.accent : p.text, fontVariant: ['tabular-nums'],
        }}>
          {budget.figure}
        </Text>
        {/* Same size as the figure's own tail elsewhere, dim, and NOT bold:
            it is a unit, not a second number. */}
        <Text style={{ fontSize: 14, fontWeight: '400', color: p.textDim }}>
          {budget.past ? budget.figureSub : over ? '' : 'left'}
        </Text>
      </View>

      {/* No ember in the sheet: the motion is the strip's way of catching an
          eye passing over the Journal, and here the reader has already looked. */}
      {/* The SAME state the Journal strip drew. It used to be forced to
          'healthy' here, so a day the card outside had just called over budget
          opened onto a full green bar. Still, not drifting: the sheet is where
          the reader has already looked. */}
      <BudgetBar
        state={budget.state}
        fill={budget.fill}
        expected={budget.pace ? budget.pace.expected : null}
        still
        height={14}
      />

      {/* Under the bar: what the day has spent OUT OF WHAT IT HAS, and how sure
          the app is of that ceiling.

          Both halves replaced numbers that read as the same quantity as the
          bar's own. "1h 41m spent" left the reader to find the ceiling in a
          tile below, and "1h 06m by now" was a third duration in a row of
          durations — the pace figure is what the white mark already says, in
          the one place it can be compared against the fill without arithmetic.
          The confidence word is the thing the reader cannot see anywhere else
          on this card. */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10, marginTop: 14, marginBottom: 14 }}>
        <Text style={{ flexShrink: 1, fontSize: 11.5, color: p.textDim }} numberOfLines={1}>
          {env != null ? `${hm(spent)} spent of ${hm(env)}` : `${hm(spent)} spent`}
        </Text>
        {/* On a finished day the question is not "how sure are you" but "how
            much of that day did you see", which is the same swap the strip's
            own right-hand label makes — and it keeps this line short enough to
            sit beside the spend on a narrow phone. The day's margin is not
            repeated here: the figure above and the tiles below both state it. */}
        <Text style={{ flexShrink: 1, fontSize: 11.5, color: p.textDim }} numberOfLines={1}>
          {budget.past ? (budget.rightLabel ?? '') : confidenceLabel(budget)}
        </Text>
      </View>

      {/* Only while the mark is actually drawn. Past the ceiling the bar has
          no marker on it, and a paragraph explaining a white line the reader
          cannot see is worse than no paragraph. */}
      {budget.pace && !over ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: p.bg, borderRadius: 14, padding: 12, marginBottom: 15 }}>
          {/* The mark itself, drawn the way the bar draws it: the line above,
              the caret under it and overlapping its foot by 2pt, as `Bar`
              does (line to height + 4, caret from height + 2). A bare
              triangle, or a caret floating under a gap, was a different
              object from the thing it was explaining. */}
          <View style={{ alignItems: 'center' }}>
            <View style={{ width: 2, height: 18, borderRadius: 999, backgroundColor: hexA(p.text, 0.84) }} />
            <View style={{
              marginTop: -2, width: 0, height: 0,
              borderLeftWidth: 5, borderRightWidth: 5, borderBottomWidth: 6,
              borderLeftColor: 'transparent', borderRightColor: 'transparent',
              borderBottomColor: hexA(p.text, 0.84),
            }} />
          </View>
          <Text style={{ flex: 1, fontSize: 12.5, lineHeight: 18, color: p.textDim }}>
            The white mark is where you are in the day. Short of it, energy in reserve. Past it, running out.
          </Text>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 9 }}>
        <Tile value={env != null ? hm(env) : '--'} label="Budget" />
        <Tile value={hm(spent)} label="Spent" />
        {over
          ? <Tile value={hm(budget.overByMin || 0)} label="Over" color={p.accent} />
          : <Tile value={hm(budget.leftMin || 0)} label={budget.past ? 'Spare' : 'Left'} color={SCORE_COLORS.good} />}
      </View>

      {/* Never the steps ask: the card above already made it, and the same
          red button twice in one scroll reads as a bug. */}
      {budget.recommendation?.actionable && !(budget.stepsMissing && budget.recommendation.id === 'steps') ? (
        <Action
          title={budget.recommendation.title.replace(/^Todo: /, '')}
          onPress={() => runBudgetAction(budget.recommendation?.id, openSheet, dk)}
        />
      ) : null}

      <Text style={{ fontSize: 12, lineHeight: 18, color: p.textDim, marginTop: 13 }}>
        {coverageLine(budget, load ?? null)}
      </Text>

    </InsightCard>
  );
}

/** Minutes past midnight, now. */
function nowMin(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function coverageLine(budget: BudgetView, load: DayLoad | null): string {
  const steps = load?.steps ?? null;
  const acts = budget.burn.rows.find((r) => r.source === 'activities')?.members?.length || 0;
  const parts: string[] = [];
  if (acts) parts.push(`${acts} logged ${acts === 1 ? 'activity' : 'activities'}`);
  if (steps != null) parts.push(`${Math.round(steps).toLocaleString('en-US')} steps`);
  if (budget.burn.coverage === 'full' || budget.burn.coverage === 'partial') parts.push('your heart rate');
  const thin = thinHrLine(budget, load);
  if (!parts.length) {
    return (budget.past
      ? 'Nothing was connected that day, so this is a starting estimate.'
      : 'Nothing connected yet, so this is a starting estimate.') + thin;
  }
  if (steps == null) {
    return (budget.past
      ? `Built from ${joinList(parts)}. No steps were read that day.`
      : `Built from ${joinList(parts)}. Steps are not connected.`) + thin;
  }
  return `Built from ${joinList(parts)}.${thin}`;
}

/**
 * What to say when a heart-rate series arrived but was too thin to price.
 *
 * Minutes are counted by integrating between samples, and a gap wider than a
 * few minutes is treated as unwatched rather than as quiet, so a day of
 * scattered background readings charges nothing at all. That is the right call
 * and it used to be made in silence, which read as a claim: a user whose watch
 * caught three climbs over their line saw a day with no heart-rate row, went
 * to the health app, found the climbs, and reasonably concluded the readings
 * had not been imported. The coverage and the peak are both known. Say them.
 */
function thinHrLine(budget: BudgetView, load: DayLoad | null): string {
  if (!load || budget.burn.coverage === 'full' || budget.burn.coverage === 'partial') return '';
  const cov = load.hrCoverageMin;
  if (cov == null) return '';
  const when = budget.past ? 'that day' : 'today';
  const peak = load.peakBpm != null
    ? ` The highest reading in it was ${Math.round(load.peakBpm)} bpm.`
    : '';
  return ` Your heart rate was only recorded for ${hm(cov)} of ${when}, which is too scattered to count minutes from, so none are charged here.${peak}`;
}

const joinList = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] || '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;

/* ------------------------------------------------------------------ *
 * 2. Where it went
 * ------------------------------------------------------------------ */

function SpendCard({ dk, budget }: { dk: string; budget: BudgetView }) {
  const p = usePalette();
  const { openSheet } = useSheets();
  const rows = budget.burn.rows;

  return (
    <InsightCard
      title="Where Budget Went"
      helpText={BUDGET_HELP.spend}
      desc={rows.length
        ? (budget.past
          ? `The ${hm(budget.burn.effortMin)} that day cost, largest source first.`
          : `The ${hm(budget.burn.effortMin)} spent so far, largest source first.`)
        : (budget.past ? 'What that day cost.' : 'What the day has cost so far.')}
      bg={p.sunk}
    >
      {!rows.length ? (
        <Text style={{ fontSize: 13, color: p.textDim, marginTop: 4 }}>
          {budget.past ? 'Nothing was charged that day.' : 'Nothing charged yet today.'}
        </Text>
      ) : rows.map((r) => <SpendRowView key={r.source} row={r} onPress={() => openSpendSheet(openSheet, dk, budget, r)} />)}
    </InsightCard>
  );
}

function SpendRowView({ row, onPress }: { row: SpendRow; onPress: () => void }) {
  const p = usePalette();
  const credit = row.effortMin < 0;
  // No per-source icon and no per-source colour. Six tinted glyphs turned a
  // ranked list into a legend the reader had to learn first; the row's NAME is
  // what identifies it. The share bar is a neutral grey, and the one colour
  // left is the green on a credit, which is the only row that means something
  // different from the others.
  const barColor = credit ? SCORE_COLORS.good : hexA(p.text, 0.34);
  return (
    <CardRow bg={p.bg} tall onPress={onPress}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 14, fontWeight: '700', color: p.text }}>{row.label}</Text>
        <Text style={{ fontSize: 11.5, color: p.textDim, marginTop: 2 }} numberOfLines={1}>{row.detail}</Text>
        <View style={{ height: 4, borderRadius: 999, backgroundColor: hexA(p.text, 0.06), marginTop: 8, overflow: 'hidden' }}>
          <View style={{ height: '100%', width: `${Math.round(row.share * 100)}%`, borderRadius: 999, backgroundColor: barColor }} />
        </View>
      </View>
      {/* Centred against the whole row rather than pinned to its first line:
          the row is three lines tall and a figure hanging off the top read as
          belonging to the title alone. The chevron matches the size the
          buttons above use. */}
      <View style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ fontFamily: fonts.numHeavy, fontSize: 15, color: credit ? SCORE_COLORS.good : p.text, fontVariant: ['tabular-nums'] }}>
          {credit ? `-${hm(row.effortMin)}` : hm(row.effortMin)}
        </Text>
        <Icon name="chevronRight" size={16} color={hexA(p.textDim, 0.7)} />
      </View>
    </CardRow>
  );
}

/* ------------------------------------------------------------------ *
 * 3. Why today is this size
 * ------------------------------------------------------------------ */

function WhyCard({ dk, budget }: { dk: string; budget: BudgetView }) {
  const p = usePalette();
  /**
   * The title names the QUESTION, never the answer.
   *
   * It used to state the size, scraped out of `figureSub` — which is not a
   * size at all on the states that do not carry one, so before anything was
   * spent the card read "Why is your budget to spend today". Putting the
   * figure back in correctly is no better: the number is already the largest
   * thing on the strip this card opened from, and repeating it in a title
   * spends the one line that could say what the rows below are.
   */
  const title = budget.state === 'suppressed'
    ? (budget.past ? 'Why the budget was paused' : 'Why your budget is paused')
    : budget.past ? "What made up that day's budget" : 'What makes up your budget';

  return (
    <InsightCard
      title={title}
      helpText={BUDGET_HELP.why}
      desc={budget.past
        ? "That morning's readings, each against your own usual, not a population range."
        : "This morning's readings, each against your own usual, not a population range."}
      bg={p.sunk}
    >
      {budget.envelope.inputs.map((i) => (
        <CardRow key={i.id} bg={p.bg} tall>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, flex: 1, minWidth: 0 }}>
                {i.value ? (
                  <>
                    <Text style={{ fontFamily: fonts.numHeavy, fontSize: 16, color: p.text, fontVariant: ['tabular-nums'] }}>{i.value}</Text>
                    {i.unit ? <Text style={{ fontSize: 11, color: p.textDim }}>{i.unit}</Text> : null}
                  </>
                ) : null}
                <Text style={{ fontSize: 13, color: hexA(p.text, 0.72) }} numberOfLines={1}>{i.label}</Text>
              </View>
              {/* The grade ladder the rest of the app uses, so a reading that
                  is poor here is the same colour it is on the Outlook tiles.
                  Gold is not one of those colours. */}
              <Text style={{
                fontSize: 12, fontWeight: '600',
                color: i.vsCat === 'good' ? SCORE_COLORS.good : i.vsCat === 'bad' ? SCORE_COLORS.bad : p.textDim,
              }}>
                {i.vs}
              </Text>
            </View>
            {i.known && i.bar != null ? (
              <View style={{ height: 5, borderRadius: 999, backgroundColor: hexA(p.text, 0.06) }}>
                <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.round(i.bar * 100)}%`, borderRadius: 999, backgroundColor: i.vsCat === 'bad' ? SCORE_COLORS.bad : i.vsCat === 'good' ? SCORE_COLORS.good : hexA(p.text, 0.34) }} />
                {i.usual != null ? (
                  <View style={{ position: 'absolute', left: `${Math.round(i.usual * 100)}%`, top: -3, bottom: -3, width: 1.5, borderRadius: 999, backgroundColor: hexA(p.text, 0.36) }} />
                ) : null}
              </View>
            ) : i.known ? null : <EmptyBar />}
          </View>
        </CardRow>
      ))}

      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 9, paddingTop: 10 }}>
        <Icon name="info" size={14} color={hexA(p.textDim, 0.8)} />
        <Text style={{ flex: 1, fontSize: 12, lineHeight: 17, color: p.textDim }}>
          {budget.past
            ? 'Empty rows are inputs the app never saw that day. The estimate was wider without them.'
            : 'Empty rows are inputs the app has not seen yet today. The estimate widens without them.'}
        </Text>
      </View>

    </InsightCard>
  );
}

/* ------------------------------------------------------------------ *
 * 4. How accurate is my budget
 * ------------------------------------------------------------------ */

/**
 * How accurate is my budget — the trust anchor, and the only card that answers "is
 * this getting smarter".
 *
 * Weekly bars once there are four weeks of verdicts, because the question is a
 * direction of travel and two bars is a shape rather than a trend. Under that
 * it falls back to the day strip, which can say something true from a handful
 * of days. The latest week is the saturated bar; the ones behind it sit back so
 * the eye lands on now.
 */
function TrendBars({ weeks }: { weeks: AccuracyWeek[] }) {
  const p = usePalette();
  const H = 96, padT = 6, padB = 17, gap = 9;
  const full = H - padT - padB;
  return (
    <View style={{ height: H, flexDirection: 'row', gap, marginBottom: 11 }}>
      {weeks.map((w, i) => {
        const share = w.of ? w.held / w.of : 0;
        const last = i === weeks.length - 1;
        return (
          <View key={w.dk} style={{ flex: 1 }}>
            <View style={{ height: full, marginTop: padT, borderRadius: 7, backgroundColor: hexA(p.text, 0.04), justifyContent: 'flex-end' }}>
              <View style={{
                height: Math.max(3, full * share),
                borderRadius: 7,
                backgroundColor: last ? SCORE_COLORS.good : hexA(SCORE_COLORS.good, 0.5),
              }} />
            </View>
            <Text style={{ fontSize: 9.5, color: p.textDim, textAlign: 'center', marginTop: 3 }}>
              {`W${i + 1}`}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function AccuracyCard({ budget }: { budget: BudgetView }) {
  const p = usePalette();
  const a = budget.accuracy;
  const learning = budget.learning;
  const weeks = a.weeks;
  const trend = weeks.length >= MIN_TREND_WEEKS;

  const cellColor = (o: string) =>
    o === 'held' ? SCORE_COLORS.good
      : o === 'dipped' ? SCORE_COLORS.bad
        : o === 'over' ? hexA(p.text, 0.1)
          : hexA(p.text, 0.05);

  const cells = a.strip.length
    ? a.strip
    : Array.from({ length: STRIP_DAYS }, (_, i) => ({ dk: String(i), outcome: 'pending' as const }));

  return (
    <InsightCard
      title={learning ? 'How it is learning' : 'How accurate is my budget'}
      helpText={BUDGET_HELP.accuracy}
      desc={trend
        ? 'How often the budget has been right, week by week, as it learns your log.'
        : 'Days you stayed under budget, and whether the next two days held.'}
      bg={p.sunk}
    >
      {trend ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginTop: 6, marginBottom: 13 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 7 }}>
              <Text style={{ fontFamily: fonts.numHeavy, fontSize: 34, lineHeight: 34, color: p.text, fontVariant: ['tabular-nums'] }}>
                {a.held}
              </Text>
              {/* Not a window claim: this counts the last six weeks of
                  evaluated days while the bars behind it draw five, and the
                  copy said "fortnight", which was neither of those and is not
                  how anyone says two weeks anyway. */}
              <Text style={{ fontSize: 14, color: p.textDim }}>{`of ${a.of} days checked`}</Text>
            </View>
            {a.widenedMin != null ? (
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{
                  fontFamily: fonts.numHeavy, fontSize: 16,
                  color: a.widenedMin >= 0 ? SCORE_COLORS.good : SCORE_COLORS.bad,
                  fontVariant: ['tabular-nums'],
                }}>
                  {`${a.widenedMin >= 0 ? '+' : '-'}${hm(a.widenedMin)}`}
                </Text>
                <Text style={{ fontSize: 11, color: p.textDim, marginTop: 1 }}>
                  {a.widenedMin >= 0 ? 'budget widened' : 'budget narrowed'}
                </Text>
              </View>
            ) : null}
          </View>
          <TrendBars weeks={weeks} />
        </>
      ) : (
        <>
          {a.ready ? (
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 7, marginTop: 6, marginBottom: 13 }}>
              <Text style={{ fontFamily: fonts.numHeavy, fontSize: 30, lineHeight: 32, color: SCORE_COLORS.good, fontVariant: ['tabular-nums'] }}>
                {a.held}
              </Text>
              <Text style={{ fontSize: 14, color: hexA(p.text, 0.72) }}>{`of your last ${a.of} days held`}</Text>
            </View>
          ) : (
            <Text style={{ fontSize: 14, color: hexA(p.text, 0.72), marginTop: 6, marginBottom: 13 }}>
              {`${a.of} of ${MIN_EVALUATED} days evaluated`}
            </Text>
          )}

          <View style={{ flexDirection: 'row', gap: 4, marginBottom: 9 }}>
            {cells.map((c, i) => (
              <View key={`${c.dk}-${i}`} style={{ flex: 1, height: CELL_H, borderRadius: CELL_RADIUS, backgroundColor: cellColor(c.outcome) }} />
            ))}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 15 }}>
            {[['Held', SCORE_COLORS.good], ['Dipped after', SCORE_COLORS.bad], ['Over budget', hexA(p.text, 0.1)]].map(([label, c]) => (
              <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: c }} />
                <Text style={{ fontSize: 11.5, color: p.textDim }}>{label}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      <View style={{ borderTopWidth: 1, borderTopColor: p.border, paddingTop: 13 }}>
        <Text style={{ fontSize: 12.5, lineHeight: 19, color: p.textDim }}>{footerLine(budget)}</Text>
      </View>
    </InsightCard>
  );
}

function footerLine(budget: BudgetView): string {
  const a = budget.accuracy;
  const move = budget.ceilingMoved;
  if (budget.learning) {
    const day = Math.min(LEARN_DAYS, budget.envelope.heldDays + 1);
    const early = budget.envelope.earlyMove;
    const tail = early
      ? ` Your budget moved ${early.dir} by ${hm(early.min)} after ${fmtDateLong(early.dk).split(',')[0]} held.`
      : '';
    return `Learning your ceiling, day ${day} of ${LEARN_DAYS}.${tail}`;
  }
  if (a.weeks.length >= MIN_TREND_WEEKS) {
    const first = a.weeks[0];
    const last = a.weeks[a.weeks.length - 1];
    const rose = (last.of ? last.held / last.of : 0) > (first.of ? first.held / first.of : 0);
    if (move) {
      return rose
        ? `Accuracy has climbed over these weeks, so the estimate has been widening with it.`
        : `Accuracy has slipped over these weeks, so the estimate has been coming in with it.`;
    }
    return rose
      ? 'Accuracy has climbed over these weeks.'
      : 'Accuracy has held steady over these weeks.';
  }
  if (move) {
    return move.dir === 'up'
      ? `The budget widened by ${hm(move.min)} over the last three weeks as those days kept holding.`
      : `The budget narrowed by ${hm(move.min)} over the last three weeks as those days kept dipping after.`;
  }
  if (!a.ready) return `${a.of} of ${MIN_EVALUATED} days evaluated. The readout arrives when three weeks have played out.`;
  if (a.missed) return `${a.missed} ${a.missed === 1 ? 'day' : 'days'} stayed under and still dipped after.`;
  return 'Every under-budget day so far has held.';
}

/* ------------------------------------------------------------------ */



export function BudgetSheet({ dk, budget }: { dk: string; budget: BudgetView; controls?: SheetControls }) {
  const p = usePalette();
  const isToday = dk === todayKey();
  const sub = isToday ? `${fmtDateLong(dk).split(',')[0]}, ${clock(nowMin())}` : fmtDateLong(dk);
  // A finished day the app never saw has nothing to break down, so the sheet
  // is the note and the reason, not four empty cards.
  const blank = budget.state === 'unknown';
  // `budget` is the view as it stood when the sheet opened, and the Connect
  // button lives inside this sheet: the card must leave the moment the grant
  // does, not the next time the sheet is opened.
  const stepsMiss = useStepsMissing(dk);

  return (
    <View style={{ paddingHorizontal: 2 }}>
      <View style={{ marginBottom: 14 }}>
        <Text style={{ fontSize: 21, fontWeight: '700', letterSpacing: -0.3, color: p.text }}>Pacing</Text>
        <Text style={{ fontSize: 13, color: p.textDim, marginTop: 2 }}>{sub}</Text>
      </View>
      {budget.stepsMissing && stepsMiss ? <StepsCard /> : null}
      {isToday ? <NotifyCard dk={dk} /> : null}
      {blank ? (
        <InsightCard title="That day" bg={p.sunk}>
          <Text style={{ fontSize: 13.5, lineHeight: 20, color: hexA(p.text, 0.78), marginTop: 2 }}>
            No pacing data for this day.
          </Text>
          <Text style={{ fontSize: 12.5, lineHeight: 18, color: p.textDim, marginTop: 8 }}>
            Nothing was logged and no health data was read, so there is no way to say what the day cost. Days before the pacing budget arrived mostly read this way.
          </Text>
        </InsightCard>
      ) : (
        <>
          <TodayCard dk={dk} budget={budget} />
          {budget.state !== 'suppressed' ? <SpendCard dk={dk} budget={budget} /> : null}
          <WhyCard dk={dk} budget={budget} />
        </>
      )}
      <AccuracyCard budget={budget} />
    </View>
  );
}

