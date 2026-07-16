/**
 * Copyable AI-prompt sheet shared by the Insights reports and the Outlook
 * downturn investigation: title, character count, the full prompt in a
 * monospace box, and pinned Share / Copy actions with the AI disclaimer.
 */
import React from 'react';
import { Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { Icon } from '../components/Icon';
import { Button } from '../components/ui';
import { SheetControls, SheetFooter } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { radius, usePalette } from '../theme';

export function PromptSheet({ title, rangeText, prompt, controls, subtitle }: { title: string; rangeText: string; prompt: string; controls: SheetControls; subtitle?: string }) {
  const p = usePalette();
  const toast = useToast();
  const copy = async () => {
    await Clipboard.setStringAsync(prompt);
    controls.close();
    toast('Copied to clipboard');
  };
  const share = async () => {
    const uri = `${FileSystem.cacheDirectory}autonomic-report.txt`;
    try {
      await FileSystem.writeAsStringAsync(uri, prompt);
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'text/plain', dialogTitle: title });
    } catch { toast('Share failed'); }
    finally {
      // The report contains the user's health data in plaintext; don't leave it in cache.
      await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
    }
  };
  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text }}>{title}</Text>
      <Text style={{ color: p.textDim, fontSize: 14, marginTop: 4 }}>{subtitle || 'Copy this prompt and paste it into Claude, ChatGPT, Gemini, or your AI of choice.'}</Text>
      <Text style={{ color: p.textDim, fontSize: 12, marginTop: 6, marginBottom: 10, fontVariant: ['tabular-nums'] }}>{`${rangeText} · ${prompt.length.toLocaleString()} characters`}</Text>
      <View style={{ backgroundColor: p.surface2, borderColor: p.border, borderWidth: 1, borderRadius: radius.control, padding: 12 }}>
        <Text selectable style={{ color: p.text, fontFamily: 'Menlo', fontSize: 11, lineHeight: 16 }}>{prompt}</Text>
      </View>
      {/* Extra tail room: the pinned footer (disclaimer + buttons) is taller than
          the sheet's default footer clearance. */}
      <View style={{ height: 70 }} />
      {/* Copy/Share stay pinned in the sheet's fixed footer so they're always in
          view, with the AI disclaimer riding directly above them. */}
      <SheetFooter>
        <View style={{ flex: 1 }}>
          {!subtitle ? (
            <View style={{ flexDirection: 'row', gap: 9, alignItems: 'flex-start', backgroundColor: p.surface2, borderColor: p.border, borderWidth: 1, borderRadius: radius.control, padding: 10, marginBottom: 10 }}>
              <View style={{ marginTop: 1 }}><Icon name="info" size={15} color={p.textDim} /></View>
              <Text style={{ flex: 1, color: p.textDim, fontSize: 11.5, lineHeight: 16 }}>
                Any analysis or advice comes from the AI service you paste this into. Autonomic only assembles your logged data. Talk to your doctor before acting on its suggestions.
              </Text>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button title="Share" variant="ghost" onPress={share} />
            <Button title={subtitle ? 'Copy data' : 'Copy prompt'} variant="primary" onPress={copy} />
          </View>
        </View>
      </SheetFooter>
    </View>
  );
}
