/**
 * Notification opt-ins. The daily-reminder toggle is shared by the welcome
 * wizard's last step and the Notifications view — the same interaction (a
 * checkbox that opens a time picker on the way on, and cancels the schedule on
 * the way off), so the behavior lives in `useReminderToggle()` and only the
 * chrome differs (the wizard paints itself in its own dark palette). Settings
 * links here through `NotificationsRow`, which opens `NotificationsSheet`:
 * the daily reminder plus the crash warning.
 */
import React, { useState } from 'react';
import { Alert, Linking, Pressable, Text, View } from 'react-native';
import Animated, { Easing, interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { TimePickerSheet } from '../components/Field';
import { Icon, IconName } from '../components/Icon';
import { useSheets } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { fmtTime12 } from '../lib/dates';
import { DEFAULT_REMINDER_TIME, canAskForReminders, disableReminder, enableReminder, setCrashAlert } from '../lib/reminders';
import { usePalette } from '../theme';
import { useAppState } from '../store/store';

const PICKER_NOTE = 'Pick a time you are usually awake but still resting, before coffee or exercise. Readings taken under the same conditions each day are the ones you can actually compare.';

/** A previous "Don't Allow" can't be re-prompted, so don't start a flow that
 *  could only end in failure — send them to system settings instead. Shared by
 *  both opt-ins. */
async function guardCanAsk(): Promise<boolean> {
  if (await canAskForReminders()) return true;
  Alert.alert(
    'Notifications are off',
    'Autonomic needs notification permission to notify you. You can turn it on in system settings.',
    [{ text: 'Not now', style: 'cancel' }, { text: 'Open Settings', onPress: () => Linking.openSettings() }],
  );
  return false;
}

export const REMINDER_TITLE = 'Daily reminder';
/** Wizard card while it's still off: an invitation, not a label. Once it's on,
 *  the card states the fact (REMINDER_TITLE + the time) instead. */
export const REMINDER_SETUP_TITLE = 'Set up daily reminder';
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
      toast('Daily reminder off');
      return;
    }
    if (!(await guardCanAsk())) return;
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

/** Crash-warning state + check/uncheck flow, same shape as useReminderToggle.
 *  No time to pick — enabling is permission + persist. */
export function useCrashAlertToggle() {
  const state = useAppState();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const on = !!state.settings.crashAlert?.enabled;

  const toggle = async () => {
    if (busy) return;
    if (on) {
      await setCrashAlert(false);
      toast('Crash warnings off');
      return;
    }
    if (!(await guardCanAsk())) return;
    setBusy(true);
    const ok = await setCrashAlert(true);
    setBusy(false);
    toast(ok ? 'Crash warnings on' : 'Notification permission denied');
  };

  return { on, toggle };
}

/** One opt-in row in the Notifications view: icon + title/sub + checkbox, the
 *  same silhouette as the Settings list rows. */
function NotifRow({ icon, title, sub, on, onToggle }: { icon: IconName; title: string; sub: string; on: boolean; onToggle: () => void }) {
  const p = usePalette();
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15, borderTopWidth: 1, borderTopColor: p.border }, pressed && { opacity: 0.5 }]}
    >
      <Icon name={icon} size={22} color={p.textDim} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: p.text, fontSize: 17 }}>{title}</Text>
        <Text style={{ color: p.textDim, fontSize: 13 }}>{sub}</Text>
      </View>
      <CheckBox on={on} tone={{ accent: p.accent, border: p.border }} />
    </Pressable>
  );
}

/** The Notifications view: daily reminder + crash warning. */
export function NotificationsSheet() {
  const p = usePalette();
  const daily = useReminderToggle();
  const crash = useCrashAlertToggle();
  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 4 }}>Notifications</Text>
      <Text style={{ color: p.textDim, fontSize: 13.5, lineHeight: 19, marginBottom: 12 }}>
        Both come from this device only. Nothing is sent to a server.
      </Text>
      <NotifRow
        icon="bell"
        title={REMINDER_TITLE}
        sub={daily.on ? `Every day at ${fmtTime12(daily.time)}` : 'A nudge to take your reading'}
        on={daily.on}
        onToggle={daily.toggle}
      />
      <NotifRow
        icon="trendDown"
        title="Crash warning"
        sub={crash.on ? 'Tells you to rest when a crash looks near' : 'A heads-up to rest when a crash looks near'}
        on={crash.on}
        onToggle={crash.toggle}
      />
      <Text style={{ color: p.textDim, fontSize: 12.5, lineHeight: 18, marginTop: 14 }}>
        Crash warnings watch your recovery score for a clear slide, the same signal as the Outlook card. At most one per day, and only while the app has fresh data.
      </Text>
      <View style={{ height: 20 }} />
    </View>
  );
}

/** Settings-list row: opens the Notifications view; the sub line summarizes
 *  what's currently on. */
export function NotificationsRow() {
  const p = usePalette();
  const state = useAppState();
  const { openSheet } = useSheets();
  const r = state.settings.reminder;
  const dailyOn = !!r?.enabled;
  const crashOn = !!state.settings.crashAlert?.enabled;
  const sub = dailyOn && crashOn ? `Daily at ${fmtTime12(r!.time || DEFAULT_REMINDER_TIME)} · Crash warnings`
    : dailyOn ? `Daily at ${fmtTime12(r!.time || DEFAULT_REMINDER_TIME)}`
    : crashOn ? 'Crash warnings'
    : 'Daily reminder & crash warnings';
  return (
    <Pressable
      onPress={() => openSheet(() => <NotificationsSheet />)}
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15, borderTopWidth: 1, borderTopColor: p.border }, pressed && { opacity: 0.5 }]}
    >
      <Icon name="bell" size={22} color={p.textDim} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: p.text, fontSize: 17 }}>Notifications</Text>
        <Text style={{ color: p.textDim, fontSize: 13 }}>{sub}</Text>
      </View>
    </Pressable>
  );
}
