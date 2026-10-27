/**
 * The cycle ring: the one new visual this feature brings, a small ring split
 * into the four phases wherever phase is CONTEXT (the Journal chip, the cycle
 * row, the history sheet). Neutral white at four strengths, never a hue: every
 * colour in the app is already a grade, and a luteal arc beside a Moderate pill
 * must not read as one.
 *
 * Arcs are sized from this person's own cycle (median length, median period)
 * when the model has them, and a dot marks where today sits. With no phase to
 * place (irregular mode, contraception, a day before the first period) the
 * ring is drawn without the dot rather than guessing a position.
 */
import React from 'react';
import Svg, { Circle } from 'react-native-svg';
import type { CycleModel } from '../../lib/cycle';
import { LUTEAL_DAYS, OVULATORY_HALF_WIDTH } from '../../lib/cycle';

/** Phase band strengths, from the design's phase treatment. */
export const PHASE_ALPHA = { menstrual: 0.66, follicular: 0.16, ovulatory: 0.4, luteal: 0.27 } as const;

export function CycleRing({ model, dk, size = 14, stroke = 1.8, periodColor, dotDay, gapRatio = 0.035 }: {
  model: CycleModel | null; dk?: string; size?: number; stroke?: number;
  /** Draw the period arc in this colour instead of white (the Journal's Cycle
   *  card uses the accent red there). */
  periodColor?: string;
  /** Place the dot on this cycle day instead of asking the model (the
   *  faked import preview). */
  dotDay?: number;
  /** The gap between arcs, as a share of the circumference. */
  gapRatio?: number;
}) {
  const len = Math.max(21, Math.round(model?.prediction?.cycleLength ?? model?.stats.medianLength ?? 28));
  const period = Math.min(len - 10, Math.max(3, Math.round(model?.stats.medianPeriod ?? 5)));
  const ovStart = len - LUTEAL_DAYS - OVULATORY_HALF_WIDTH;
  const segs = [
    { days: period, a: periodColor ? 1 : PHASE_ALPHA.menstrual, color: periodColor },
    { days: Math.max(1, ovStart - period), a: PHASE_ALPHA.follicular },
    { days: OVULATORY_HALF_WIDTH * 2 + 1, a: PHASE_ALPHA.ovulatory },
    { days: Math.max(1, len - ovStart - (OVULATORY_HALF_WIDTH * 2 + 1)), a: PHASE_ALPHA.luteal },
  ];
  const total = segs.reduce((s, x) => s + x.days, 0);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const gap = c * gapRatio;
  const ph = dk && model ? model.phaseOn(dk) : null;
  const day = dotDay ?? ph?.day;
  const showDot = dotDay != null || (!!ph?.phase && model?.mode !== 'contraception');
  const angle = showDot ? ((Math.min(day!, len) - 0.5) / len) * 2 * Math.PI - Math.PI / 2 : 0;
  const onPeriod = !!periodColor && ph?.phase === 'menstrual';
  let at = 0;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {segs.map((s, i) => {
        const arc = (s.days / total) * c;
        const el = (
          <Circle
            key={i}
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke={(s as { color?: string }).color || '#fff'} strokeOpacity={s.a} strokeWidth={stroke}
            strokeDasharray={`${Math.max(0.5, arc - gap)} ${c}`}
            strokeDashoffset={-at}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        );
        at += arc;
        return el;
      })}
      {showDot ? (
        <Circle cx={size / 2 + r * Math.cos(angle)} cy={size / 2 + r * Math.sin(angle)} r={stroke * 0.95}
          fill={onPeriod ? periodColor : '#fff'}
          // The arc's own red, set apart from it by a thin black ring.
          // A large ring outlines the white dot in black, the design's hero
          // treatment; small chips keep the plain dot.
          stroke={onPeriod || size >= 40 ? '#000' : undefined}
          strokeWidth={onPeriod ? stroke * 0.2 : size >= 40 ? stroke * 0.55 : 0} />
      ) : null}
    </Svg>
  );
}
