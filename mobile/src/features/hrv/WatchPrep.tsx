/**
 * Apple Watch prep card — stacked over the setup sheet when the watch source
 * is chosen (training or baseline). Walks the wearer through getting the
 * Mindfulness app ready on the watch: open it, make sure Breathe is set to
 * 5 minutes, then tap Breathe on the watch and the red Start button here in
 * the same moment. That Start doubles as the session card's start — this card
 * closes and HrvSession rises already running, so the watch and the in-app
 * timer stay in step. The ✕ drops back to the setup sheet underneath.
 */
import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { SheetControls, SheetFooter, useSheets } from '../../components/Sheet';
import { Button } from '../../components/ui';
import { radius, usePalette } from '../../theme';
import { health } from '../../lib/health';
import { requestEcgAuth } from '../../lib/health/ecg';
import { HrvSession, type SessionConfig } from './Session';

/** The watchOS Mindfulness app icon, near enough to recognize on the wrist:
 *  a teal circle with the eight-petal Breathe flower. */
function MindfulnessIcon({ size = 72 }: { size?: number }) {
  const c = size / 2;
  const ring = size * 0.16; // petal centers sit on this ring
  const petal = size * 0.19;
  return (
    <Svg width={size} height={size}>
      <Defs>
        <LinearGradient id="mindfulBg" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#35dcc8" />
          <Stop offset="1" stopColor="#0d9c8c" />
        </LinearGradient>
      </Defs>
      <Circle cx={c} cy={c} r={c} fill="url(#mindfulBg)" />
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return (
          <Circle
            key={i}
            cx={c + ring * Math.cos(a)}
            cy={c + ring * Math.sin(a)}
            r={petal}
            fill="#eafffb"
            opacity={0.42}
          />
        );
      })}
    </Svg>
  );
}

const STEPS: { title: string; sub: string }[] = [
  {
    title: 'Open Mindfulness on your Apple Watch',
    sub: 'The teal app with the flower icon, shown above.',
  },
  {
    title: 'Check that Breathe says 5 MIN',
    sub: 'If it doesn’t, tap the three dots next to Breathe and set the duration to 5 minutes.',
  },
  {
    title: 'Tap Breathe, then Start below',
    sub: 'Start both together, then sit still through the whole reading.',
  },
];

export function WatchPrep({ config, controls }: { config: SessionConfig; controls: SheetControls }) {
  const p = usePalette();
  const { openSheet } = useSheets();

  // Any Health permission sheet must appear NOW, while the wearer reads the
  // prep steps — never over the waiting card after a finished 5-minute
  // reading. Sequential (two sheets must not race); silent once determined.
  useEffect(() => {
    void (async () => {
      await health().requestAuth();
      await requestEcgAuth();
    })();
  }, []);

  // Start here = start on the watch: open the session card already running and
  // let this card fall away beneath it.
  const start = () => {
    openSheet((c) => <HrvSession config={config} autoStart controls={c} />, { hideClose: true });
    controls.close();
  };

  return (
    <View style={{ alignItems: 'center', paddingTop: 8 }}>
      <MindfulnessIcon />
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginTop: 14, textAlign: 'center' }}>
        Get your watch ready
      </Text>
      <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 20, textAlign: 'center', paddingHorizontal: 12, marginTop: 6, marginBottom: 18 }}>
        The reading itself is taken by the Mindfulness app on your watch and syncs in here when it finishes.
      </Text>

      <View style={{ alignSelf: 'stretch', gap: 8 }}>
        {STEPS.map((s, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 12, padding: 14, borderRadius: radius.control, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface2 }}>
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: p.accentSoft, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
              <Text style={{ color: p.accent, fontWeight: '800', fontSize: 13 }}>{i + 1}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: p.text, fontWeight: '700' }}>{s.title}</Text>
              <Text style={{ color: p.textDim, fontSize: 12, lineHeight: 17, marginTop: 4 }}>{s.sub}</Text>
            </View>
          </View>
        ))}
      </View>

      <SheetFooter>
        {/* Red like the watch's own start control — pressed in the same moment
            as Breathe on the wrist. */}
        <Button title="Start" variant="danger" onPress={start} />
      </SheetFooter>
    </View>
  );
}
