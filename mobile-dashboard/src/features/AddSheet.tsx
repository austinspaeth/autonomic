/* Writing to the dashboard from the phone: the plus button's card and the
 * sale editor. Every save goes through the same SYNC action the web uses, so
 * the web picks it up on its next load. An entry upsert REPLACES the
 * date+store record, so store data is merged over what is already recorded
 * for that day rather than wiping the fields left blank here. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { Sheet } from '../components/Sheet';
import { Choice, DangerButton, DateField, Field, newId, num, NumberField, SaveButton } from '../components/forms';
import { Segmented } from '../components/ui';
import { api } from '../lib/api';
import { useData } from '../lib/data';
import { addDays, easternDay, shortDate } from '../lib/dates';
import type { Churn, Entry, Platform, Sale } from '../lib/types';
import { mrrOf } from '../lib/sales';
import { C } from '../theme';

type Kind = 'store' | 'sale' | 'churn';

const OPTIONS: { key: Kind; label: string; icon: SFSymbol; color: string }[] = [
  { key: 'store', label: 'Store data', icon: 'chart.bar.fill', color: C.series },
  { key: 'sale', label: 'Sale', icon: 'dollarsign', color: '#FFC93C' },
  { key: 'churn', label: 'Churn', icon: 'arrow.down.right', color: '#e66767' },
];

const PLATFORMS: { key: Platform; label: string }[] = [
  { key: 'ios', label: 'iOS' },
  { key: 'android', label: 'Android' },
];

export function AddSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  /* A ref, not state: the sheet's close callback is captured when its card
     renders, so it would read the choice from BEFORE the tap and do nothing
     on the first try. */
  const pending = useRef<Kind | null>(null);
  const [entry, setEntry] = useState<Kind | null>(null);
  return (
    <>
      <Sheet
        visible={visible}
        onClose={() => {
          onClose();
          // The chooser has animated away: now raise the full card it picked.
          if (pending.current) {
            setEntry(pending.current);
            pending.current = null;
          }
        }}
        title="Add"
      >
        {(close) => (
          <View style={{ gap: 8 }}>
            {OPTIONS.map((o) => (
              <Pressable
                key={o.key}
                onPress={() => {
                  Haptics.selectionAsync();
                  pending.current = o.key;
                  close();
                }}
                style={({ pressed }) => [st.option, pressed && { opacity: 0.7 }]}
              >
                <View style={[st.optIcon, { backgroundColor: `${o.color}26` }]}>
                  <SymbolView name={o.icon} size={18} weight="bold" tintColor={o.color} />
                </View>
                <Text style={[st.optTitle, { flex: 1 }]}>{o.label}</Text>
                <SymbolView name="chevron.right" size={13} weight="semibold" tintColor={C.muted} />
              </Pressable>
            ))}
          </View>
        )}
      </Sheet>
      <EntrySheet kind={entry} onClose={() => setEntry(null)} />
    </>
  );
}

type Mode = 'ping' | 'sales' | 'single' | 'batch';
const MODES: Record<Kind, { key: Mode; label: string }[]> = {
  sale: [
    { key: 'ping', label: 'From ping' },
    { key: 'single', label: 'Single' },
  ],
  store: [
    { key: 'single', label: 'Single' },
    { key: 'batch', label: 'Batch' },
  ],
  churn: [
    { key: 'sales', label: 'Sales' },
    { key: 'single', label: 'Single' },
  ],
};
const TITLES: Record<Kind, string> = { store: 'Store data', sale: 'Add a sale', churn: 'Record churn' };

/** The full-height entry card: a pill selector over the form for that mode. */
function EntrySheet({ kind, onClose }: { kind: Kind | null; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>('single');
  const [prefill, setPrefill] = useState<SalePrefill | null>(null);
  const [churnSale, setChurnSale] = useState<Sale | null>(null);
  useEffect(() => {
    if (kind) {
      setMode(kind === 'sale' ? 'ping' : kind === 'churn' ? 'sales' : 'single');
      setPrefill(null);
      setChurnSale(null);
    }
  }, [kind]);
  return (
    <Sheet visible={!!kind} onClose={onClose} title={kind ? TITLES[kind] : ''} full>
      {(close) =>
        kind ? (
          <View style={{ flex: 1, gap: 14 }}>
            <Segmented
              options={MODES[kind]}
              value={mode}
              onChange={(m) => {
                setMode(m);
                if (m !== 'single') {
                  setPrefill(null);
                  setChurnSale(null);
                }
              }}
            />
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 40 }}
              keyboardShouldPersistTaps="handled"
              automaticallyAdjustKeyboardInsets
              showsVerticalScrollIndicator={false}
            >
              <Animated.View key={`${mode}|${prefill?.ping ?? ''}|${churnSale?.id ?? ''}`} entering={FadeIn.duration(180)}>
                {kind === 'store' ? (
                  mode === 'batch' ? <StoreBatch done={close} /> : <StoreForm done={close} />
                ) : kind === 'churn' ? (
                  mode === 'sales' ? (
                    <SalePicker
                      onPick={(x) => {
                        setChurnSale(x);
                        setMode('single');
                      }}
                    />
                  ) : (
                    <ChurnForm sale={churnSale ?? undefined} done={close} />
                  )
                ) : mode === 'ping' ? (
                  <FromPing
                    onPick={(p) => {
                      setPrefill(p);
                      setMode('single');
                    }}
                  />
                ) : (
                  <SaleForm prefill={prefill ?? undefined} done={close} />
                )}
              </Animated.View>
            </ScrollView>
          </View>
        ) : null
      }
    </Sheet>
  );
}

/* --------------------------------------------------------------- store */

function StoreForm({ done }: { done: () => void }) {
  const { snap, refresh } = useData();
  const [date, setDate] = useState(addDays(easternDay(), -1));
  const [platform, setPlatform] = useState<Platform>('ios');
  const existing = useMemo(
    () => (snap?.load?.entries || []).find((e) => e.date === date && e.platform === platform),
    [snap, date, platform],
  );
  const [f, setF] = useState({ downloads: '', impressions: '', pageViews: '', updates: '' });
  useEffect(() => {
    const v = (n?: number) => (n === undefined || n === null ? '' : String(n));
    setF({ downloads: v(existing?.downloads), impressions: v(existing?.impressions), pageViews: v(existing?.pageViews), updates: v(existing?.updates) });
  }, [existing]);
  const set = (k: keyof typeof f) => (t: string) => setF((cur) => ({ ...cur, [k]: t }));

  return (
    <View style={st.form}>
      <DateField label="Day" value={date} onChange={setDate} />
      <Choice label="Store" options={PLATFORMS} value={platform} onChange={setPlatform} />
      {existing ? <Text style={st.note}>Already recorded for this day; editing it.</Text> : null}
      <View style={st.pair}>
        <View style={{ flex: 1 }}>
          <NumberField label="Downloads" value={f.downloads} onChange={set('downloads')} decimal={false} />
        </View>
        <View style={{ flex: 1 }}>
          <NumberField label="Updates" value={f.updates} onChange={set('updates')} decimal={false} />
        </View>
      </View>
      <View style={st.pair}>
        <View style={{ flex: 1 }}>
          <NumberField label="Impressions" value={f.impressions} onChange={set('impressions')} decimal={false} />
        </View>
        <View style={{ flex: 1 }}>
          <NumberField label="Page views" value={f.pageViews} onChange={set('pageViews')} decimal={false} />
        </View>
      </View>
      <SaveButton
        label={existing ? 'Update day' : 'Save day'}
        onPress={async () => {
          const entry: Entry = { ...(existing || {}), date, platform };
          (['downloads', 'impressions', 'pageViews', 'updates'] as const).forEach((k) => {
            const n = num(f[k]);
            if (n === null) delete entry[k];
            else entry[k] = n;
          });
          await api.sync({ upserts: [entry] });
          await refresh();
          done();
        }}
      />
    </View>
  );
}

/* ---------------------------------------------------------------- sale */

const PLANS: { key: Sale['plan']; label: string }[] = [
  { key: 'monthly', label: 'Monthly' },
  { key: 'annual', label: 'Annual' },
  { key: 'lifetime', label: 'Lifetime' },
];

function SaleForm({ sale, prefill, done }: { sale?: Sale; prefill?: SalePrefill; done: () => void }) {
  const { refresh } = useData();
  const seed = sale ?? prefill;
  const [date, setDate] = useState(seed?.date ?? easternDay());
  const [platform, setPlatform] = useState<Platform>(seed?.platform ?? 'ios');
  const [plan, setPlan] = useState<Sale['plan']>(seed?.plan && seed.plan !== 'unknown' ? seed.plan : 'annual');
  const [price, setPrice] = useState(sale ? String(sale.price) : '');
  const [qty, setQty] = useState(sale ? String(sale.qty) : '1');
  const [hasCohort, setHasCohort] = useState(!!seed?.cohort);
  const [cohort, setCohort] = useState(seed?.cohort ?? addDays(easternDay(), -7));
  const [cancelled, setCancelled] = useState(!!sale?.cancelled);
  const [cancelDate, setCancelDate] = useState(sale?.cancelled ?? easternDay());
  const [refunded, setRefunded] = useState(!!sale?.refunded);
  const [note, setNote] = useState(seed?.note ?? '');
  const valid = num(price) !== null && (num(qty) ?? 0) >= 1;

  return (
    <View style={st.form}>
      {prefill ? <Text style={st.prefill}>{prefill.hint}</Text> : null}
      <DateField label="Purchased" value={date} onChange={setDate} />
      <Choice label="Store" options={PLATFORMS} value={platform} onChange={setPlatform} />
      <Choice label="Plan" options={PLANS} value={plan} onChange={setPlan} />
      <View style={st.pair}>
        <View style={{ flex: 2 }}>
          <NumberField label="Price" prefix="$" value={price} onChange={setPrice} />
        </View>
        <View style={{ flex: 1 }}>
          <NumberField label="Quantity" value={qty} onChange={setQty} decimal={false} />
        </View>
      </View>
      <Toggle label="Buyer's install date" value={hasCohort} onChange={setHasCohort} />
      {hasCohort && (num(qty) ?? 1) === 1 ? <DateField label="Installed" value={cohort} onChange={setCohort} max={date} /> : null}
      {sale ? (
        <>
          <Toggle label="Cancelled" value={cancelled} onChange={setCancelled} />
          {cancelled ? <DateField label="Cancelled on" value={cancelDate} onChange={setCancelDate} /> : null}
          <Toggle label="Refunded" value={refunded} onChange={setRefunded} />
        </>
      ) : null}
      <Field label="Note" value={note} onChange={setNote} placeholder="Optional" />
      <SaveButton
        label={sale ? 'Save changes' : 'Add sale'}
        disabled={!valid}
        onPress={async () => {
          const q = Math.max(1, Math.round(num(qty) ?? 1));
          const out: Sale = {
            id: sale?.id ?? newId('m'),
            date,
            platform,
            plan,
            price: num(price) ?? 0,
            qty: q,
          };
          if (hasCohort && q === 1 && cohort <= date) out.cohort = cohort;
          if (cancelled && cancelDate >= date) out.cancelled = cancelDate;
          if (refunded) out.refunded = true;
          if (note.trim()) out.note = note.trim();
          // Tied to its ping, so that ping reads as recorded (the web's rule).
          const ping = sale?.ping ?? prefill?.ping;
          if (ping) out.ping = ping;
          await api.sync({ saleUpserts: [out] });
          await refresh();
          done();
        }}
      />
      {sale ? (
        <DangerButton
          label="Delete sale"
          onPress={() =>
            Alert.alert('Delete this sale?', 'It is removed from the ledger for good.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                  await api.sync({ saleDeletes: [sale.id] });
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

/** The ledger row editor, opened from the Sales list. */
export function SaleEditor({ sale, onClose }: { sale: Sale | null; onClose: () => void }) {
  return (
    <Sheet visible={!!sale} onClose={onClose} title="Edit sale">
      {(close) => (sale ? <SaleForm sale={sale} done={close} /> : null)}
    </Sheet>
  );
}

/* --------------------------------------------------------------- churn */

function ChurnForm({ sale, done }: { sale?: Sale; done: () => void }) {
  if (sale) return <CancelSale sale={sale} done={done} />;
  return <UnattachedChurn done={done} />;
}

/**
 * Churn on a purchase you can point at: the purchase is marked cancelled on
 * the day it stopped, which is how the web records a cancellation. It stops
 * counting toward MRR from that day; the money it already paid stays.
 */
function CancelSale({ sale, done }: { sale: Sale; done: () => void }) {
  const { refresh } = useData();
  const [date, setDate] = useState(sale.cancelled ?? easternDay());
  const [note, setNote] = useState(sale.note ?? '');
  const mrr = mrrOf(sale);
  return (
    <View style={st.form}>
      <View style={st.saleCard}>
        <Text style={st.optTitle}>
          {PLAN_LABEL[sale.plan]} · ${(sale.price * sale.qty).toFixed(2)}
          {sale.qty > 1 ? ` ×${sale.qty}` : ''}
        </Text>
        <Text style={st.optSub}>
          Bought {shortDate(sale.date)} · {sale.platform === 'ios' ? 'iOS' : 'Android'}
          {sale.cohort ? ` · installed ${shortDate(sale.cohort)}` : ''} · ${mrr.toFixed(2)} MRR
        </Text>
      </View>
      <Text style={st.note}>Marks this purchase cancelled. It stops counting toward MRR from that day; what it already paid stays in revenue.</Text>
      <DateField label="Cancelled on" value={date < sale.date ? sale.date : date} onChange={(d) => setDate(d < sale.date ? sale.date : d)} />
      <Field label="Note" value={note} onChange={setNote} placeholder="Optional" />
      <SaveButton
        label="Mark cancelled"
        tone="#e66767"
        onPress={async () => {
          const out: Sale = { ...sale, cancelled: date < sale.date ? sale.date : date };
          if (note.trim()) out.note = note.trim();
          else delete out.note;
          await api.sync({ saleUpserts: [out] });
          await refresh();
          done();
        }}
      />
    </View>
  );
}

/** Every purchase still running, newest first, to pick the one that churned. */
function SalePicker({ onPick }: { onPick: (s: Sale) => void }) {
  const { snap } = useData();
  const list = useMemo(
    () =>
      [...(snap?.load?.sales || [])]
        .filter((x) => !x.refunded && !x.cancelled && (x.plan === 'monthly' || x.plan === 'annual'))
        .sort((a, b) => (a.date === b.date ? b.id.localeCompare(a.id) : b.date.localeCompare(a.date))),
    [snap],
  );
  if (!list.length) return <Text style={st.empty}>No running subscriptions on record.</Text>;
  return (
    <View style={{ gap: 8 }}>
      <Text style={st.note}>Subscriptions still running. Pick the one that churned.</Text>
      {list.map((x) => (
        <Pressable
          key={x.id}
          onPress={() => {
            Haptics.selectionAsync();
            onPick(x);
          }}
          style={({ pressed }) => [st.ping, pressed && { opacity: 0.7 }]}
        >
          <View style={[st.dot, { backgroundColor: x.platform === 'ios' ? C.ios : C.android }]} />
          <View style={{ flex: 1 }}>
            <Text style={st.optTitle}>
              {PLAN_LABEL[x.plan]} · ${(x.price * x.qty).toFixed(2)}
              {x.qty > 1 ? ` ×${x.qty}` : ''}
            </Text>
            <Text style={st.optSub}>
              {shortDate(x.date)} · {x.platform === 'ios' ? 'iOS' : 'Android'}
              {x.cohort ? ` · installed ${shortDate(x.cohort)}` : ''}
            </Text>
          </View>
          <SymbolView name="chevron.right" size={13} weight="semibold" tintColor={C.muted} />
        </Pressable>
      ))}
    </View>
  );
}

const PLAN_LABEL: Record<Sale['plan'], string> = { monthly: 'Monthly', annual: 'Annual', lifetime: 'Lifetime', unknown: 'Unclassified' };

/** Churn off a store report that does not say which subscriptions. */
function UnattachedChurn({ done }: { done: () => void }) {
  const { refresh } = useData();
  const [date, setDate] = useState(easternDay());
  const [mrr, setMrr] = useState('');
  const [units, setUnits] = useState('');
  const [plan, setPlan] = useState<'monthly' | 'annual' | 'unknown'>('unknown');
  const [platform, setPlatform] = useState<'both' | Platform>('both');
  const [note, setNote] = useState('');
  return (
    <View style={st.form}>
      <Text style={st.note}>Revenue that stopped, from a store report that does not say which subscriptions. It lowers MRR from this date on.</Text>
      <DateField label="Stopped on" value={date} onChange={setDate} />
      <View style={st.pair}>
        <View style={{ flex: 2 }}>
          <NumberField label="MRR lost" prefix="$" value={mrr} onChange={setMrr} />
        </View>
        <View style={{ flex: 1 }}>
          <NumberField label="Subscriptions" value={units} onChange={setUnits} decimal={false} />
        </View>
      </View>
      <Choice
        label="Plan"
        options={[
          { key: 'unknown', label: 'Unknown' },
          { key: 'monthly', label: 'Monthly' },
          { key: 'annual', label: 'Annual' },
        ]}
        value={plan}
        onChange={setPlan}
      />
      <Choice
        label="Store"
        options={[
          { key: 'both', label: 'Unknown' },
          { key: 'ios', label: 'iOS' },
          { key: 'android', label: 'Android' },
        ]}
        value={platform}
        onChange={setPlatform}
      />
      <Field label="Note" value={note} onChange={setNote} placeholder="e.g. App Store report, Sep" />
      <SaveButton
        label="Add churn"
        disabled={num(mrr) === null}
        onPress={async () => {
          const out: Churn = { id: newId('c'), date, mrr: num(mrr) ?? 0, plan };
          if (platform !== 'both') out.platform = platform;
          const u = num(units);
          if (u) out.units = Math.round(u);
          if (note.trim()) out.note = note.trim();
          await api.sync({ churnUpserts: [out] });
          await refresh();
          done();
        }}
      />
    </View>
  );
}

/* ------------------------------------------------------------ from ping */

type SalePrefill = { date: string; platform: Platform; plan: Sale['plan']; cohort: string; note: string; ping: string; hint: string };

const PING_PLAN: Record<string, Sale['plan']> = { Y: 'annual', P: 'annual', F: 'annual', M: 'monthly' };
const PING_PLAN_NAME: Record<string, string> = { Y: 'Yearly', M: 'Monthly', P: 'Promo year', F: 'Founder year' };
const TIER_NAME: Record<string, string> = { F: 'Free', T: 'Trial', P: 'Pro' };

/**
 * Subscribe pings no purchase has claimed yet. A ping carries everything a
 * purchase needs except the money (the day, store, plan and install date), so
 * picking one drafts the sale and leaves the price for you. A saved purchase
 * stores the ping's identity (`arrival day|cohort key`), which is what makes
 * the ping read as claimed here and on the web, wherever the date ends up.
 */
function FromPing({ onPick }: { onPick: (p: SalePrefill) => void }) {
  const { snap } = useData();
  const list = useMemo(() => {
    const sales = snap?.load?.sales || [];
    const claimed = new Map<string, number>();
    sales.forEach((x) => x.ping && claimed.set(x.ping, (claimed.get(x.ping) || 0) + Math.max(1, x.qty || 1)));
    const lastPrice = (platform: Platform, plan: Sale['plan']) =>
      [...sales]
        .filter((x) => !x.refunded && x.platform === platform && x.plan === plan && x.price > 0)
        .sort((a, b) => b.date.localeCompare(a.date))[0]?.price;
    const out: (SalePrefill & { remaining: number; tier: string; planLetter: string | null })[] = [];
    (snap?.pings?.sub || []).forEach((row) => {
      (row.cohorts || []).forEach((c) => {
        const ref = `${row.day}|${c.key}`;
        const remaining = c.count - (claimed.get(ref) || 0);
        if (remaining <= 0) return;
        const letter = c.slot && PING_PLAN[c.slot] ? c.slot : null;
        const plan = letter ? PING_PLAN[letter] : 'unknown';
        const platform: Platform = c.platform === 'A' ? 'android' : 'ios';
        const last = plan !== 'unknown' ? lastPrice(platform, plan) : undefined;
        let hint = `Drafted from a subscribe ping on ${shortDate(row.day)} from an install of ${shortDate(c.cohort)}. Enter the price paid.`;
        if (c.platform !== 'A' && c.platform !== 'I') hint += ' The ping named no store, so check it.';
        if (!letter) hint += ' It came from an older build whose ping also fired on restores: make sure this was a sale, and set the plan.';
        else if (letter === 'P' || letter === 'F') hint += ` This was the ${PING_PLAN_NAME[letter].toLowerCase()}, sold below list price.`;
        else if (last) hint += ` The last ${plan} ${platform === 'ios' ? 'iOS' : 'Android'} purchase was $${last.toFixed(2)}.`;
        out.push({
          date: row.day,
          platform,
          plan,
          cohort: c.cohort,
          note: `From subscribe ping${letter ? ` · ${PING_PLAN_NAME[letter]}` : ''}`,
          ping: ref,
          hint,
          remaining,
          tier: c.tier || '?',
          planLetter: letter,
        });
      });
    });
    return out.sort((a, b) => b.date.localeCompare(a.date));
  }, [snap]);

  if (!list.length) return <Text style={st.empty}>Every subscribe ping has a purchase recorded against it.</Text>;
  return (
    <View style={{ gap: 8 }}>
      <Text style={st.note}>Subscribe pings with no purchase recorded yet. Pick one to draft the sale; you add the price.</Text>
      {list.map((p) => (
        <Pressable
          key={p.ping}
          onPress={() => {
            Haptics.selectionAsync();
            onPick(p);
          }}
          style={({ pressed }) => [st.ping, pressed && { opacity: 0.7 }]}
        >
          <View style={[st.optIcon, { backgroundColor: '#FFC93C26' }]}>
            <SymbolView name="dollarsign" size={16} weight="bold" tintColor="#FFC93C" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.optTitle}>
              {p.planLetter ? PING_PLAN_NAME[p.planLetter] : 'Plan unknown'}
              {p.remaining > 1 ? ` ×${p.remaining}` : ''}
            </Text>
            <Text style={st.optSub}>
              {shortDate(p.date)} · {p.platform === 'ios' ? 'iOS' : 'Android'} · {TIER_NAME[p.tier] || 'Tier unknown'} · installed {shortDate(p.cohort)}
            </Text>
          </View>
          <SymbolView name="chevron.right" size={13} weight="semibold" tintColor={C.muted} />
        </Pressable>
      ))}
    </View>
  );
}

/* ------------------------------------------------------------- batches */

const fieldKeys = ['downloads', 'impressions', 'pageViews', 'updates'] as const;
const FIELD_LABEL: Record<(typeof fieldKeys)[number], string> = { downloads: 'Downloads', impressions: 'Impr.', pageViews: 'Page views', updates: 'Updates' };

/** A grid of days for one or both stores, pre-filled with what is recorded, saved in one go. */
function StoreBatch({ done }: { done: () => void }) {
  const { snap, refresh } = useData();
  const [to, setTo] = useState(addDays(easternDay(), -1));
  const [from, setFrom] = useState(addDays(easternDay(), -7));
  const [which, setWhich] = useState<'both' | Platform>('both');
  const [cells, setCells] = useState<Record<string, string>>({});
  const plats: Platform[] = which === 'both' ? ['ios', 'android'] : [which];
  const days = useMemo(() => {
    const out: string[] = [];
    for (let d = to; d >= from && out.length < 62; d = addDays(d, -1)) out.push(d);
    return out;
  }, [from, to]);
  const existing = (d: string, p: Platform) => (snap?.load?.entries || []).find((e) => e.date === d && e.platform === p);
  const cellKey = (d: string, p: Platform, f: string) => `${d}|${p}|${f}`;
  const valueOf = (d: string, p: Platform, f: (typeof fieldKeys)[number]) => {
    const k = cellKey(d, p, f);
    if (k in cells) return cells[k];
    const v = existing(d, p)?.[f];
    return v === undefined ? '' : String(v);
  };
  const changed = Object.keys(cells).length;

  return (
    <View style={st.form}>
      <View style={st.pair}>
        <View style={{ flex: 1 }}>
          <DateField label="From" value={from} onChange={(d) => setFrom(d > to ? to : d)} />
        </View>
      </View>
      <DateField label="To" value={to} onChange={(d) => setTo(d < from ? from : d)} />
      <Choice
        label="Stores"
        options={[
          { key: 'both', label: 'Both' },
          { key: 'ios', label: 'iOS' },
          { key: 'android', label: 'Android' },
        ]}
        value={which}
        onChange={setWhich}
      />
      <Text style={st.note}>Days already entered come back filled in, so this doubles as bulk editing. Only changed rows are saved.</Text>
      {days.map((d) => (
        <View key={d} style={st.batchDay}>
          <Text style={st.batchDate}>{shortDate(d)}</Text>
          {plats.map((p) => (
            <View key={p} style={st.batchRow}>
              <Text style={[st.batchPlat, { color: p === 'ios' ? C.ios : C.android }]}>{p === 'ios' ? 'iOS' : 'And'}</Text>
              {fieldKeys.map((f) => (
                <TextInput
                  key={f}
                  value={valueOf(d, p, f)}
                  onChangeText={(t) => setCells((c) => ({ ...c, [cellKey(d, p, f)]: t.replace(/[^0-9]/g, '') }))}
                  placeholder={FIELD_LABEL[f]}
                  placeholderTextColor={C.muted}
                  keyboardType="number-pad"
                  keyboardAppearance="dark"
                  style={st.cell}
                />
              ))}
            </View>
          ))}
        </View>
      ))}
      <SaveButton
        label={changed ? `Save ${new Set(Object.keys(cells).map((k) => k.split('|').slice(0, 2).join('|'))).size} days` : 'Nothing changed'}
        disabled={!changed}
        onPress={async () => {
          const touched = new Set(Object.keys(cells).map((k) => k.split('|').slice(0, 2).join('|')));
          const upserts: Entry[] = [...touched].map((k) => {
            const [d, p] = k.split('|') as [string, Platform];
            const entry: Entry = { ...(existing(d, p) || {}), date: d, platform: p };
            fieldKeys.forEach((f) => {
              const n = num(valueOf(d, p, f));
              if (n === null) delete entry[f];
              else entry[f] = n;
            });
            return entry;
          });
          await api.sync({ upserts });
          await refresh();
          done();
        }}
      />
    </View>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Animated.View entering={FadeIn} style={st.toggle}>
      <Text style={st.toggleLabel}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: C.series }} />
    </Animated.View>
  );
}

const st = StyleSheet.create({
  option: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.06)' },
  optIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  optTitle: { color: C.text, fontSize: 16, fontWeight: '700' },
  optSub: { color: C.muted, fontSize: 12, marginTop: 1 },
  form: { gap: 14 },
  pair: { flexDirection: 'row', gap: 10 },
  note: { color: C.muted, fontSize: 12, lineHeight: 17 },
  toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleLabel: { color: C.dim, fontSize: 14, fontWeight: '600' },
  prefill: { color: C.dim, fontSize: 13, lineHeight: 18, backgroundColor: 'rgba(255,201,60,0.08)', borderRadius: 12, padding: 12 },
  empty: { color: C.muted, fontSize: 14, textAlign: 'center', paddingVertical: 30 },
  saleCard: { padding: 14, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.06)', gap: 2 },
  dot: { width: 10, height: 10, borderRadius: 5, marginHorizontal: 4 },
  ping: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.06)' },
  batchDay: { gap: 6, paddingVertical: 6 },
  batchDate: { color: C.text, fontSize: 14, fontWeight: '700' },
  batchRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  batchPlat: { width: 30, fontSize: 12, fontWeight: '700' },
  cell: { flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10, color: C.text, fontSize: 14, paddingHorizontal: 8, paddingVertical: 9, textAlign: 'center' },
});
