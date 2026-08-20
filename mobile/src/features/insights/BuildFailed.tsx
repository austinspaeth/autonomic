/**
 * What Insights shows when its own build THREW.
 *
 * Kept apart from `InsightsEmpty` (./InsightsSkeleton) because the two say
 * completely different things with identical data. "There isn't enough here yet"
 * invites the user to keep logging; saying that after a crash would be the app
 * lying about a journal that may hold two years. So this one blames nothing on
 * the user, confirms the journal is intact — the only question that matters when
 * a screen about your health comes up blank — and then offers the two things
 * that can actually help.
 *
 * RETRY IS REAL, not a refresh gesture. The screen clears what it built from and
 * rebuilds, so a failure caused by a transient state (a half-written day, a
 * sidecar read that lost a race) heals itself without the user learning that
 * force-quitting an app is a thing they have to know how to do.
 *
 * CONTACT SUPPORT CARRIES THE EVIDENCE. The app degrades quietly by design, so a
 * user who writes in has nothing to send; the error log exists for exactly this
 * and the mail is composed with it already in the body. Same dump as Settings'
 * hold-the-brand-card report, trimmed to a length a `mailto:` will actually open
 * (see ../../lib/diagnostics/supportEmail), and carrying no health data — journal
 * contents are counts, the profile reports which fields are filled rather than
 * their values (asserted by collectApp's own test).
 */
import React, { useState } from 'react';
import { Linking, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Button } from '../../components/ui';
import { useToast } from '../../components/Toast';
import { usePalette } from '../../theme';
import { collectAppDiagnostics } from '../../lib/diagnostics/collectApp';
import { formatAppDiagnostics } from '../../lib/diagnostics/appReport';
import { logError } from '../../lib/diagnostics/errorLog';
import { SUPPORT_EMAIL, supportBody, supportMailtoUrl } from '../../lib/diagnostics/supportEmail';

const SUBJECT = 'Autonomic: Insights report could not be built';

const INTRO = [
  'Hi Austin,',
  '',
  'Insights would not build on my phone. Here is what I was doing when it happened:',
  '',
  '',
].join('\n');

export function InsightsFailed({ onRetry }: { onRetry: () => void }) {
  const p = usePalette();
  const toast = useToast();
  const [sending, setSending] = useState(false);

  /**
   * Collect, compose, open.
   *
   * Collection touches native modules and takes a moment, hence the disabled
   * state: a second tap while the first is still gathering would open two mails.
   * Every failure mode here ends in the address on the clipboard rather than a
   * dead button — a simulator has no Mail app at all, and neither does a phone
   * with no mail account configured, which is the same fallback Settings uses.
   */
  const contact = async () => {
    if (sending) return;
    setSending(true);
    try {
      let dump = '';
      try {
        dump = formatAppDiagnostics(await collectAppDiagnostics());
      } catch (e) {
        // Diagnostics are the point, but not at the cost of the email itself.
        logError('insights.support.collect', e);
        dump = 'Diagnostics could not be collected on this device.';
      }
      await Linking.openURL(supportMailtoUrl(SUBJECT, supportBody(INTRO, dump)));
    } catch {
      await Clipboard.setStringAsync(SUPPORT_EMAIL);
      toast(`Email copied: ${SUPPORT_EMAIL}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={{ paddingHorizontal: 8, paddingTop: 28, alignItems: 'center' }}>
      <Text style={{ color: p.text, fontSize: 17, fontWeight: '700', textAlign: 'center', marginBottom: 8 }}>
        This report could not be built
      </Text>
      <Text style={{ color: p.textDim, fontSize: 14, lineHeight: 21, textAlign: 'center' }}>
        Something went wrong working out your insights. Your journal is untouched and nothing was lost. Try again below, and if it keeps happening, send us the report so we can fix it.
      </Text>
      {/* Retry leads, and is the solid button: it is the one that costs nothing
          and usually works. Support is the ghost beside it. */}
      <View style={{ flexDirection: 'row', gap: 10, alignSelf: 'stretch', marginTop: 20 }}>
        <Button title="Try again" onPress={onRetry} />
        <Button
          title={sending ? 'Preparing…' : 'Contact support'}
          variant="ghost"
          disabled={sending}
          onPress={contact}
        />
      </View>
      <Text style={{ color: p.textDim, fontSize: 11.5, lineHeight: 16, textAlign: 'center', marginTop: 12 }}>
        The support email includes a diagnostic report: your build, settings and recent errors. It carries no health data and nothing that identifies you.
      </Text>
    </View>
  );
}
