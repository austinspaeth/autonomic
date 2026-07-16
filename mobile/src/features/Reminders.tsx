/**
 * Morning-reminder opt-in, shared by the welcome wizard's last step and the
 * Settings list. Both surfaces are the same interaction — a checkbox that opens
 * a time picker on the way on, and cancels the schedule on the way off — so the
 * behavior lives in `useReminderToggle()` and only the chrome differs (the
 * wizard paints itself in its own dark palette).
 */
import React, { useState } from 'react';
import { Alert, Linking, Pressable, Text, View } from 'react-native';
import Animated, { Easing, interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { TimePickerSheet } from '../components/Field';
import { Icon } from '../components/Icon';
import { useSheets } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { fmtTime12 } from '../lib/dates';
import { DEFAULT_REMINDER_TIME, canAskForReminders, disableReminder, enableReminder } from '../lib/reminders';
import { usePalette } from '../theme';
import { useAppState } from '../store/store';

const PICKER_NOTE = 'Pick a time you are usually awake but still resting, before coffee or exercise. Readings taken under the same conditions each day are the ones you can actually compare.';

export const REMINDER_TITLE = 'Morning reminder';
/** Wizard card while it's still off: an invitation, not a label. Once it's on,
 *  the card states the fact (REMINDER_TITLE + the time) instead. */
export const REMINDER_SETUP_TITLE = 'Set up morning reminder';
/** Kept to a single line — the wizard card is tight, and the full reasoning
 *  lives in PICKER_NOTE once they open the picker. */
export const REMINDER_BLURB = 'Same time daily, accurate baseline.';

/** Reminder state + the shared check/uncheck flow. */
export function useReminderToggle() {
  const state = useAppState();
  const { openSheet } = useSheets();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const r = state.settings.reminder;
  const on = !!r?.enabled;
  const time = r?.time || DEFAULT_REMINDER_TIME;

  const toggle = async () => {
    if (busy) return;
    if (on) {
      await disableReminder();
      toast('Morning reminder off');
      return;
    }
    // A previous "Don't Allow" can't be re-prompted, so don't open a time
    // picker that could only end in failure — send them to system settings.
    if (!(await canAskForReminders())) {
      Alert.alert(
        'Notifications are off',
        'Autonomic needs notification permission to remind you. You can turn it on in system settings.',
        [{ text: 'Not now', style: 'cancel' }, { text: 'Open Settings', onPress: () => Linking.openSettings() }],
      );
      return;
    }
    openSheet(
      (c) => (
        <TimePickerSheet
          label={REMINDER_TITLE}
          note={PICKER_NOTE}
          value={time}
          onChange={async (t) => {
            setBusy(true);
            const ok = await enableReminder(t);
            setBusy(false);
            toast(ok ? `Reminder set for ${fmtTime12(t)}` : 'Notification permission denied');
          }}
          controls={c}
        />
      ),
      { fitContent: true },
    );
  };

  return { on, time, toggle };
}

/** Animated checkbox. `tone` lets the wizard pass its own darker palette. */
export function CheckBox({ on, tone }: { on: boolean; tone: { accent: string; border: string } }) {
  const t = useSharedValue(on ? 1 : 0);
  React.useEffect(() => { t.value = withTiming(on ? 1 : 0, { duration: 200, easing: Easing.out(Easing.cubic) }); }, [on, t]);
  const boxStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(t.value, [0, 1], ['rgba(0,0,0,0)', tone.accent]),
    borderColor: interpolateColor(t.value, [0, 1], [tone.border, tone.accent]),
  }));
  const checkStyle = useAnimatedStyle(() => ({ opacity: t.value, transform: [{ scale: 0.5 + 0.5 * t.value }] }));
  return (
    <Animated.View style={[{ width: 22, height: 22, borderRadius: 7, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, boxStyle]}>
      <Animated.View style={checkStyle}>
        <Icon name="check" size={14} color="#fff" strokeWidth={3} />
      </Animated.View>
    </Animated.View>
  );
}

/** Settings-list row: matches the neighboring rows, with a trailing checkbox
 *  instead of a status pill. */
export function ReminderRow() {
  const p = usePalette();
  const { on, time, toggle } = useReminderToggle();
  return (
    <Pressable
      onPress={toggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15, borderTopWidth: 1, borderTopColor: p.border }, pressed && { opacity: 0.5 }]}
    >
      <Icon name="bell" size={22} color={p.textDim} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: p.text, fontSize: 17 }}>Reminders</Text>
        <Text style={{ color: p.textDim, fontSize: 13 }}>
          {on ? `Every morning at ${fmtTime12(time)}` : 'Daily nudge to take your reading'}
        </Text>
      </View>
      <CheckBox on={on} tone={{ accent: p.accent, border: p.border }} />
    </Pressable>
  );
}
