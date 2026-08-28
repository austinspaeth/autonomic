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
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, Text, View } from 'react-native';
import { useSheets, type SheetControls } from '../../components/Sheet';
import { Button } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { Icon } from '../../components/Icon';
import { CAUTION_GOLD, CAUTION_GOLD_SOFT, GRADE_COLORS, radius, usePalette } from '../../theme';
import { SupportCard } from '../SupportCard';
import { health, healthAppName, healthPermissionPath, openHealthApp } from '../../lib/health';
import { garminDevices, pickGarminDevice, subscribeGarminDevices } from '../../lib/garmin/receiver';
import { garminNative } from '../../../modules/garmin-link';
import { brandNames, connectSteps, hasDirectLink, watchBrands, type WatchBrand, type WatchPlatform } from '../../lib/watch/brands';

type OpenSheet = ReturnType<typeof useSheets>['openSheet'];

// The sheet's ✕ pill floats top-right; inset the title + subtitle so neither
// runs underneath it.
const CLOSE_CLEARANCE = 58;

/** How long to wait for Garmin Connect's device-selection callback before
 *  telling the user nothing came back. Covers the app switch out and in. */
const PICK_TIMEOUT_MS = 6000;

/** The platform whose health store a reading would land in. */
export const watchPlatform = (): WatchPlatform => (Platform.OS === 'android' ? 'android' : 'ios');

/**
 * The collapsed row that opens the brand list, in the source picker and in the
 * welcome wizard. It names the ONE brand while only one is built ("Garmin",
 * over that brand's models): "Other watches · Garmin" reads as a category with
 * something hidden behind it, and what is behind it is nothing.
 */
/**
 * Open the brand SETUP directly.
 *
 * While one brand is built there is nothing to choose, so the list card in
 * between was a screen that existed only to be tapped through. It comes back on
 * its own the day a second brand is listed. `onLinked` fires once the setup card
 * confirms, exactly as it did through the list.
 */
export function openBrandSetup(openSheet: OpenSheet, onLinked?: () => void): void {
  const list = watchBrands();
  if (list.length === 1) {
    openSheet((c) => <WatchBrandSetup brand={list[0]} controls={c} onLinked={onLinked} />);
    return;
  }
  openSheet((c) => <WatchBrandsSheet controls={c} onLinked={onLinked} />);
}

/** The tag a listed brand wears wherever it is offered, so "not fully proven"
 *  travels with the name instead of living only inside the setup card. */
export const brandTag = () => {
  const list = watchBrands();
  return list.length === 1 && list[0].experimental ? 'Experimental' : undefined;
};

export const otherWatchesTitle = () => {
  const list = watchBrands();
  return list.length === 1 ? list[0].name : 'Other watches';
};
export const otherWatchesSub = () => {
  const list = watchBrands();
  return list.length === 1 ? list[0].models : brandNames();
};

/** Release gate. Nothing in the app may point a user at a watch app they
 *  cannot install, so the picker's "Other watches" row and the Setup card's
 *  "now supported" tab were held behind this one flag until the Garmin Connect
 *  IQ app was published. It is live, so this is open. Close it again (rather
 *  than ripping anything out) if a brand ever has to be pulled. */
const WATCH_BRANDS_RELEASED = true;

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
                <Text style={{ color: CAUTION_GOLD, fontSize: 10.5, fontWeight: '600', letterSpacing: 0.3 }}>{tag}</Text>
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

/**
 * Which ROUTE this brand's card describes. A property of the brand and the
 * platform, never of the build.
 *
 * It used to also require the native module to be present (`garminAvailable`),
 * so a build without it silently showed the health-store card instead: three
 * steps telling a Garmin owner to share with Apple Health, on the one brand
 * that does not go through Apple Health at all. Wrong instructions are worse
 * than absent ones, and it looked exactly like the direct card had been lost.
 *
 * Nothing here checks the module any more. A shipped build always carries it —
 * adding it changes the native fingerprint, so it arrives with the binary and
 * never as an update to an older one — which leaves only stale DEV builds, and
 * those are not a state to write copy for.
 */
function directRoute(brand: WatchBrand): boolean {
  return brand.transport === 'direct' && hasDirectLink(brand, watchPlatform());
}

/** One brand's setup card: three steps, the models that are known to work, and
 *  the way out. What that is depends on the route.
 *
 *  On the DIRECT route the card has no footer button at all: each step that the
 *  app can perform carries its own button, because a footer pair sitting under
 *  a numbered list is a second set of instructions the reader has to match up
 *  with the first. The health-store route keeps its footer — its steps happen
 *  in another app entirely, so there is nothing there to attach a button to. */
export function WatchBrandSetup({ brand, controls, onLinked }: { brand: WatchBrand; controls: SheetControls; onLinked?: () => void }) {
  const p = usePalette();
  const toast = useToast();
  const hub = healthAppName();
  const direct = directRoute(brand);
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
  // Step 2 cannot act until step 1 has: `showStore` wants an IQApp, which is
  // built against a chosen device. Tracked as state, not read once, because the
  // device arrives asynchronously through Garmin Connect's URL callback while
  // this card is open.
  const [linked, setLinked] = useState(() => garminDevices().length > 0);
  // Step 3 waits on step 2 the same way step 2 waits on step 1: confirming an
  // install nobody has been sent to do is a confirmation of nothing. It cannot
  // be a real check — Connect IQ reports a sideloaded app as absent, and the
  // store hand-off tells us nothing about what happened over there — so the
  // gate is the TAP, plus an advisory yes from the watch for someone who set
  // this up on an earlier visit (a positive there is trustworthy; only its
  // negatives are not).
  const [appSent, setAppSent] = useState(false);
  // Garmin Connect returning EMPTY is indistinguishable from it never having
  // been asked: the app backgrounds, comes straight back, and nothing changes.
  // It is the normal outcome for a watch that is not paired over there yet, so
  // it has to be SAID — the sheet stack sits in a Modal above the toast layer,
  // which is why this is state rendered inside the card rather than a toast.
  const [pickedNothing, setPickedNothing] = useState(false);
  const pickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finish = useCallback(() => {
    const d = garminDevices()[0];
    controls.close();
    onLinked?.();
    // Said out loud because the card that made the change is gone by the time
    // it lands: the source row underneath is what changed, and a user who came
    // in through Other watches is not looking at it.
    toast(d ? `Using ${d.name} for readings` : `Using ${brand.name} for readings`);
  }, [brand.name, controls, onLinked, toast]);

  useEffect(() => subscribeGarminDevices((list) => {
    setLinked(list.length > 0);
    if (list.length) {
      // The answer landed (it arrives through Garmin Connect's URL callback,
      // well after the button's own promise resolved), so retire the wait.
      if (pickTimer.current) { clearTimeout(pickTimer.current); pickTimer.current = null; }
      setPickedNothing(false);
    }
    // Choosing a watch no longer closes the card: the next thing to do (install
    // the watch app) is a step further down THIS list, and closing would drop
    // the user back a card away from it. The card closes when the whole brand
    // is set up, which the last step's "Done" says.
  }), [direct]);

  const getWatchApp = () => {
    const d = garminDevices()[0];
    if (!d) { toast('Choose your watch first'); return; }
    setAppSent(true);
    void garminNative()?.openStoreForApp(d.id);
  };

  // Returning to a card that was finished days ago: ask the watch. Only a yes
  // is acted on, so a sideloaded app (always reported absent) simply leaves the
  // step where the tap would put it.
  useEffect(() => {
    if (!direct || !linked || appSent) return;
    const d = garminDevices()[0];
    if (!d) return;
    let live = true;
    void garminNative()?.getAppStatus(d.id)
      .then((st) => { if (live && st?.installed) setAppSent(true); })
      .catch(() => { /* advisory only — the tap is the real gate */ });
    return () => { live = false; };
  }, [direct, linked, appSent]);

  const pickDevice = () => {
    asked.current = true;
    setPickedNothing(false);
    if (pickTimer.current) clearTimeout(pickTimer.current);
    void pickGarminDevice();
    // Nothing to await: on iOS the chosen device arrives later through the URL
    // callback, and an empty return sends no callback at all. So the failure is
    // a TIMEOUT — long enough to cover the hop out to Garmin Connect and back.
    pickTimer.current = setTimeout(() => {
      pickTimer.current = null;
      if (!garminDevices().length) setPickedNothing(true);
    }, PICK_TIMEOUT_MS);
  };
  useEffect(() => () => { if (pickTimer.current) clearTimeout(pickTimer.current); }, []);

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
        {steps.map((s, i) => {
          // The button belongs to the step, so it sits under the step's own
          // text and inside its border rather than under the whole list.
          const action = s.action === 'pickDevice'
            ? { title: linked ? `Change ${brand.name}` : `Choose your ${brand.name}`, onPress: pickDevice, disabled: false }
            : s.action === 'getApp'
              ? { title: 'Get the watch app', onPress: getWatchApp, disabled: !linked }
              // The confirm, and the card's only exit besides the ✕: it selects
              // this watch as the reading source. Can't be true until step 1
              // has chosen one.
              : s.action === 'finish'
                ? { title: "I've installed the watch app", onPress: finish, disabled: !linked || !appSent }
                : null;
          return (
            // Column, not a row: the step's button spans the card's full width
            // under the text rather than being inset into the text column, so
            // it reads as the step's action and not as a footnote to it.
            <View key={i} style={{ padding: 14, borderRadius: radius.control, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface2 }}>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: p.accentSoft, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                  <Text style={{ color: p.accent, fontWeight: '800', fontSize: 13 }}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: p.text, fontWeight: '700' }}>{s.title}</Text>
                  {/* The prerequisite, above the body: it has to be read BEFORE
                      the button, so it cannot sit under the paragraph that
                      explains what the button does. */}
                  {s.note ? (
                    <Text style={{ color: CAUTION_GOLD, fontSize: 12, lineHeight: 17, fontWeight: '700', marginTop: 4 }}>{s.note}</Text>
                  ) : null}
                  <Text style={{ color: p.textDim, fontSize: 12, lineHeight: 17, marginTop: 4 }}>{s.sub}</Text>
                </View>
              </View>
              {action ? (
                <View style={{ flexDirection: 'row', marginTop: 12 }}>
                  <Button title={action.title} variant="primary" disabled={action.disabled} onPress={action.onPress} />
                </View>
              ) : null}
              {/* Only under the step that asked. Says what happened and what to
                  do about it, because "it came straight back" is otherwise
                  indistinguishable from the button doing nothing. */}
              {s.action === 'pickDevice' && pickedNothing && !linked ? (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, padding: 11, borderRadius: radius.control, backgroundColor: CAUTION_GOLD_SOFT }}>
                  <Icon name="alert" size={14} color={CAUTION_GOLD} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: CAUTION_GOLD, fontSize: 12, lineHeight: 17 }}>
                      {`Garmin Connect came back without a watch. Pair your ${brand.name} there, then tap the button again.`}
                    </Text>
                    {/* The next move, one tap away rather than described. Same
                        handler the health-store route uses, so a phone without
                        the app still lands in its store page. */}
                    <Pressable onPress={openApp} hitSlop={8} accessibilityRole="button">
                      <Text style={{ color: CAUTION_GOLD, fontSize: 12, lineHeight: 17, fontWeight: '800', marginTop: 6 }}>
                        {`Open ${brand.app}`}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}
            </View>
          );
        })}
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

      {/* The gap the footer buttons need. With no footer there is nothing to
          separate, so the direct route closes it up and the support card sits
          just under the models block. */}
      {direct ? null : <View style={{ height: 20 }} />}
      {/* Nothing on the direct route: every action it has, the way out
          included, belongs to a numbered step above. The health-store route
          keeps its footer, because its steps happen inside another app and
          there is nothing there to attach a button to. */}
      {direct ? null : (
        <>
          <Button title={`Open ${brand.app}`} variant="primary" onPress={openApp} />
          <View style={{ height: 10 }} />
          <Button title="I've already set this up" variant="ghost" onPress={() => { void alreadyConnected(); }} />
        </>
      )}
      {/* Everything above crosses into Garmin's apps, where nothing of ours can
          see a failure. A dead end there has to lead to a person. */}
      <SupportCard prompt="Stuck, or something not working? Email us!" style={{ marginTop: direct ? 14 : 22 }} />
      <View style={{ height: 20 }} />
    </View>
  );
}
