/**
 * The watches that are not an Apple Watch — the card behind the picker's
 * "Other watches" row, and the per-brand setup card stacked on top of it.
 *
 * Two cards, not a screen with a back button: the sheet stack already backs out
 * where the user came from, so a setup card's ✕ lands on the brand list and the
 * list's ✕ lands on the picker. Neither card navigates.
 *
 * Nothing here claims a watch is connected. Every brand's reading arrives
 * through the platform health store (Apple Health / Health Connect), and there
 * is no per-brand handshake to report on, so the rows offer "Set up" — an
 * affordance, not a state — and the setup card ends in the two things that
 * actually help: open the companion app, or re-ask for the health permission
 * for someone who wired this up months ago.
 */
import React, { useCallback, useEffect, useRef } from 'react';
import { Linking, Platform, Pressable, Text, View } from 'react-native';
import type { SheetControls } from '../../components/Sheet';
import { useSheets } from '../../components/Sheet';
import { Button } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { Icon } from '../../components/Icon';
import { CAUTION_GOLD, CAUTION_GOLD_SOFT, GRADE_COLORS, radius, usePalette } from '../../theme';
import { health, healthAppName, healthPermissionPath, openHealthApp } from '../../lib/health';
import { garminDevices, pickGarminDevice, subscribeGarminDevices } from '../../lib/garmin/receiver';
import { garminAvailable, garminNative } from '../../../modules/garmin-link';
import { brandNames, connectSteps, watchBrands, type WatchBrand, type WatchPlatform } from '../../lib/watch/brands';

// The sheet's ✕ pill floats top-right; inset the title + subtitle so neither
// runs underneath it.
const CLOSE_CLEARANCE = 58;

/** The platform whose health store a reading would land in. */
export const watchPlatform = (): WatchPlatform => (Platform.OS === 'android' ? 'android' : 'ios');

/** Sub-line for the picker's collapsed "Other watches" row. */
export const otherWatchesSub = () => brandNames();

/** Release gate. The Garmin Connect IQ app is not published yet, and nothing
 *  in the app may point a user at a watch app they cannot install — so the
 *  picker's "Other watches" row and the Setup card's "now supported" tab are
 *  both held behind this one flag rather than being ripped out. Flip it to
 *  true once the watch app is live in the Connect IQ store. */
const WATCH_BRANDS_RELEASED = false;

/** True when there is at least one non-Apple watch worth offering here. */
export const hasOtherWatches = () => WATCH_BRANDS_RELEASED && watchBrands().length > 0;

export function WatchBrandsSheet({ controls, onLinked }: { controls: SheetControls; onLinked?: () => void }) {
  const p = usePalette();
  const { openSheet } = useSheets();
  const brands = watchBrands();

  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 6, paddingRight: CLOSE_CLEARANCE }}>Other watches</Text>
      {/* Deliberately generic: how a reading gets here is per-brand — some talk
          to the app directly, others hand off through the platform health store
          — so the route is stated on the brand's own card, never as one claim
          over the whole list. */}
      <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 20, marginBottom: 18, paddingRight: CLOSE_CLEARANCE }}>
        The reading is taken on the wrist. Open yours to see what it needs.
      </Text>

      <View style={{ gap: 8 }}>
        {brands.map((b) => (
          <BrandRow key={b.id} brand={b} onPress={() => openSheet((c) => (
            <WatchBrandSetup
              brand={b}
              controls={c}
              onLinked={() => { controls.close(); onLinked?.(); }}
            />
          ))} />
        ))}
      </View>

      {/* Said once, here, rather than as a badge on every row: the reason the
          four of them share a tier at all. */}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
        <Icon name="info" size={15} color={p.textDim} />
        <Text style={{ flex: 1, color: p.textDim, fontSize: 12.5, lineHeight: 18 }}>
          Every watch reads beat to beat from the wrist, so all of them land in the same accuracy tier. A chest strap is
          still the most reliable.
        </Text>
      </View>
      <View style={{ height: 16 }} />
    </View>
  );
}

/** No icon: every row here would wear the same watch glyph, so a column of
 *  identical marks costs the name its indent and tells the reader nothing. */
function BrandRow({ brand, onPress }: { brand: WatchBrand; onPress: () => void }) {
  const p = usePalette();
  return (
    <PickerRow title={brand.name} sub={brand.models} onPress={onPress} tag={brand.experimental ? 'Experimental' : undefined}>
      <Text style={{ color: p.textDim, fontSize: 13, fontWeight: '700' }}>Set up</Text>
      <Icon name="chevronRight" size={16} color={p.textDim} />
    </PickerRow>
  );
}

/** The picker's row shape, shared by the brand list and the source picker's own
 *  navigation rows: icon, title over sub, whatever the caller puts on the right. */
export function PickerRow({ icon, title, sub, onPress, children, tag }: {
  icon?: 'watch' | 'bluetooth' | 'camera'; title: string; sub: string; onPress: () => void;
  children?: React.ReactNode;
  /** Small qualifier beside the title, e.g. "Experimental". */
  tag?: string;
}) {
  const p = usePalette();
  return (
    <Pressable onPress={onPress}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.control, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface2 }}>
        {icon ? <Icon name={icon} size={22} color={p.textDim} /> : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <Text style={{ color: p.text, fontWeight: '700' }}>{title}</Text>
            {tag ? (
              // Gold: a caution, not a fault. Red would read as "broken", and
              // the same gold already means "proceed knowingly" on the
              // back-dated save button.
              <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: CAUTION_GOLD_SOFT }}>
                <Text style={{ color: CAUTION_GOLD, fontSize: 10.5, fontWeight: '800', letterSpacing: 0.3 }}>{tag}</Text>
              </View>
            ) : null}
          </View>
          <Text style={{ color: p.textDim, fontSize: 12, lineHeight: 17, marginTop: 4 }}>{sub}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>{children}</View>
      </View>
    </Pressable>
  );
}

/** True when this brand's OWN link to the app is built into this binary. Garmin
 *  is the one that has one (the Connect IQ module, iOS only); everywhere else
 *  the reading still travels through the platform health store, so the card
 *  falls back to those steps rather than promising a route that isn't there. */
function directLinkReady(brand: WatchBrand): boolean {
  if (brand.transport !== 'direct') return false;
  return brand.id === 'garmin' && garminAvailable();
}

/** One brand's setup card: three steps, the models that are known to work, and
 *  the two ways out. What those two are depends on the route — a direct link
 *  ends in "choose your watch", a health-store hand-off ends in the companion
 *  app and a permission re-check. */
export function WatchBrandSetup({ brand, controls, onLinked }: { brand: WatchBrand; controls: SheetControls; onLinked?: () => void }) {
  const p = usePalette();
  const toast = useToast();
  const hub = healthAppName();
  const direct = directLinkReady(brand);
  const steps = connectSteps(brand, hub, direct);

  // On iOS the linked device arrives through Garmin Connect's URL callback,
  // which lands well after the button's own promise resolved — so the sheet
  // watches the device list rather than the tap.
  //
  // The gate is "has the user asked to link", NOT "did the count go up". A
  // previously-linked watch means the list is already non-empty when this card
  // opens, so a count comparison never fires and re-linking silently does
  // nothing — which is exactly what it did.
  const asked = useRef(false);
  const finish = useCallback(() => {
    controls.close();
    onLinked?.();
  }, [controls, onLinked]);

  useEffect(() => subscribeGarminDevices((list) => {
    if (direct && asked.current && list.length) finish();
  }), [direct, finish]);

  const openApp = () => {
    const store = brand.store[watchPlatform()];
    Linking.openURL(brand.scheme).catch(() => {
      if (store) Linking.openURL(store).catch(() => toast(`${brand.app} is not installed`));
      else toast(`${brand.app} is not installed`);
    });
  };

  // For someone who wired this up months ago: don't send them back out to
  // another app. Ask for anything still missing, and when the platform has
  // nothing left to ask (`requestAuth` self-gates to silence), hand them the
  // health store itself, which is the only place the toggle can be flipped.
  const alreadyConnected = async () => {
    const asked = await health().requestAuth({ force: true });
    if (asked) { toast(`${hub} access confirmed`); controls.close(); return; }
    toast(`Check ${brand.app} under ${healthPermissionPath()}`);
    openHealthApp();
  };

  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 6, paddingRight: CLOSE_CLEARANCE }}>Connect {brand.name}</Text>
      <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 20, marginBottom: 18, paddingRight: CLOSE_CLEARANCE }}>
        {direct
          ? `The watch sends every beat straight to Autonomic. ${hub} is not in the path.`
          : `The reading is taken on the watch and syncs in through ${hub} when the session ends.`}
      </Text>

      <View style={{ gap: 8 }}>
        {steps.map((s, i) => (
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

      <View style={{ marginTop: 18, padding: 14, borderRadius: radius.control, backgroundColor: p.sunk }}>
        {/* Two tiers, because "we took a reading on this" and "this ought to
            work" are different promises and the user is choosing hardware on
            the strength of them. */}
        {brand.verified.length ? (
          <>
            <Text style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.6, color: p.textDim, fontWeight: '700', marginBottom: 10 }}>Supported models</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              {brand.verified.map((m) => (
                // Green, not accent red: this is a pass mark, and red is the
                // app's colour for attention and for a bad grade. Reuses the
                // grade scale's "great" so it reads as the same kind of good.
                <View key={m} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8, backgroundColor: p.surface2, borderWidth: 1, borderColor: GRADE_COLORS.great }}>
                  <Icon name="check" size={12} color={GRADE_COLORS.great} />
                  <Text style={{ color: GRADE_COLORS.great, fontSize: 12.5, fontWeight: '700' }}>{m}</Text>
                </View>
              ))}
              <Text style={{ color: p.textDim, fontSize: 12.5 }}>Verified by us</Text>
            </View>
          </>
        ) : null}

        <Text style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.6, color: p.textDim, fontWeight: '700', marginBottom: 10 }}>
          {brand.verified.length ? 'Likely supported' : 'Supported models'}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
          {brand.likely.map((m) => (
            <View key={m} style={{ paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8, backgroundColor: p.surface2 }}>
              <Text style={{ color: p.text, fontSize: 12.5, fontWeight: '600' }}>{m}</Text>
            </View>
          ))}
        </View>
        <Text style={{ color: p.textDim, fontSize: 12.5, lineHeight: 18, marginTop: 11 }}>{brand.caveat}</Text>
      </View>

      <View style={{ height: 20 }} />
      {direct ? (
        <>
          {/* Opens our Connect IQ store page on the watch. Needs a linked
              device, which is why it appears after one is chosen rather than
              beside the step that mentions it. */}
          <Button
            title="Get the watch app"
            variant="ghost"
            onPress={() => {
              const d = garminDevices()[0];
              if (!d) { toast('Choose your watch first'); return; }
              void garminNative()?.openStoreForApp(d.id);
            }}
          />
          <View style={{ height: 10 }} />
          <Button
            title={`Choose your ${brand.name}`}
            variant="primary"
            onPress={() => {
              // Linking is not the goal — measuring is. On success the whole
              // sheet stack closes and the watch is selected as the source, so
              // the user is not left tapping through cards to arrive at the
              // thing they just set up.
              asked.current = true;
              // Success may also arrive via the URL callback above; whichever
              // lands first closes the card.
              void pickGarminDevice().then((list) => {
                if (list.length) finish();
              });
            }}
          />

        </>
      ) : (
        <>
          <Button title={`Open ${brand.app}`} variant="primary" onPress={openApp} />
          <View style={{ height: 10 }} />
          <Button title="I've already set this up" variant="ghost" onPress={() => { void alreadyConnected(); }} />
        </>
      )}
      <View style={{ height: 20 }} />
    </View>
  );
}
