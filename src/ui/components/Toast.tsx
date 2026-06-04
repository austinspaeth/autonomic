// Toast — ephemeral message, ported from the legacy toast() (docs/index.html:1384).
// A tiny module singleton drives a host mounted once in AppShell; call toast("…")
// from anywhere.
import React, { useEffect, useRef, useState } from 'react';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@ui/primitives';
import { useTheme } from '@ui/theme/ThemeProvider';

type Listener = (msg: string) => void;
let listener: Listener | null = null;

export function toast(msg: string) {
  listener?.(msg);
}

export function ToastHost() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    listener = (m: string) => {
      setMsg(m);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setMsg(null), 1900);
    };
    return () => {
      listener = null;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!msg) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(150)}
      exiting={FadeOut.duration(250)}
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 96 + insets.bottom,
        alignItems: 'center',
        zIndex: 200,
      }}
    >
      <Text
        style={{
          backgroundColor: t.text,
          color: t.bg,
          fontSize: 14,
          fontWeight: '600',
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderRadius: 999,
          overflow: 'hidden',
        }}
      >
        {msg}
      </Text>
    </Animated.View>
  );
}
