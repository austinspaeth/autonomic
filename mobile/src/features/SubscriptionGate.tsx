/**
 * Full-screen paywall. Mounted in app/_layout.tsx beneath the onboarding wizard
 * (zIndex 90 vs 100), so a fresh install sees Welcome first, then this. It stays
 * up whenever the user is not Pro — that IS the gate; there is no per-feature
 * locking. It disappears the instant `isPro` flips true (trial start, purchase,
 * or a restored entitlement).
 *
 * Two plans (yearly / monthly) selectable inline. Everything IAP lives in
 * src/store/iap.ts; this file is presentation only.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandMark, Icon, IconName } from '../components/Icon';
import { Button } from '../components/ui';
import { radius, usePalette } from '../theme';
import {
  useIap, subscribe, restore, refreshEntitlement,
  YEARLY_SKU, MONTHLY_SKU, priceOf, hasTrial,
} from '../store/iap';

const TERMS_URL = 'https://autonomic.care/terms-of-service/';
const PRIVACY_URL = 'https://autonomic.care/privacy-policy/';

const VALUE: { icon: IconName; title: string; sub: string }[] = [
  {
    icon: 'activity', title: 'Lab-quality HRV',
    sub: Platform.OS === 'ios'
      ? 'RMSSD, frequency bands, and coherence from your strap or Apple Watch.'
      : 'RMSSD, frequency bands, and coherence from your strap or camera.',
  },
  { icon: 'chart', title: 'Every number graded', sub: 'Readings scored against research-backed thresholds, with trends over time.' },
  { icon: 'ai', title: 'AI-ready insights', sub: 'Turn your logged data into prompts for the AI service of your choice.' },
  { icon: 'heart', title: 'Private & on-device', sub: 'No account, no cloud. Your journal never leaves your phone.' },
];

const numeric = (s: string) => parseFloat(s.replace(/[^0-9.]/g, '')) || 0;

function ValueRow({ icon, title, sub }: { icon: IconName; title: string; sub: string }) {
  const p = usePalette();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
      <View style={{ width: 42, height: 42, borderRadius: 11, backgroundColor: p.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={22} color={p.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: p.text, fontSize: 16, fontWeight: '600' }}>{title}</Text>
        <Text style={{ color: p.textDim, fontSize: 13.5, lineHeight: 20, marginTop: 2 }}>{sub}</Text>
      </View>
    </View>
  );
}

function PlanCard({ name, price, period, note, badge, selected, onPress }: {
  name: string; price: string; period: string; note?: string; badge?: string; selected: boolean; onPress: () => void;
}) {
  const p = usePalette();
  return (
    <Pressable
      onPress={onPress}
      style={{
        borderRadius: radius.card, borderWidth: 1.5, padding: 16,
        borderColor: selected ? p.accent : p.border,
        backgroundColor: selected ? p.accentSoft : p.surface2,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: selected ? p.accent : p.border, alignItems: 'center', justifyContent: 'center' }}>
          {selected ? <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: p.accent }} /> : null}
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ color: p.text, fontSize: 16, fontWeight: '700' }}>{name}</Text>
            {badge ? (
              <View style={{ backgroundColor: p.accent, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ color: '#fff', fontSize: 10.5, fontWeight: '700', letterSpacing: 0.2 }}>{badge}</Text>
              </View>
            ) : null}
          </View>
          {note ? <Text style={{ color: p.textDim, fontSize: 12.5, marginTop: 2 }}>{note}</Text> : null}
        </View>
        <Text style={{ color: p.text, fontSize: 15, fontWeight: '600' }}>{`${price}/${period}`}</Text>
      </View>
    </Pressable>
  );
}

export function SubscriptionGate() {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const { ready, isPro, products, purchasing } = useIap();
  const [sku, setSku] = useState(YEARLY_SKU);

  // Re-check entitlement whenever the gate is showing (e.g. after returning from
  // the App Store subscribe sheet on a device where the listener didn't fire).
  useEffect(() => { if (ready && !isPro) refreshEntitlement(); }, [ready, isPro]);

  if (!ready || isPro) return null;                  // still loading, or paid → no wall

  const yearly = products.find((s) => s.productId === YEARLY_SKU);
  const monthly = products.find((s) => s.productId === MONTHLY_SKU);
  const yPrice = priceOf(yearly, YEARLY_SKU);
  const mPrice = priceOf(monthly, MONTHLY_SKU);
  // Yearly-vs-12×monthly savings, when both prices parse to a number.
  const yNum = numeric(yPrice);
  const mNum = numeric(mPrice);
  const savePct = yNum && mNum && mNum * 12 > yNum ? Math.round((1 - yNum / (mNum * 12)) * 100) : 0;

  const selected = sku === YEARLY_SKU ? yearly : monthly;
  const selectedPrice = sku === YEARLY_SKU ? yPrice : mPrice;
  const period = sku === YEARLY_SKU ? 'year' : 'month';
  const trial = hasTrial(selected);

  const link = (label: string, url: string) => (
    <Text style={{ textDecorationLine: 'underline' }} onPress={() => Linking.openURL(url)}>{label}</Text>
  );

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: p.bg, zIndex: 90, elevation: 90 }]}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 26, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 20, gap: 22 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ alignItems: 'center', gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <BrandMark size={26} />
            <Text style={{ color: p.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.3 }}>Autonomic</Text>
          </View>
          <Text style={{ color: p.text, fontSize: 29, fontWeight: '800', letterSpacing: -0.6, textAlign: 'center', lineHeight: 35 }}>
            See your nervous system recover
          </Text>
          <Text style={{ color: p.textDim, fontSize: 15.5, textAlign: 'center', lineHeight: 23 }}>
            Clinical-grade HRV, your own recovery protocol, and every number graded against medical thresholds.
          </Text>
        </View>

        <View style={{ gap: 16, marginVertical: 4 }}>
          {VALUE.map((v) => <ValueRow key={v.title} {...v} />)}
        </View>

        <View style={{ gap: 10 }}>
          <PlanCard
            name="Yearly"
            price={yPrice}
            period="yr"
            note={hasTrial(yearly) ? '7-day free trial, then billed yearly' : 'Billed yearly'}
            badge={savePct ? `Save ${savePct}%` : 'Best value'}
            selected={sku === YEARLY_SKU}
            onPress={() => setSku(YEARLY_SKU)}
          />
          <PlanCard
            name="Monthly"
            price={mPrice}
            period="mo"
            note={hasTrial(monthly) ? '7-day free trial, then billed monthly' : 'Billed monthly'}
            selected={sku === MONTHLY_SKU}
            onPress={() => setSku(MONTHLY_SKU)}
          />
        </View>

        <View style={{ gap: 12 }}>
          <Button
            title={purchasing ? 'Starting…' : trial ? 'Start 7-day free trial' : 'Subscribe'}
            variant="primary"
            disabled={purchasing}
            onPress={() => subscribe(sku)}
          />
          {purchasing ? <ActivityIndicator color={p.accent} /> : null}
          <Text style={{ color: p.textDim, fontSize: 13, textAlign: 'center' }}>
            {trial ? `7 days free, then ${selectedPrice}/${period}. Cancel anytime.` : `${selectedPrice}/${period}. Cancel anytime.`}
          </Text>
          <View style={{ borderRadius: radius.control, borderWidth: 1, borderColor: p.border }}>
            <Button title="Restore purchase" variant="ghost" onPress={restore} />
          </View>
        </View>

        <Text style={{ color: p.textDim, fontSize: 11, textAlign: 'center', lineHeight: 17, opacity: 0.85 }}>
          {Platform.OS === 'ios'
            ? 'Payment is charged to your Apple ID at confirmation. The subscription auto-renews unless canceled at least 24 hours before the period ends; manage or cancel in your App Store settings.'
            : 'Payment is charged to your Google account at confirmation. The subscription auto-renews unless canceled before the period ends; manage or cancel in Google Play.'}{'  '}
          {link('Terms', TERMS_URL)}{'  ·  '}{link('Privacy', PRIVACY_URL)}
        </Text>
      </ScrollView>
    </View>
  );
}
