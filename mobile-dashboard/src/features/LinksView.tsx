/* Links: the campaign download pages at autonomic.care/download/<slug>.
 * Republish, then the campaigns, then New campaign. Saving a campaign
 * publishes its page immediately (the API writes it into the site). */
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { DangerButton, Field, SaveButton } from '../components/forms';
import { Sheet } from '../components/Sheet';
import { Card, Divider, Empty } from '../components/ui';
import { api } from '../lib/api';
import { useData } from '../lib/data';
import { easternDay } from '../lib/dates';
import type { CampaignLink } from '../lib/types';
import { C } from '../theme';

const BASE = 'autonomic.care/download/';
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

export function LinksView() {
  const { snap, refresh } = useData();
  const links = snap?.load?.links || [];
  const [editing, setEditing] = useState<CampaignLink | 'new' | null>(null);
  const [status, setStatus] = useState('');

  return (
    <>
      <Card>
        <Text style={s.hint}>Every campaign page is rewritten from what is stored here. Use it after a release that changes the page itself.</Text>
        <SaveButton
          label="Republish every page"
          onPress={async () => {
            setStatus('');
            const r = await api.republishLinks();
            setStatus(`Republished${r?.published !== undefined ? ` ${r.published} pages` : ''}.`);
          }}
        />
        {status ? <Text style={s.ok}>{status}</Text> : null}
      </Card>

      <Card title={`Campaigns · ${links.length}`}>
        {links.length ? (
          links.map((l, i) => (
            <View key={l.slug}>
              {i ? <Divider /> : null}
              <Pressable onPress={() => setEditing(l)} style={({ pressed }) => [s.row, pressed && { opacity: 0.6 }]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.label} numberOfLines={1}>
                    {l.label || l.slug}
                  </Text>
                  <Text style={s.url} numberOfLines={1}>
                    {BASE}
                    {l.slug}
                  </Text>
                </View>
                <Pressable
                  hitSlop={10}
                  onPress={async () => {
                    await Clipboard.setStringAsync(`https://${BASE}${l.slug}`);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  }}
                  style={s.copy}
                >
                  <SymbolView name="doc.on.doc" size={15} tintColor={C.dim} />
                </Pressable>
              </Pressable>
            </View>
          ))
        ) : (
          <Empty>No campaigns yet.</Empty>
        )}
      </Card>

      <Pressable onPress={() => setEditing('new')} style={({ pressed }) => [s.newBtn, pressed && { opacity: 0.7 }]}>
        <SymbolView name="plus" size={15} weight="bold" tintColor="#fff" />
        <Text style={s.newText}>New campaign</Text>
      </Pressable>

      <Sheet visible={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'New campaign' : 'Edit campaign'}>
        {(close) => (editing ? <LinkForm link={editing === 'new' ? null : editing} taken={links.map((l) => l.slug)} done={close} refresh={refresh} /> : null)}
      </Sheet>
    </>
  );
}

function LinkForm({ link, taken, done, refresh }: { link: CampaignLink | null; taken: string[]; done: () => void; refresh: () => Promise<void> }) {
  const [slug, setSlug] = useState(link?.slug ?? '');
  const [label, setLabel] = useState(link?.label ?? '');
  const [ios, setIos] = useState(link?.ios ?? '');
  const [android, setAndroid] = useState(link?.android ?? '');
  const [web, setWeb] = useState(link?.web ?? '');
  const [note, setNote] = useState(link?.note ?? '');
  const clean = slug.trim().toLowerCase();
  const clash = clean !== link?.slug && taken.includes(clean);
  const valid = SLUG_RE.test(clean) && !clash;

  return (
    <View style={{ gap: 14 }}>
      <Field
        label="Slug"
        value={slug}
        onChange={(t) => setSlug(t.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
        placeholder="facebook"
        autoCapitalize="none"
        hint={clash ? 'That slug is taken.' : `${BASE}${clean || 'slug'}`}
      />
      <Field label="Label" value={label} onChange={setLabel} placeholder="Facebook ads, October" />
      <Field label="App Store URL" value={ios} onChange={setIos} placeholder="Blank = the default store page" keyboard="url" autoCapitalize="none" />
      <Field label="Play Store URL" value={android} onChange={setAndroid} placeholder="Blank = the default store page" keyboard="url" autoCapitalize="none" />
      <Field label="Web URL" value={web} onChange={setWeb} placeholder="Blank = autonomic.care" keyboard="url" autoCapitalize="none" />
      <Field label="Note" value={note} onChange={setNote} placeholder="Optional" />
      <SaveButton
        label={link ? 'Save and publish' : 'Create and publish'}
        disabled={!valid}
        onPress={async () => {
          const out: CampaignLink = { slug: clean, created: link?.created ?? easternDay() };
          if (label.trim()) out.label = label.trim();
          if (ios.trim()) out.ios = ios.trim();
          if (android.trim()) out.android = android.trim();
          if (web.trim()) out.web = web.trim();
          if (note.trim()) out.note = note.trim();
          // The slug IS the URL: renaming is a new link plus deleting the old one.
          await api.sync({ linkUpserts: [out], ...(link && link.slug !== clean ? { linkDeletes: [link.slug] } : {}) });
          await refresh();
          done();
        }}
      />
      {link ? (
        <DangerButton
          label="Delete campaign"
          onPress={() =>
            Alert.alert('Delete this campaign?', `${BASE}${link.slug} stops working.`, [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                  await api.sync({ linkDeletes: [link.slug] });
                  await refresh();
                  done();
                },
              },
            ])
          }
        />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  hint: { color: C.muted, fontSize: 12, lineHeight: 17 },
  ok: { color: C.up, fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  label: { color: C.text, fontSize: 15, fontWeight: '600' },
  url: { color: C.muted, fontSize: 12, marginTop: 1 },
  copy: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  newBtn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: C.accent, borderRadius: 16, paddingVertical: 15 },
  newText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
