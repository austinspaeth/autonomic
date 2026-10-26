/* Access codes: days of full access, or the $24.99/year price, handed to one
 * person at a time, typed into the app at Settings → Subscription → Redeem a code. New code first, then every code
 * and whether it has been used. A code works once, and is created and never edited or
 * deleted: the grant lives on the phone once redeemed. */
import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { Choice, Field, NumberField, SaveButton } from '../components/forms';
import { Sheet } from '../components/Sheet';
import { Card, Divider, Empty } from '../components/ui';
import { api } from '../lib/api';
import { ago } from '../lib/dates';
import type { AccessCode } from '../lib/types';
import { C } from '../theme';

const FOREVER = 999;
type Preset = '30' | '60' | '365' | '999' | 'custom';
const PRESETS: { key: Preset; label: string }[] = [
  { key: '30', label: '30d' },
  { key: '60', label: '60d' },
  { key: '365', label: '1y' },
  { key: '999', label: 'Forever' },
  { key: 'custom', label: 'Other' },
];
const PLATFORMS: Record<string, string> = { I: 'iOS', A: 'Android' };

const lengthOf = (r: Pick<AccessCode, 'days' | 'kind'>) =>
  r.kind === 'promo' ? '$24.99/yr' : r.days >= FOREVER ? 'Forever' : `${r.days} day${r.days === 1 ? '' : 's'}`;
type Kind = 'days' | 'promo';
const KINDS: { key: Kind; label: string }[] = [
  { key: 'days', label: 'Free access' },
  { key: 'promo', label: '$24.99/year' },
];

export function CodesView() {
  const [rows, setRows] = useState<AccessCode[] | null>(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows((await api.codes()).rows || []);
      setError('');
    } catch (e: any) {
      setError(e?.message || 'Could not load the codes.');
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const copy = async (code: string) => {
    await Clipboard.setStringAsync(code);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  return (
    <>
      <Pressable onPress={() => setAdding(true)} style={({ pressed }) => [s.newBtn, pressed && { opacity: 0.7 }]}>
        <SymbolView name="plus" size={15} weight="bold" tintColor="#fff" />
        <Text style={s.newText}>New code</Text>
      </Pressable>

      <Card title={rows ? `Codes · ${rows.length}` : 'Codes'}>
        {error ? (
          <Text style={s.err}>{error}</Text>
        ) : !rows ? (
          <ActivityIndicator color={C.dim} />
        ) : rows.length ? (
          rows.map((r, i) => (
            <View key={r.code}>
              {i ? <Divider /> : null}
              <View style={s.row}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[s.code, r.used && { color: C.muted }]} numberOfLines={1}>
                    {r.code}
                    <Text style={s.len}>{`  ${lengthOf(r)}`}</Text>
                  </Text>
                  <Text style={s.sub} numberOfLines={1}>
                    {[
                      r.note,
                      r.used
                        ? `used${r.redeemedAt ? ` ${ago(Date.parse(r.redeemedAt))}` : ''}${r.redeemedPlatform && PLATFORMS[r.redeemedPlatform] ? ` · ${PLATFORMS[r.redeemedPlatform]}` : ''}`
                        : 'unused',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
                <Pressable hitSlop={10} onPress={() => copy(r.code)} style={s.copy}>
                  <SymbolView name="doc.on.doc" size={15} tintColor={C.dim} />
                </Pressable>
              </View>
            </View>
          ))
        ) : (
          <Empty>No codes yet.</Empty>
        )}
      </Card>

      <Text style={s.hint}>
        A free-access code adds its days on top of whatever access the phone still has. A $24.99/year code opens that plan's purchase and is only used once the purchase succeeds. Either works once, then reads as used everywhere, and cannot be changed or revoked.
      </Text>

      <Sheet visible={adding} onClose={() => setAdding(false)} title="New code">
        {(close) =>
          adding ? (
            <CodeForm
              done={(made) => {
                setRows((prev) => [made, ...(prev || [])]);
                copy(made.code);
                close();
              }}
            />
          ) : null
        }
      </Sheet>
    </>
  );
}

function CodeForm({ done }: { done: (made: AccessCode) => void }) {
  const [kind, setKind] = useState<Kind>('days');
  const [preset, setPreset] = useState<Preset>('30');
  const [custom, setCustom] = useState('');
  const [note, setNote] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const days = preset === 'custom' ? Math.round(Number(custom)) : Number(preset);
  const valid = kind === 'promo' || (days >= 1 && days <= FOREVER);

  return (
    <View style={{ gap: 14 }}>
      <Choice label="Gives" options={KINDS} value={kind} onChange={setKind} />
      {kind === 'days' ? <Choice label="Length" options={PRESETS} value={preset} onChange={setPreset} /> : null}
      {kind === 'days' && preset === 'custom' ? <NumberField label="Days" value={custom} onChange={setCustom} decimal={false} hint={`1 to ${FOREVER}`} /> : null}
      <Field label="Who it is for" value={note} onChange={setNote} placeholder="Optional, only you see it" />
      <Field
        label="Code"
        value={code}
        onChange={(t) => setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
        placeholder="Leave empty to generate"
        autoCapitalize="none"
        hint="6 to 24 letters and numbers"
      />
      {error ? <Text style={s.err}>{error}</Text> : null}
      <SaveButton
        label="Create and copy"
        disabled={!valid}
        onPress={async () => {
          setError('');
          try {
            const r = await api.createCode({ kind, days: kind === 'promo' ? 0 : days, code, note });
            if (!r?.ok || !r.code) {
              setError(r?.error || 'Could not create the code.');
              return;
            }
            done(r.code);
          } catch (e: any) {
            setError(e?.message || 'Could not create the code.');
          }
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  hint: { color: C.muted, fontSize: 12, lineHeight: 17, paddingHorizontal: 4 },
  err: { color: C.down, fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  code: { color: C.text, fontSize: 15, fontWeight: '700', letterSpacing: 0.5 },
  len: { color: C.dim, fontSize: 13, fontWeight: '500', letterSpacing: 0 },
  sub: { color: C.muted, fontSize: 12, marginTop: 2 },
  copy: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  newBtn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: C.accent, borderRadius: 16, paddingVertical: 15 },
  newText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
