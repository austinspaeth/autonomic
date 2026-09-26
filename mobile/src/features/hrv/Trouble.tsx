/**
 * "Let's get you a cleaner reading" — the card that exists because the app had
 * nothing to say to somebody whose readings keep failing.
 *
 * It is raised two ways, and the fact that it is the SAME card both ways is the
 * point: one place to maintain the advice, one thing for the user to recognise.
 *
 *  - BY THE APP, when `hopelessCoverage` works out mid-reading that this
 *    attempt cannot reach the bar (`stopReason: 'signal'`). This is the half
 *    that matters. A frustrated user 90 seconds into their fourth attempt is
 *    not hunting for a help affordance, and the app already knew.
 *  - BY THE USER, from the `Having trouble?` link on the reading card, or from
 *    the results card when a finished reading came out unusable.
 *
 * The lead tip is chosen from what the capture actually did (`ppgTrace` knows
 * the difference between "the lens never read as covered" and "the pulse locked
 * and kept being lost"), and the rest follow in the fixed order — see
 * `lib/ppg/tips.ts`, where the ordering argument lives.
 *
 * What it does NOT do: offer a "less strict" mode. A setting flipped once in
 * frustration silently degrades every reading afterwards, and the trends and
 * insights engines would go on building claims about somebody's body out of the
 * result — with nobody remembering it was set. The forgiving half of this work
 * is per-reading instead, on the reading in front of the user, with the number
 * visible: `Results.tsx`'s Save anyway.
 */
import React from 'react';
import { Text, View } from 'react-native';
import { SheetControls } from '../../components/Sheet';
import { Button } from '../../components/ui';
import { usePalette } from '../../theme';
import { ppgTrace } from '../../lib/ppg/diagnostics';
import { leadTipId, tipsFor, troubleSourceFor, type TroubleEvidence, type TroubleSource } from '../../lib/ppg/tips';
import type { SessionConfig } from './sessionStore';
import { StrapCard } from './StrapCard';
import { SupportCard } from '../SupportCard';

/** What the attempt showed, read off the camera trace. Reads, never requests —
 *  the same rule the diagnostics collector follows. */
export function troubleEvidence(source: TroubleSource): TroubleEvidence {
  if (source !== 'camera') return {};
  try {
    const t = ppgTrace.snapshot();
    return { frames: t.frames, fingerOn: t.fingerOn, everLocked: t.reached['pulse-locked'] != null };
  } catch {
    // An unreadable trace is no evidence, which `leadTipId` already treats as
    // "use the fixed order" rather than as a fact about the finger.
    return {};
  }
}

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.max(0, Math.round(sec % 60))).padStart(2, '0')}`;

export function TroubleSheet({ config, stopped, onRetry, controls }: {
  config: SessionConfig;
  /**
   * Present when the app stopped the reading itself. It carries what we saw,
   * because "we stopped at 0:48 and only 14 seconds of your pulse came through"
   * is the difference between the app explaining itself and the app just
   * giving up on somebody.
   */
  stopped?: { elapsedSec: number; usableSec: number } | null;
  /**
   * What "Try again" does, supplied by whoever raised the card.
   *
   * Injected rather than imported. This card would otherwise have to reach for
   * `openCapture` in ./Setup, which imports ./CameraSetup, which imports this
   * card — a require cycle, and the kind that works right up until a bundler
   * evaluates the modules in the other order. It is also genuinely different
   * per caller: from the camera setup card the user is ALREADY on the placement
   * screen and a retry just dismisses the tips, while from a finished reading
   * it has to open a whole new capture.
   *
   * Absent means there is nothing to retry, and the card says "Done" instead.
   */
  onRetry?: () => void;
  controls: SheetControls;
}) {
  const p = usePalette();
  const source = troubleSourceFor(config.source) ?? 'camera';
  const evidence = troubleEvidence(source);
  const tips = tipsFor(source, evidence);
  // Which tip the EVIDENCE chose, as opposed to whichever happens to sit first
  // in the fixed order. Only an evidence-chosen lead earns the label below:
  // "most likely" is a claim about this attempt, and saying it about a default
  // would be inventing a diagnosis.
  const lead = leadTipId(source, evidence);

  return (
    <View>
      <Text style={{ fontSize: 23, fontWeight: '800', color: p.text, marginBottom: 6 }}>
        {stopped ? 'We stopped the reading' : 'Getting a cleaner reading'}
      </Text>
      <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 20, marginBottom: 18 }}>
        {stopped
          ? `Stopped at ${mmss(stopped.elapsedSec)}. Only ${mmss(stopped.usableSec)} of your pulse was coming through clearly, so the rest of the time would not have produced a reading. Nothing was saved.`
          : source === 'camera'
            ? 'A fingertip reading is the fussiest thing this app does. These are the things that actually change it, in the order they are usually the problem.'
            : 'A strap that is on properly is the most accurate reading you can take. These are the things worth checking.'}
      </Text>

      {source === 'camera' ? (
        <View style={{ marginBottom: 18 }}>
          <StrapCard>
            A strap reads your heartbeat electrically and skips every problem below. The Coospo H808S is under $30 on Amazon.
          </StrapCard>
        </View>
      ) : null}

      <View style={{ gap: 10, marginBottom: 20 }}>
        {tips.map((t, i) => (
          <View
            key={t.id}
            style={{
              backgroundColor: p.sunk, borderRadius: 16, padding: 14,
              flexDirection: 'row', gap: 12, alignItems: 'flex-start',
            }}
          >
            {/* Every row is numbered, including the first. The lead used to
                wear an alert mark instead of its number, which broke the one
                thing the list is — an ordered set of things to try — and read
                as a warning about the tip rather than as a rank. What the
                evidence chose is said in WORDS beside the title, which is also
                the only form in which it can be honest about being a guess. */}
            <View style={{
              width: 24, height: 24, borderRadius: 999, alignItems: 'center', justifyContent: 'center',
              backgroundColor: p.surface2, marginTop: 1,
            }}>
              <Text style={{ color: p.textDim, fontSize: 12, fontWeight: '800' }}>{i + 1}</Text>
            </View>
            <View style={{ flex: 1 }}>
      {/* flex-start, not center: a title long enough to wrap would otherwise
          float the pill to the middle of a two-line block. It belongs beside
          the first line. */}
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 7, marginBottom: 3 }}>
                <Text style={{ color: p.text, fontSize: 15, fontWeight: '700', flexShrink: 1 }}>{t.title}</Text>
                {t.id === lead ? (
                  <View style={{ backgroundColor: p.accentSoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, marginTop: 2 }}>
                    <Text style={{ color: p.accent, fontSize: 10.5, fontWeight: '800', letterSpacing: 0.2 }}>MOST LIKELY</Text>
                  </View>
                ) : null}
              </View>
              <Text style={{ color: p.textDim, fontSize: 13, lineHeight: 19 }}>{t.body}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={{ marginBottom: 20 }}>
        <SupportCard prompt="If you continue to have issues, please contact us for help." style={{ marginTop: 0 }} />
      </View>

      <View style={{ gap: 10 }}>
        {onRetry ? (
          <>
            <Button title="Try again" variant="primary" onPress={onRetry} />
            <Button title="Not now" variant="ghost" onPress={() => controls.closeAll()} />
          </>
        ) : (
          <Button title="Got it" variant="primary" onPress={() => controls.close()} />
        )}
      </View>
    </View>
  );
}
