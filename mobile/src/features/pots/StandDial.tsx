/**
 * The stand test's shared furniture: the 15 minute dial and the cards that
 * stack over it. Used by the hand-entered test (ManualStandTest) and the
 * chest strap one (StandTestSession), so the same protocol looks like the same
 * test whichever way the heart rate arrives.
 *
 * The dial is one horseshoe, open at the top: grey for lying down, red for
 * standing, a dot at every moment the test stops for something.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { SheetFooter } from '../../components/Sheet';
import { Button, CautionNote } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { radius, usePalette } from '../../theme';

export const DIAL = 270;
/** How long the arc takes to catch up when the rest is ended early. The card
 *  for the next step is already rising; this only closes the gap behind it. */
export const SKIP_MS = 320;
const FILL_MS = 420;

export function Body({ children }: { children: string }) {
  const p = usePalette();
  return <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 20, marginBottom: 14 }}>{children}</Text>;
}

/** One stop on the dial: an empty ring that fills once the hand reaches it,
 *  and keeps a dark grey rim around its colour once it has. */
function StopDot({ x, y, r, filled, color }: { x: number; y: number; r: number; filled: boolean; color: string }) {
  const p = usePalette();
  // Driven from JS rather than an animated SVG prop: a dot that is already
  // reached has to be drawn filled on its very first frame, every time.
  const [t, setT] = useState(filled ? 1 : 0);
  useEffect(() => {
    if (!filled) { setT(0); return; }
    const start = Date.now();
    let raf = 0;
    const step = () => {
      const k = Math.min(1, (Date.now() - start) / FILL_MS);
      setT(1 - (1 - k) ** 3);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [filled]);
  return (
    <>
      <Circle cx={x} cy={y} r={r} fill={p.surface} stroke={filled ? p.border : p.textFaint} strokeWidth={2.5} />
      {t > 0 ? <Circle cx={x} cy={y} r={t * (r - 1.25)} fill={color} /> : null}
    </>
  );
}

/**
 * `stops` are the dots, in minutes of TEST time; the first is the end of the
 * lying-down stretch and the last the end of the test. `elapsedMin` is test
 * time too, `reached` how many stops the hand has got to.
 */
export function Dial({ stops, elapsedMin, reached, idle }: { stops: readonly number[]; elapsedMin: number; reached: number; idle?: boolean }) {
  const p = usePalette();
  const rest = stops[0], total = stops[stops.length - 1];
  const c = DIAL / 2, sw = 10, r = c - 16;
  const at = (m: number): [number, number] => {
    const a = ((230 - (m / total) * 280) * Math.PI) / 180;
    return [c + r * Math.cos(a), c + r * Math.sin(a)];
  };
  const arc = (from: number, to: number, color: string) => {
    if (to - from < 0.01) return null;
    const [x0, y0] = at(from), [x1, y1] = at(to);
    const large = ((to - from) / total) * 280 > 180 ? 1 : 0;
    return <Path d={`M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${large} 0 ${x1.toFixed(2)} ${y1.toFixed(2)}`} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" />;
  };
  const hand = !idle && elapsedMin > 0 && elapsedMin < total ? at(elapsedMin) : null;
  return (
    <Svg width={DIAL} height={DIAL} viewBox={`0 0 ${DIAL} ${DIAL}`}>
      {arc(0, total, p.surface2)}
      {arc(0, Math.min(elapsedMin, rest), p.textDim)}
      {arc(rest, Math.max(rest, elapsedMin), p.accent)}
      {stops.map((m, k) => {
        const [x, y] = at(m);
        return <StopDot key={m} x={x} y={y} r={sw * 0.85} filled={k < reached} color={k === 0 ? p.textDim : p.accent} />;
      })}
      {hand ? <Circle cx={hand[0]} cy={hand[1]} r={sw * 0.5} fill={p.text} /> : null}
    </Svg>
  );
}

/** The mark in the middle of the dial while the test waits on a card. */
export function PauseMark() {
  const p = usePalette();
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <View style={{ width: 12, height: 40, borderRadius: 4, backgroundColor: p.border }} />
      <View style={{ width: 12, height: 40, borderRadius: 4, backgroundColor: p.border }} />
    </View>
  );
}

/** A prompt card stacked over the dial. Tells the test when it has left the
 *  screen, answered or not, so a card closed with its ✕ can be raised again. */
export function Prompt({ onGone, children }: { onGone: () => void; children: React.ReactNode }) {
  const gone = useRef(onGone);
  gone.current = onGone;
  useEffect(() => () => gone.current(), []);
  return <View>{children}</View>;
}

export function PromptTitle({ children }: { children: string }) {
  const p = usePalette();
  // Right padding keeps a wrapping title clear of the floating ✕ pill.
  return <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 5, paddingRight: 52 }}>{children}</Text>;
}

const STAND_RULES = ['Stand still', 'Don’t walk around', 'Don’t lean on anything'];

export function StandCard({ onStanding }: { onStanding: () => void }) {
  const p = usePalette();
  return (
    <View>
      <PromptTitle>Time to stand up</PromptTitle>
      <Body>Tap the button the moment you are upright.</Body>
      <View style={{ backgroundColor: p.sunk, borderRadius: radius.card, borderCurve: 'continuous', paddingHorizontal: 14, marginBottom: 16 }}>
        {STAND_RULES.map((text, k) => (
          <View key={text} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, height: 44, borderTopWidth: k ? 1 : 0, borderTopColor: p.border }}>
            <View style={{ width: 24, height: 24, borderRadius: 999, backgroundColor: p.accentSoft, borderWidth: 1, borderColor: p.accent, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="check" size={13} color={p.accent} strokeWidth={3} />
            </View>
            <Text style={{ color: p.text, fontSize: 14.5, fontWeight: '600' }}>{text}</Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row' }}>
        <Button title="I'm standing" variant="primary" onPress={onStanding} />
      </View>
    </View>
  );
}

export interface IntroStep { title: string; time: string; sub: string }

/** The first view of either test: what is about to happen, in numbered steps. */
export function StandIntro({ steps, onStart }: { steps: IntroStep[]; onStart: () => void }) {
  const p = usePalette();
  return (
    <View>
      <Text style={{ fontSize: 24, fontWeight: '700', color: p.text, marginBottom: 10, paddingRight: 52 }}>POTS standing test</Text>
      <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, height: 28, paddingHorizontal: 11, borderRadius: 999, backgroundColor: p.surface2, marginBottom: 10 }}>
        <Icon name="clock" size={14} color={p.textDim} />
        <Text style={{ color: p.textDim, fontSize: 12.5, fontWeight: '600' }}>About 15 minutes</Text>
      </View>
      <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 20, marginBottom: 18 }}>See how much your heart rate rises when you go from lying down to standing.</Text>
      <View style={{ backgroundColor: p.sunk, borderWidth: 1, borderColor: p.border, borderRadius: radius.card, borderCurve: 'continuous', paddingTop: 18, paddingHorizontal: 16, paddingBottom: 4, marginBottom: 14 }}>
        {steps.map((s, k) => (
          <View key={s.title} style={{ flexDirection: 'row', gap: 14 }}>
            <View style={{ width: 30, alignItems: 'center' }}>
              <View style={{ width: 30, height: 30, borderRadius: 999, borderWidth: 2.5, borderColor: p.textDim, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: p.text, fontSize: 14, fontWeight: '700' }}>{k + 1}</Text>
              </View>
              {k < steps.length - 1 ? <View style={{ flex: 1, width: 2, borderRadius: 2, backgroundColor: p.surface2, marginVertical: 5 }} /> : null}
            </View>
            <View style={{ flex: 1, minWidth: 0, paddingTop: 4, paddingBottom: 18 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <Text style={{ color: p.text, fontSize: 16, fontWeight: '700' }}>{s.title}</Text>
                <View style={{ height: 24, paddingHorizontal: 9, borderRadius: 999, backgroundColor: p.surface2, justifyContent: 'center' }}>
                  <Text style={{ color: p.textDim, fontSize: 12, fontWeight: '700' }}>{s.time}</Text>
                </View>
              </View>
              <Text style={{ color: p.textDim, fontSize: 13, lineHeight: 19, marginTop: 5 }}>{s.sub}</Text>
            </View>
          </View>
        ))}
      </View>
      <CautionNote text="Stand near a wall. Sit down and stop if you feel faint." />
      <SheetFooter>
        <Button title="Start" variant="primary" onPress={onStart} />
      </SheetFooter>
    </View>
  );
}
