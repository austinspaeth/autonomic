/**
 * The "viewing demo data" notice that sits above the sample month on Progress
 * and Insights while the journal is empty (see src/lib/demo.ts).
 *
 * It has two jobs: make sure nobody mistakes the sample month for their own
 * numbers, and give them the one action that ends it. So it says "demo data" in
 * the title before any explanation, carries an accent rule down its edge, and
 * closes with a button straight to the Journal.
 */
import React from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button } from '../components/ui';
import { radius, usePalette } from '../theme';

export function DemoBanner({ text }: { text: string }) {
  const p = usePalette();
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: p.surface,
        borderColor: p.border,
        borderWidth: 1,
        borderRadius: radius.card,
        overflow: 'hidden',
        marginBottom: 14,
      }}
    >
      <View style={{ width: 4, backgroundColor: p.accent }} />
      <View style={{ flex: 1, padding: 14 }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: p.text }}>You&apos;re viewing demo data</Text>
        <Text style={{ fontSize: 13, lineHeight: 19, color: p.textDim, marginTop: 4 }}>{text}</Text>
        {/* The shared Button, unstretched: it lays out flex:1 for a footer row. */}
        <Button
          title="Start logging"
          variant="primary"
          onPress={() => router.navigate('/')}
          style={{ flex: 0, alignSelf: 'flex-start', paddingHorizontal: 22, paddingVertical: 11, marginTop: 12 }}
        />
      </View>
    </View>
  );
}

/** Progress view copy. */
export const DEMO_PROGRESS_TEXT =
  'An example month, so you can see what this view looks like with some history behind it. Start logging your days in the Journal and these charts fill in with your own numbers, so you can watch your trends and work out what your body responds to.';

/** Insights view copy. */
export const DEMO_INSIGHTS_TEXT =
  'An example month, so you can see what your reports look like with some history behind them. Start logging your days in the Journal and every report here is built from your own numbers.';
