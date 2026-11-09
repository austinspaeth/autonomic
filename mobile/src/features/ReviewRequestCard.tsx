/**
 * The review request card — Claude Design "Review Request Card" (71a).
 *
 * Sits in the Journal directly above Milestones, on today only, and asks once.
 * It is Austin's own note, in the first person, with two doors out of it: the
 * store's review composer, or an email to him. Dismissing it and tapping either
 * button are the same answer — the card is finished with and never returns
 * (../lib/review/cardMemory).
 *
 * Every rule about WHEN it may open lives in ../lib/review/card (pure, tested).
 * This file asks once per journal change, renders, and records the answer.
 *
 * The tile is the design's: a SOLID gold star on dark translucent gold. It is
 * the universal mark for the thing being asked for, which is what makes it
 * worth its own colour here — the one place in the app gold is not a grade. The
 * card directly below is Milestones, whose tile is an outlined star in RED, so
 * the two are told apart by colour and weight rather than by shape.
 *
 * One departure: the frame is the Milestones card's frame, measure for measure
 * — same border, radius, surface and 42pt icon tile — because that card sits
 * immediately below and the two are the same kind of object.
 *
 * The copy is the design's, word for word. It is Austin's, and it is the only
 * place in the app that speaks as him.
 */
import React, { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Button } from '../components/ui';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';
import { radius, usePalette } from '../theme';
import { hexA } from '../lib/color';
import { todayKey } from '../lib/dates';
import { resolveProtocol } from '../lib/scoring/day';
import { profileCtx } from '../lib/scoring';
import { useAppState } from '../store/store';
import { NOTE_SUBJECT, reviewCardDue, reviewCardLive, reviewUrlFor } from '../lib/review/card';
import {
  FORCE_REVIEW_CARD, beginFailureWatch, noteReviewCardAnswered, noteReviewCardShown,
  reviewCardMemory,
} from '../lib/review/cardMemory';
import { paywallSeenThisSession, reviewMemory } from '../lib/review';
import { pingReviewCard } from '../store/ping';
import { SUPPORT_EMAIL, supportMailtoUrl } from '../lib/diagnostics/supportEmail';
import { liveOffer } from '../lib/upsell/annual';
import { holidayOwnsSlot } from '../lib/upsell/holidayMemory';
import { annualMemory } from '../lib/upsell/annualMemory';
import { founderMemory } from '../lib/upsell/founderMemory';

/**
 * The design's gold, and deliberately NOT `CAUTION_GOLD` (#eab308), which is a
 * brighter yellow and is spoken for: it is the Moderate grade, the back-dated
 * save button and the degraded-reading mark. This is a warmer amber that reads
 * as a review star rather than as a caution, and it lives here rather than in
 * ../theme because this card is the only thing entitled to use it.
 */
const STAR_GOLD = '#e3a51c';

/** Is one of the three proactive offer cards holding the slot under the
 *  Outlook? Read the same way FounderOffer reads the annual card's liveness. */
function offerLive(dk: string): boolean {
  if (liveOffer(annualMemory()) != null) return true;
  if (holidayOwnsSlot()) return true;
  const f = founderMemory();
  return f.shownDk === dk && !f.dismissed;
}

export function ReviewRequestCard({ dk }: { dk: string }) {
  const p = usePalette();
  const toast = useToast();
  const state = useAppState();
  const forced = __DEV__ && FORCE_REVIEW_CARD;
  // A card already raised renders from its own memory and asks nothing further
  // — see `standing` in ../lib/review/card. `answered` hides it for the rest of
  // this session without waiting on a store read; the memory keeps it hidden
  // for every session after.
  const [live, setLive] = useState(() => forced || reviewCardLive(reviewCardMemory()));
  const [answered, setAnswered] = useState(false);

  // The clock on "no failures" starts the first time the question is asked on
  // this install, which is the first Journal render of the first build that
  // records them. Nothing before this instant is ever claimed as watched.
  useEffect(() => { beginFailureWatch(); }, []);

  // Whether to RAISE it. Asked only while it is not already standing, because
  // every rule in `reviewCardDue` is about whether today is a day to start
  // asking, and a card on screen has already asked. Stamped and pinged BEFORE
  // it renders, the review ask's own rule: nothing reports back that it was
  // seen, so a showing that is not recorded first is one that can repeat.
  useEffect(() => {
    if (live || answered || forced) return;
    const due = reviewCardDue({
      days: state.days,
      dk,
      today: todayKey(),
      ctx: profileCtx(state.profile),
      protocol: resolveProtocol(state.settings.protocol),
      custom: state.customTypes,
      memory: reviewCardMemory(),
      nowMs: Date.now(),
      source: state.settings.lastHrvSource,
      platform: Platform.OS,
      crashAlertFiredToday: state.settings.crashAlert?.lastFired === dk,
      paywallSeenThisSession: paywallSeenThisSession(),
      offerLive: offerLive(dk),
      osPromptAsked: reviewMemory().lastAskedAtMs != null,
    });
    if (!due.ok) return;
    noteReviewCardShown();
    pingReviewCard('shown');
    setLive(true);
  }, [state, dk, live, answered, forced]);

  /** Answered is answered, whichever of the three controls said so, and each
   *  says WHICH on the `rvc` route — the split is the whole point of the
   *  counter. A forced dev card records nothing and pings nothing, so poking at
   *  it on a device cannot spend that device's real ask. */
  const answer = (action: 'review' | 'note' | 'dismissed') => {
    setAnswered(true);
    if (forced) return;
    noteReviewCardAnswered();
    pingReviewCard(action);
  };

  const review = () => {
    answer('review');
    Linking.openURL(reviewUrlFor(Platform.OS)).catch(() => {
      toast('Could not open the store');
    });
  };

  /** Devices with no mail account (and the iOS Simulator, which has no Mail at
   *  all) cannot handle `mailto:` — copy the address rather than let the tap do
   *  nothing, the rule `emailSupport` in ./SupportCard already follows. */
  const note = async () => {
    answer('note');
    try {
      await Linking.openURL(supportMailtoUrl(NOTE_SUBJECT, ''));
    } catch {
      await Clipboard.setStringAsync(SUPPORT_EMAIL);
      toast(`Email copied: ${SUPPORT_EMAIL}`);
    }
  };

  // Today only, standing or not: a favour asked on a day the reader scrolled
  // back to is asked about the wrong day.
  if (!live || answered || dk !== todayKey()) return null;

  return (
    <View style={{
      borderWidth: 1, borderColor: p.border, borderRadius: radius.card,
      backgroundColor: p.surface, marginBottom: 12, padding: 15,
    }}>
      {/* Who is asking, and the one way out. The ✕ keeps a full 44pt target and
          sits in the header row rather than floating in the corner, so the two
          taps that could end the card are never neighbours. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{
          width: 42, height: 42, borderRadius: 9, alignItems: 'center',
          justifyContent: 'center', backgroundColor: hexA(STAR_GOLD, 0.12),
        }}>
          <Icon name="star" size={21} color={STAR_GOLD} filled strokeWidth={1} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: p.text }}>A note from Austin</Text>
          <Text numberOfLines={2} style={{ fontSize: 12.5, color: p.textDim, marginTop: 1 }}>
            Built Autonomic · lives with long COVID
          </Text>
        </View>
        <Pressable
          onPress={() => answer('dismissed')}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          style={({ pressed }) => [
            { width: 44, height: 44, marginRight: -9, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
            pressed && { opacity: 0.6 },
          ]}
        >
          <Icon name="x" size={18} color={p.textDim} strokeWidth={2.4} />
        </Pressable>
      </View>

      <Text style={{ fontSize: 15, lineHeight: 23, color: p.text, marginTop: 14 }}>
        I need your help. A review helps others find Autonomic, and a note helps me make it better. Together, we can help more people living with autonomic issues. Thank you 💙
      </Text>

      <View style={{ marginTop: 16, gap: 8 }}>
        <View style={{ flexDirection: 'row' }}>
          <Button title="Leave a review" variant="primary" onPress={review} />
        </View>
        <View style={{ flexDirection: 'row' }}>
          <Button title="Send me a note" onPress={note} />
        </View>
      </View>
    </View>
  );
}
