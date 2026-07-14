/**
 * Pro paywall — an on-demand card sheet, not a wall. Freemium: the app is
 * always usable (journaling is free forever); locked surfaces (Progress
 * week/month/year, extra HRV captures, AI reports, watch POTS tests) call
 * usePaywall() to raise this card. It dismisses with the sheet's ✕ / backdrop
 * and closes itself the moment an entitlement lands (purchase or restore).
 *
 * Two plans (yearly / monthly) selectable inline. Everything IAP lives in
 * src/store/iap.ts; this file is presentation only.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, Text, View } from 'react-native';
import { BrandMark, Icon, IconName } from '../components/Icon';
import { SheetControls, SheetFooter, useSheets } from '../components/Sheet';
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
    icon: 'activity', title: 'Unlimited lab-quality HRV',
    sub: Platform.OS === 'ios'
      ? 'RMSSD, frequency bands, and coherence from your strap or Apple Watch.'
      : 'RMSSD, frequency bands, and coherence from your strap or camera.',
  },
  { icon: 'chart', title: 'Your full history', sub: 'Week, month, and year progress views over every number you’ve logged.' },
  { icon: 'standing', title: 'POTS testing', sub: 'Guided stand tests and episode capture, graded against clinical criteria.' },
  { icon: 'ai', title: 'AI-ready reports', sub: 'Turn your logged data into deep-dive prompts and doctor-visit summaries.' },
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

/** Raise the paywall card from any locked surface. */
export function usePaywall(): () => void {
  const { openSheet } = useSheets();
  return React.useCallback(() => {
    openSheet((c) => <PaywallCard controls={c} />);
  }, [openSheet]);
}

export function PaywallCard({ controls }: { controls: SheetControls }) {
  const p = usePalette();
  const { isPro, products, purchasing } = useIap();
  const { openSheet } = useSheets();
  const [sku, setSku] = useState(YEARLY_SKU);

  // Entitlement may have changed outside the purchase listener (e.g. returning
  // from the App Store subscribe sheet) — re-check whenever the card opens.
  useEffect(() => { refreshEntitlement(); }, []);
  // Purchase / restore landed — the card has done its job.
  useEffect(() => { if (isPro) controls.close(); }, [isPro, controls]);

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
    <View style={{ gap: 22, paddingBottom: 10 }}>
      <View style={{ alignItems: 'center', gap: 14, marginTop: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <BrandMark size={26} />
          <Text style={{ color: p.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.3 }}>Autonomic Pro</Text>
        </View>
        <Text style={{ color: p.text, fontSize: 27, fontWeight: '800', letterSpacing: -0.6, textAlign: 'center', lineHeight: 33 }}>
          See your nervous system recover
        </Text>
        <Text style={{ color: p.textDim, fontSize: 15.5, textAlign: 'center', lineHeight: 23 }}>
          Unlimited HRV, your full history, POTS testing, and AI-ready reports.
        </Text>
      </View>

      <View style={{ gap: 16, marginVertical: 4 }}>
        {VALUE.map((v) => <ValueRow key={v.title} {...v} />)}
      </View>

      <Pressable
        onPress={() => openSheet((c) => <FreeVsProCard controls={c} />)}
        style={({ pressed }) => [
          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 11, borderRadius: radius.control, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface2 },
          pressed && { opacity: 0.7 },
        ]}
      >
        <Icon name="checklist" size={16} color={p.textDim} />
        <Text style={{ color: p.text, fontSize: 14, fontWeight: '600' }}>{'What’s free vs Pro'}</Text>
      </Pressable>

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
          title={purchasing ? 'Starting…' : trial ? 'Start 7-day free trial' : 'Upgrade to Pro'}
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
    </View>
  );
}

/* ---------- Free vs Pro comparison ----------
 * Claude Design "Free vs Pro" (turn 11): one aligned grid — label column,
 * Free column, and a Pro column drawn as a single continuous tinted rail
 * (each cell carries the same tint + side borders, so the rail can't drift).
 * Rows are grouped into "In every plan" and "Pro upgrades"; a CTA closes it. */

const hexA = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

const SHARED_ROWS: string[] = [
  'Journaling: sleep, meds, symptoms, triggers, hydration',
  'Manual readings: BP, resting heart rate, episodes',
  'Daily autonomic score & outlook',
  ...(Platform.OS === 'ios' ? ['Apple Watch heart-rate monitor'] : []),
  'Backups & data export',
];

const PRO_ROWS: { label: string; freeText?: string; proText?: string }[] = [
  { label: 'Live HRV capture', freeText: '1 / day', proText: 'Unlimited' },
  { label: 'Progress charts', freeText: '14 days', proText: 'All views' },
  { label: 'Full historical metric analysis' },
  { label: 'POTS testing & episode tracking' },
  { label: 'AI insights & doctor reports' },
];

const FREE_W = 62;
const PRO_W = 88;

export function FreeVsProCard({ controls }: { controls: SheetControls }) {
  const p = usePalette();
  const { isPro, products, purchasing } = useIap();
  // Purchase landed (from the CTA below, or restored) — close up.
  useEffect(() => { if (isPro) controls.close(); }, [isPro, controls]);
  const mPrice = priceOf(products.find((s) => s.productId === MONTHLY_SKU), MONTHLY_SKU);
  const yPrice = priceOf(products.find((s) => s.productId === YEARLY_SKU), YEARLY_SKU);

  const railBg = hexA(p.accent, 0.07);
  const railEdge = hexA(p.accent, 0.19);
  const railLine = hexA(p.accent, 0.13);
  const rowLine = 'rgba(255,255,255,0.04)';
  const groupLabel = { fontSize: 10.5, fontWeight: '700' as const, letterSpacing: 0.8, textTransform: 'uppercase' as const, color: p.textDim, opacity: 0.75 };

  // One grid row: label (flex) · Free (fixed) · Pro rail cell (fixed).
  const row = (label: string, free: React.ReactNode, pro: React.ReactNode, first = false) => (
    <View key={label} style={{ flexDirection: 'row', alignItems: 'stretch' }}>
      <View style={{ flex: 1, minHeight: 52, justifyContent: 'center', paddingVertical: 10, paddingRight: 10, borderTopWidth: first ? 0 : 1, borderTopColor: rowLine }}>
        <Text style={{ fontSize: 13.5, lineHeight: 18, color: p.text }}>{label}</Text>
      </View>
      <View style={{ width: FREE_W, alignItems: 'center', justifyContent: 'center', borderTopWidth: first ? 0 : 1, borderTopColor: rowLine }}>{free}</View>
      <View style={{ width: PRO_W, alignItems: 'center', justifyContent: 'center', backgroundColor: railBg, borderLeftWidth: 1, borderRightWidth: 1, borderLeftColor: railEdge, borderRightColor: railEdge, borderTopWidth: first ? 0 : 1, borderTopColor: railLine }}>{pro}</View>
    </View>
  );
  // Group heading row — the label spans label+free; the rail runs on unbroken.
  const group = (title: string, topPad: number) => (
    <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
      <View style={{ flex: 1, paddingTop: topPad, paddingBottom: 6, justifyContent: 'flex-end' }}><Text style={groupLabel}>{title}</Text></View>
      <View style={{ width: FREE_W }} />
      <View style={{ width: PRO_W, backgroundColor: railBg, borderLeftWidth: 1, borderRightWidth: 1, borderLeftColor: railEdge, borderRightColor: railEdge }} />
    </View>
  );
  const check = (accent: boolean) => (
    <Icon name="check" size={accent ? 19 : 17} color={accent ? p.accent : p.textDim} strokeWidth={2.6} />
  );
  const dash = <View style={{ width: 12, height: 2, borderRadius: 2, backgroundColor: p.textDim, opacity: 0.45 }} />;
  const cellText = (t: string, accent: boolean) => (
    <Text style={{ fontSize: 12, fontWeight: accent ? '800' : '600', color: accent ? p.accent : p.textDim, textAlign: 'center', lineHeight: 15 }}>{t}</Text>
  );

  return (
    <View style={{ paddingBottom: 8 }}>
      {/* The floating ✕ pill sits top-right — keep the header text clear of it. */}
      <Text style={{ fontSize: 23, fontWeight: '800', letterSpacing: -0.3, color: p.text, paddingRight: 90 }}>{'What’s free vs Pro'}</Text>
      <Text style={{ color: p.textDim, fontSize: 13, lineHeight: 19, marginTop: 6, marginBottom: 16, paddingRight: 90 }}>
        Your journal and your data are free forever. Pro unlocks the deep-analysis tools.
      </Text>

      {/* Column heads — the Pro head opens the rounded top of the rail. */}
      <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
        <View style={{ flex: 1 }} />
        <View style={{ width: FREE_W, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 12 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: p.textDim }}>Free</Text>
        </View>
        <View style={{ width: PRO_W, alignItems: 'center', paddingTop: 9, paddingBottom: 12, backgroundColor: railBg, borderWidth: 1, borderBottomWidth: 0, borderColor: railEdge, borderTopLeftRadius: 16, borderTopRightRadius: 16 }}>
          <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', color: p.accent }}>Pro</Text>
        </View>
      </View>

      {group('In every plan', 6)}
      {SHARED_ROWS.map((label, i) => row(label, check(false), check(true), i === 0))}

      {group('Pro upgrades', 18)}
      {PRO_ROWS.map((r, i) => row(
        r.label,
        r.freeText ? cellText(r.freeText, false) : dash,
        r.proText ? cellText(r.proText, true) : check(true),
        i === 0,
      ))}

      {/* Rail foot — rounds and closes the bottom of the Pro column. */}
      <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
        <View style={{ flex: 1, borderTopWidth: 1, borderTopColor: rowLine }} />
        <View style={{ width: FREE_W, borderTopWidth: 1, borderTopColor: rowLine }} />
        <View style={{ width: PRO_W, height: 14, backgroundColor: railBg, borderWidth: 1, borderTopWidth: 0, borderColor: railEdge, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 }} />
      </View>

      {/* The sheet's scroll content already pads for the fixed footer
          (paddingBottom = footerH + 20), so no extra tail spacer here. */}
      <SheetFooter>
        <View style={{ flex: 1 }}>
          <Pressable
            onPress={() => subscribe(MONTHLY_SKU)}
            disabled={purchasing}
            style={({ pressed }) => [{ height: 52, borderRadius: 14, backgroundColor: p.accent, alignItems: 'center', justifyContent: 'center' }, (pressed || purchasing) && { opacity: 0.8 }]}
          >
            <Text style={{ color: '#fff', fontSize: 15.5, fontWeight: '700' }}>{purchasing ? 'Starting…' : `Upgrade to Pro · ${mPrice}/mo`}</Text>
          </Pressable>
          <Text style={{ color: p.textDim, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 9 }}>
            {`or ${yPrice}/yr · cancel anytime\nYour journal is always yours: private, on-device, exportable.`}
          </Text>
        </View>
      </SheetFooter>
    </View>
  );
}
