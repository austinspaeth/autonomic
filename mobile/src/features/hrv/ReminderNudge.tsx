/**
 * The morning-reminder offer at the top of the reading-complete card.
 *
 * A reading just landed, which is the one moment "take it at the same time
 * each morning" is self-evidently true rather than a setting nobody opens. The
 * time is pre-filled from the reading the user just took (rounded to the
 * quarter hour) so the common case is one tap, and the chip beside it opens the
 * ordinary time picker for anything else.
 *
 * Pacing lives in src/lib/reminderNudge.ts: first ✕ buys ten readings of
 * silence, second ✕ retires it. Deciding + counting happens in the caller
 * (Results.tsx) so the count advances once per reading, not once per render.
 */
import React, { useState } from 'react';
import { Alert, Linking, Pressable, Text, View } from 'react-native';
import { Section } from '../../components/summary';
import { TimePickerSheet } from '../../components/Field';
import { Icon } from '../../components/Icon';
import { useSheets } from '../../components/Sheet';
import { Button } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { fmtTime12 } from '../../lib/dates';
import { canAskForReminders, enableReminder } from '../../lib/reminders';
import { usePalette } from '../../theme';

const BLURB = 'A single reading is a snapshot. Taken at the same time each morning, before coffee or movement, they become a trend you can actually read.';

export function ReminderNudgeCard({ initialTime, onDismiss, onEnabled }: {
  initialTime: string;
  onDismiss: () => void;
  /** The reminder is armed — the caller hides the card. */
  onEnabled: () => void;
}) {
  const p = usePalette();
  const toast = useToast();
  const { openSheet } = useSheets();
  const [time, setTime] = useState(initialTime);
  const [busy, setBusy] = useState(false);

  const arm = async (t: string) => {
    if (busy) return;
    // A previous "Don't Allow" can't be re-prompted, so don't start a flow that
    // could only end in failure (the same guard the Notifications view uses).
    if (!(await canAskForReminders())) {
      Alert.alert(
        'Notifications are off',
        'Autonomic needs notification permission to remind you. You can turn it on in system settings.',
        [{ text: 'Not now', style: 'cancel' }, { text: 'Open Settings', onPress: () => Linking.openSettings() }],
      );
      return;
    }
    setBusy(true);
    const ok = await enableReminder(t);
    setBusy(false);
    // Toasts are invisible from inside a sheet, so say it where it can be seen:
    // success closes the card, failure leaves it up with the reason inline.
    if (ok) { toast(`Reminder set for ${fmtTime12(t)}`); onEnabled(); }
    else Alert.alert('Notification permission denied', 'The reminder was not set.');
  };

  return (
    <Section>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
        <Icon name="bell" size={20} color={p.text} />
        <Text style={{ flex: 1, fontSize: 18, fontWeight: '800', color: p.text }}>One reading a day, same time</Text>
        <Pressable onPress={onDismiss} hitSlop={12} accessibilityLabel="Dismiss" style={({ pressed }) => [pressed && { opacity: 0.5 }]}>
          <Icon name="x" size={18} color={p.textDim} />
        </Pressable>
      </View>
      <Text style={{ color: p.textDim, fontSize: 14.5, lineHeight: 21, marginTop: 8 }}>{BLURB}</Text>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
        <Button title="Remind me daily" variant="primary" disabled={busy} onPress={() => void arm(time)} />
        <Button
          title={fmtTime12(time)}
          icon="clock"
          style={{ flex: 0, paddingHorizontal: 16 }}
          onPress={() => openSheet(
            (c) => (
              <TimePickerSheet
                label="Morning reminder"
                note="Pick a time you are usually awake but still resting, before coffee or exercise. Readings taken under the same conditions each day are the ones you can actually compare."
                value={time}
                onChange={setTime}
                controls={c}
              />
            ),
            { fitContent: true },
          )}
        />
      </View>
    </Section>
  );
}
