import React from 'react';
import { Pressable, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { SCENES, SG } from './_shared';

/** Scene picker. Chrome is fine here — it never gets screenshotted; tap a scene
 *  to open its full-screen capture, swipe from the left edge to come back. */
export default function ScreenshotsIndex() {
  const router = useRouter();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 12 }}>
        <Text style={{ color: '#f2f2f5', fontFamily: SG.bold, fontSize: 26, letterSpacing: -0.5 }}>Screenshot scenes</Text>
        <Text style={{ color: '#9a9aa0', fontFamily: SG.med, fontSize: 14, marginTop: 6, marginBottom: 18 }}>
          Dev-only. Open a scene, capture it in the simulator (⌘S), swipe back.
        </Text>
        {SCENES.map((s) => (
          <Pressable
            key={s.slug}
            onPress={() => router.push(`/screenshots/${s.slug}` as never)}
            style={({ pressed }) => [{ borderWidth: 1, borderColor: '#303034', borderRadius: 14, padding: 16, marginBottom: 12, backgroundColor: '#1a1a1c' }, pressed && { opacity: 0.6 }]}
          >
            <Text style={{ color: '#6b6b72', fontFamily: SG.semi, fontSize: 12, letterSpacing: 1 }}>
              {`SCENE ${s.n}${s.tag ? ` · ${s.tag.toUpperCase()}` : ''}`}
            </Text>
            <Text style={{ color: '#f2f2f5', fontFamily: SG.bold, fontSize: 18, marginTop: 4 }}>{s.title}</Text>
            <Text style={{ color: '#9a9aa0', fontFamily: SG.med, fontSize: 13, marginTop: 3 }}>{s.caption}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
