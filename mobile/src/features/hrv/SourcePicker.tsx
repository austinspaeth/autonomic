/**
 * "Measuring with" picker — the one place you choose where the heartbeat signal
 * comes from. Lists the available sources (Bluetooth strap, Apple Watch on iOS,
 * other watch brands, phone camera).
 *
 * A source that needs a DEVICE behind it (the strap, a linked Garmin) is two
 * targets in one row: the left of the row selects it, and a "Set up" link on the
 * right opens that device's own card — the strap scanner (`DevicesScreen`) or the
 * brand's setup. Choosing a source and swapping the device behind it are
 * different questions, and a row that only selects strands anyone who owns a
 * second strap. Selecting a strap source with nothing paired goes straight to the
 * scanner, since choosing a sensor you don't own yet is only half an answer.
 *
 * The strap scan itself lives on that card, never here: this sheet is about
 * which KIND of sensor, and a live list of nearby Bluetooth devices under the
 * camera and watch rows was noise for everyone not using a strap.
 *
 * The list is GROUPED BY ACCURACY TIER, and that is the only ranking it draws.
 * With five watch brands, a strap and the camera, an accuracy pill on every row
 * meant seven pills competing with seven names; a section label says the same
 * thing once and frees the row for the device and its state. The four
 * non-Apple brands collapse behind a single "Other watches" row (see
 * ./WatchBrands) because every one of them lands in the same tier as the Apple
 * Watch — a wrist optical sensor — so listing them flat would spend the whole
 * sheet on a distinction that does not exist.
 *
 * Opened from the HRV setup card's "Change" link; picking closes it and reports
 * back to that card.
 */
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { useSheets, type SheetControls } from '../../components/Sheet';
import { Icon } from '../../components/Icon';
import { radius, usePalette } from '../../theme';
import { garminDevices, subscribeGarminDevices, type GarminDevice } from '../../lib/garmin/receiver';
import { health } from '../../lib/health';
import { useStore } from '../../store/store';
import { DevicesScreen } from '../Devices';
import { brandTag, hasOtherWatches, openBrandSetup, otherWatchesSub, otherWatchesTitle, PickerRow } from './WatchBrands';

export type Source = 'polar' | 'watch' | 'garmin' | 'camera';

const CLOSE_CLEARANCE = 58;

/** The accuracy ladder, best first. It is a TABLE rather than a pill on each
 *  row because two surfaces rank these sources — this sheet and the welcome
 *  wizard's first-reading step — and a per-row badge let them drift: the wizard
 *  once listed a "High accuracy" watch above a "Best accuracy" strap, which
 *  reads as a descending list until the second row contradicts it. Both now
 *  group by tier in TIER_ORDER, so a new sensor is one row here. */
export type SourceTier = 'best' | 'high' | 'lower';
export const TIER_ORDER: SourceTier[] = ['best', 'high', 'lower'];
export const TIER_LABEL: Record<SourceTier, string> = {
  best: 'Best accuracy', high: 'High accuracy', lower: 'Lower accuracy',
};

/** One source's static copy. `sub` is resolved at render (the strap's line
 *  depends on whether a device is remembered). */
export const SOURCE_META: Record<Source, { icon: 'bluetooth' | 'watch' | 'camera'; title: string; tier: SourceTier }> = {
  polar: { icon: 'bluetooth', title: 'Bluetooth strap', tier: 'best' },
  watch: { icon: 'watch', title: 'Apple Watch', tier: 'high' },
  garmin: { icon: 'watch', title: 'Garmin', tier: 'high' },
  camera: { icon: 'camera', title: 'Phone camera', tier: 'lower' },
};

/** Sub-line for a source, used both here and on the setup card's summary row. */
export function sourceSub(src: Source, savedName?: string): string {
  if (src === 'polar') return savedName ? `${savedName} · paired` : 'No device paired yet';
  if (src === 'watch') return 'Capture on the watch, results sync afterwards';
  // Named device rather than "Garmin" alone: someone who linked a watch months
  // ago should see which one this row means.
  if (src === 'garmin') return savedName ? `${savedName} · linked` : 'Run Autonomic on the watch, results sync in afterwards';
  return 'Fingertip on the rear camera, no device needed';
}

export function SourcePicker({ value, onPick, controls }: {
  value: Source; onPick: (s: Source) => void; controls: SheetControls;
}) {
  const p = usePalette();
  const { openSheet } = useSheets();
  const savedName = useStore((s) => s.state.settings.lastBleDeviceName);
  const savedId = useStore((s) => s.state.settings.lastBleDeviceId);
  // Mirrored locally: a device set up from a card stacked on top selects its
  // source WITHOUT closing this sheet, and `value` is the snapshot this sheet
  // was opened with, so the check would otherwise stay on the old row.
  const [picked, setPicked] = useState(value);

  const select = (s: Source) => { setPicked(s); onPick(s); };
  const choose = (s: Source) => { select(s); controls.close(); };

  // The strap scanner, as a card of its own. Pairing a strap there closes it
  // (its `controls.close`) and selects Bluetooth here; its ✕ backs out without
  // changing anything, because that is the sheet's own close, not this one.
  const setUpStrap = () => openSheet((c) => (
    <DevicesScreen controls={{ ...c, close: () => { c.close(); select('polar'); } }} />
  ));
  const pickStrap = () => (savedId ? choose('polar') : setUpStrap());

  const showWatch = Platform.OS === 'ios' && health().available;
  // A linked Garmin is a SOURCE (it delivers raw beat-to-beat straight to us);
  // an unlinked one is only a setup task, and stays inside Other watches.
  // Subscribed, not read once: the device list arrives from Garmin Connect
  // through a URL callback well after this sheet first rendered, so a plain
  // read leaves the row missing until the sheet is reopened.
  const [garmin, setGarmin] = useState<GarminDevice[]>(garminDevices);
  // Just mirror the list. Selecting on link is the setup card's job (it knows
  // the user actually asked); doing it here too would let a device discovered
  // at launch quietly change a source the user had already chosen.
  useEffect(() => subscribeGarminDevices(setGarmin), []);
  const linkedGarmin = garmin[0];
  const showBrands = hasOtherWatches();
  const setUpGarmin = () => openBrandSetup(openSheet, () => select('garmin'));

  return (
    <View>
      <Text style={{ fontSize: 21, fontWeight: '700', color: p.text, marginBottom: 6, paddingRight: CLOSE_CLEARANCE }}>Measuring with</Text>
      <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 20, marginBottom: 18, paddingRight: CLOSE_CLEARANCE }}>
        {/* The tier headings below already rank these, so the old
            "a chest strap is the most accurate" tail would say it twice. */}
        Where the heartbeat signal comes from.
      </Text>

      <TierLabel text={TIER_LABEL.best} />
      <SourceRow source="polar" sub={sourceSub('polar', savedName)} active={picked === 'polar'} onPress={pickStrap} onSetUp={setUpStrap} />

      {showWatch || linkedGarmin || showBrands ? (
        <>
          <TierLabel text={TIER_LABEL.high} top />
          <View style={{ gap: 8 }}>
            {showWatch ? (
              <SourceRow source="watch" sub={sourceSub('watch')} active={picked === 'watch'} onPress={() => choose('watch')} />
            ) : null}
            {linkedGarmin ? (
              <SourceRow
                source="garmin"
                sub={sourceSub('garmin', linkedGarmin.name)}
                active={picked === 'garmin'}
                onPress={() => choose('garmin')}
                onSetUp={setUpGarmin}
              />
            ) : showBrands ? (
              // Not a source yet — a setup task, so the whole row opens the
              // brand's own card rather than selecting anything. It goes
              // STRAIGHT to setup: with one brand built, the list card in
              // between was a screen that existed only to be tapped through.
              <PickerRow
                icon="watch"
                title={otherWatchesTitle()}
                tag={brandTag()}
                sub={otherWatchesSub()}
                onPress={setUpGarmin}
              >
                <Text style={{ color: p.accent, fontSize: 13, fontWeight: '700' }}>Set up</Text>
              </PickerRow>
            ) : null}
          </View>
        </>
      ) : null}

      <TierLabel text={TIER_LABEL.lower} top />
      <SourceRow source="camera" sub={sourceSub('camera')} active={picked === 'camera'} onPress={() => choose('camera')} />
      <View style={{ height: 16 }} />
    </View>
  );
}

/** One accuracy tier's heading. Exported, with SourceRow, for the welcome
 *  wizard's first-reading step: the two surfaces offer the same choice, so they
 *  draw it with the same components rather than a lookalike each. */
export function TierLabel({ text, top }: { text: string; top?: boolean }) {
  const p = usePalette();
  return (
    <Text style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.6, color: p.textDim, fontWeight: '700', marginTop: top ? 20 : 0, marginBottom: 10 }}>{text}</Text>
  );
}

export function SourceRow({ source, sub, active, onPress, onSetUp }: {
  source: Source; sub: string; active: boolean; onPress: () => void;
  /** The device behind this source has a card of its own. Given, the row splits
   *  into two targets: the left selects, a "Set up" link on the right opens the
   *  card, and a selected row puts a hairline between that link and its check
   *  so the two never read as one control. */
  onSetUp?: () => void;
}) {
  const p = usePalette();
  const meta = SOURCE_META[source];
  const check = <Icon name="check" size={18} color={p.accent} />;
  return (
    <View style={{ flexDirection: 'row', borderRadius: radius.control, borderWidth: 1, borderColor: active ? p.accent : p.border, backgroundColor: active ? p.accentSoft : p.surface2 }}>
      <Pressable
        onPress={onPress}
        accessibilityRole="radio"
        accessibilityState={{ selected: active }}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, paddingRight: onSetUp ? 6 : 14 }}
      >
        <Icon name={meta.icon} size={22} color={active ? p.accent : p.textDim} />
        <View style={{ flex: 1, minWidth: 0 }}>
          {/* No accuracy pill: the tier heading above the row already said it. */}
          <Text style={{ color: active ? p.accent : p.text, fontWeight: '700' }}>{meta.title}</Text>
          <Text style={{ color: p.textDim, fontSize: 12, lineHeight: 17, marginTop: 4 }}>{sub}</Text>
        </View>
        {!onSetUp && active ? check : null}
      </Pressable>
      {onSetUp ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingRight: 14 }}>
          {/* Full row height, so the link's target is the whole right edge of
              the row and not just the height of its text. */}
          <Pressable
            onPress={onSetUp}
            accessibilityRole="button"
            accessibilityLabel={`Set up ${meta.title}`}
            style={{ alignSelf: 'stretch', justifyContent: 'center', paddingHorizontal: 8 }}
          >
            <Text style={{ color: p.accent, fontSize: 13, fontWeight: '700' }}>Set up</Text>
          </Pressable>
          {active ? (
            <>
              <View style={{ width: 1, height: 18, backgroundColor: p.accent, marginLeft: 4, marginRight: 12 }} />
              {check}
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
