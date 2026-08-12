/**
 * "How this was calculated" for the header's day-one claim.
 *
 * Follows the Claude Design comp 27f, and the note in that comp is the reason the
 * sheet looks the way it does: THE RED OUTLINED PANEL IS GONE. Red now marks only the
 * number that actually got worse, so this reads as an explanation rather than an
 * alarm. Somebody opening it has just been told they are worse than when they started;
 * a card wrapped in red would be the app agreeing that this is an emergency.
 *
 * The arc is the app's own `ScoreGauge`, the one the Journal's Outlook wears, with a
 * tick marking where the comparison began. One gauge for both places rather than a
 * second chart type that merely resembles it.
 *
 * The rest is `ScoreExplain`'s shape (the Outlook's "What powers this"): `SumCard`
 * sections of `MetricRow`s. What makes it honest rather than decorative is that the
 * parts ADD UP — the score is a weighted blend, so every row is one component's move
 * converted into points of the final score by its own weight, and a reader who
 * distrusts the headline can total the column.
 */
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ScoreGauge } from '../../components/charts';
import { Icon } from '../../components/Icon';
import { MetricRow, SumCard } from '../../components/summary';
import { useSheets } from '../../components/Sheet';
import { fmtMonthDay, todayKey } from '../../lib/dates';
import { fonts, radius, usePalette } from '../../theme';
import { getState } from '../../store/store';
import { resolveProtocol } from '../../lib/scoring/day';
import { demoState, hasOwnData } from '../../lib/demo';
import { insightsAnchor, setInsightsAnchor } from '../../lib/insights/anchorMemory';
import { changeSinceStart } from '../../lib/insights/watch';
import type { SinceStart } from '../../lib/insights';
import { Calendar } from '../Calendar';
import * as S from './style';
import { GOOD } from './style';

/** Points of the final score, signed, so a column of them reads as a ledger. */
const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)} pt`;

/**
 * Recompute the comparison for a given day one.
 *
 * Cheap enough to do on a tap: `changeSinceStart` scores only the earliest and latest
 * two weeks of logged days, 28 days regardless of journal length.
 */
function computeSince(anchor: string | null): SinceStart | null {
  const s = getState();
  const state = hasOwnData(s.days) ? s : demoState(s);
  const ctx = {
    sex: state.profile.sex,
    height: state.profile.height,
    protocol: resolveProtocol(state.settings.protocol),
    customTypes: state.customTypes,
  };
  return changeSinceStart(state.days, todayKey(), ctx, anchor);
}

export function SinceExplain({ since: initial, onAnchorChange }: {
  since: SinceStart;
  /** Called after the user picks a new day one, so the screen behind can rebuild. */
  onAnchorChange?: () => void;
}) {
  const p = usePalette();
  const { openSheet } = useSheets();

  /**
   * THIS SHEET OWNS THE LIVE VALUE, and has to.
   *
   * `Sheet.tsx` memoizes a sheet's content on the entry, deliberately — rebuilding it
   * would loop against `SheetFooter`'s own re-render. So a `since` passed in as a prop
   * is a snapshot frozen at the moment the sheet opened: picking a new day one rebuilt
   * the screen underneath and left every number in here unchanged, which looked like
   * the tap had done nothing at all.
   *
   * Since this sheet IS the editor for the comparison, it recomputes on pick and holds
   * the result. The parent is still notified, because the header behind needs it too.
   */
  const [since, setSince] = useState<SinceStart>(initial);
  const pick = (k: string) => {
    // Picking the day the default already uses means "go back to the default", so the
    // anchor is cleared rather than pinned to a value that happens to match today's.
    const next = k === since.fromKey ? null : k;
    setInsightsAnchor(next);
    // Null means the new anchor left too little to compare; keep what is on screen
    // rather than emptying the sheet the user is reading.
    const built = computeSince(next);
    if (built) setSince(built);
    onAnchorChange?.();
  };

  const flat = since.pct === 0;
  const color = flat ? p.textDim : since.better ? GOOD : p.accent;

  const helped = since.parts.filter((x) => x.delta > 0.05);
  const hurt = since.parts.filter((x) => x.delta < -0.05);
  const level = since.parts.filter((x) => Math.abs(x.delta) <= 0.05);

  /**
   * One component's contribution.
   *
   * The value is in the app's numeral face and coloured by direction, so the column
   * reads as a ledger you can total: green for what pushed the score up, accent for
   * what pulled it down, dim for anything that did neither. The row's own copy names
   * the day counts rather than saying "fortnight", which is exact but not how anyone
   * describes their own data.
   */
  const row = (x: SinceStart['parts'][number]) => {
    const dir = x.delta > 0.05 ? GOOD : x.delta < -0.05 ? p.accent : p.textDim;
    return (
      <MetricRow
        key={x.label}
        label={x.label}
        value={signed(x.delta)}
        valueColor={dir}
        valueNum
        cat={false}
        explain={`Graded ${Math.round(x.then)} out of 100 across your first ${since.thenN} days and ${Math.round(x.now)} across your last ${since.nowN}. It carries ${x.weight}% of the score, so that move is worth ${signed(x.delta)} of it.`}
      />
    );
  };

  return (
    <View>
      <Text style={{ fontSize: 20, fontWeight: '700', color: p.text, letterSpacing: -0.3, marginBottom: 16, maxWidth: '82%' }}>
        How this was calculated
      </Text>

      {/* The hero. A neutral card, per the comp: only the number that got worse is red.
          `p.surface2` is the fill `SumCard` uses for the "What improved" cards further
          down this same sheet, so every card here sits on one background. NOT
          `p.surface`, which is the sheet's own fill and left these reading as bare
          page. */}
      <View style={{ backgroundColor: p.surface2, borderColor: p.border, borderWidth: 1, borderRadius: radius.card, padding: 16, marginBottom: 10 }}>
        <View style={{ alignItems: 'center', marginBottom: 4 }}>
          <ScoreGauge score={Math.round(since.nowScore)} color={color} marker={{ score: Math.round(since.thenScore) }}>
            <Text style={{ fontSize: 44, fontWeight: '800', color: p.text, fontVariant: ['tabular-nums'], letterSpacing: -1, lineHeight: 48 }}>
              {Math.round(since.nowScore)}
            </Text>
            <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, color: p.textDim, marginTop: -2 }}>
              {`LAST ${since.nowN} DAYS`}
            </Text>
            {/* What the tick on the ring means, inside the gauge where there is room
                for it. Outside the ring there is not: the label would need its own
                width of clear space past the arc and clipped against the chart's box. */}
            <Text style={{ fontSize: 11.5, fontWeight: '600', color: p.textDim, marginTop: 5 }}>
              {`was ${Math.round(since.thenScore)}`}
            </Text>
          </ScoreGauge>
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
          <Figure value={String(Math.round(since.thenScore))} label={`First ${since.thenN} days`} />
          <Figure
            value={`${since.pct > 0 ? '+' : since.pct < 0 ? '−' : ''}${Math.abs(since.pct)}`}
            label={flat ? 'Points moved' : since.better ? 'Points gained' : 'Points lost'}
            color={flat ? undefined : color}
          />
        </View>

        {/* The verdict, at the size it deserves: this is the sentence the whole sheet
            exists to explain, and at 14pt it read as a caption on its own chart. */}
        <View style={{ borderTopWidth: 1, borderTopColor: p.border, paddingTop: 14 }}>
          <Text style={{ textAlign: 'center', fontSize: 18, fontWeight: '600', letterSpacing: -0.2 }}>
            <Text style={{ color, fontWeight: '800' }}>{since.value}</Text>
            <Text style={{ color: p.textDim }}>{since.tail}</Text>
          </Text>
        </View>
      </View>

      {/* What day one actually is, and how to move it. */}
      <View style={{ backgroundColor: p.surface2, borderColor: p.border, borderWidth: 1, borderRadius: radius.card, padding: 15, marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 13 }}>
          <View style={{ marginTop: 1 }}><Icon name="info" size={15} color={p.textDim} strokeWidth={2.1} /></View>
          <Text style={{ flex: 1, fontSize: 12.5, lineHeight: 19, color: p.textDim }}>
            {'Day one is '}
            <Text style={{ color: p.text, fontWeight: '600' }}>{fmtMonthDay(since.fromKey)}</Text>
            {insightsAnchor()
              ? `, which you chose. The comparison uses the ${since.thenN} scored days from there.`
              : `, the first of your ${since.thenN} earliest scored days.`}
          </Text>
        </View>
        <Pressable
          onPress={() => openSheet((c) => (
            <Calendar current={since.fromKey} onPick={pick} controls={c} />
          ), { fitContent: true })}
          accessibilityRole="button"
          // The same object the correlations card ends with ("Show all 6 correlations"):
          // `CARD_BUTTON` from ./style, so the one full-width action inside a card has
          // one treatment across the view. A calendar glyph beside the words only
          // repeated them.
          style={({ pressed }) => [
            S.CARD_BUTTON,
            { justifyContent: 'center', backgroundColor: p.surface, borderColor: p.border, marginTop: 0 },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Text style={[S.CARD_BUTTON_TEXT, { color: p.text }]}>Change comparison date</Text>
        </Pressable>
      </View>

      <Text style={{ color: p.textDim, fontSize: 13, lineHeight: 19, marginBottom: 16 }}>
        {`Your daily score is out of 100, so the difference between those two medians is stated in points: ${Math.abs(since.pct)} of them. The rows below are what moved, each one worth its own share of the score.`}
      </Text>

      {helped.length ? <SumCard title="What improved">{helped.map(row)}</SumCard> : null}
      {hurt.length ? <SumCard title="What slipped">{hurt.map(row)}</SumCard> : null}
      {level.length ? <SumCard title="About the same">{level.map(row)}</SumCard> : null}
      {!since.parts.length ? (
        <SumCard title="What moved">
          <MetricRow
            label="Not comparable yet"
            value=""
            cat={false}
            explain="No single input was scored on enough days at BOTH ends to compare on its own, so only the overall score can be. Logging the same handful of things consistently is what fills this in."
          />
        </SumCard>
      ) : null}

      <Text style={{ color: p.textDim, fontSize: 12, lineHeight: 18, marginTop: 4 }}>
        Only inputs present at both ends are listed. Something you started logging partway through has no earlier reading to be measured against, and counting it from zero would credit the whole of its weight to a change that is really just you starting to track it.
      </Text>
      <View style={{ height: 24 }} />
    </View>
  );
}

/** One of the two figures under the arc, in the app's stat-tile shape. */
function Figure({ value, label, color }: { value: string; label: string; color?: string }) {
  const p = usePalette();
  return (
    <View style={{ flex: 1, backgroundColor: p.bg, borderColor: p.border, borderWidth: 1, borderRadius: radius.card, paddingVertical: 12, paddingHorizontal: 13 }}>
      <Text style={{ fontSize: 21, fontFamily: fonts.numHeavy, color: color || p.textDim, fontVariant: ['tabular-nums'] }}>{value}</Text>
      <Text style={{ fontSize: 11.5, color: p.textDim, marginTop: 4 }}>{label}</Text>
    </View>
  );
}
