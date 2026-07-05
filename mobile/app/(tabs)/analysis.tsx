import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Header } from '../../src/components/Header';
import { Icon, IconName } from '../../src/components/Icon';
import { Card, Segmented } from '../../src/components/ui';
import { Bars, LineChart } from '../../src/components/charts';
import { radius, usePalette } from '../../src/theme';
import { useAppState } from '../../src/store/store';
import { buildCategories, type AnalysisCard, type Category } from '../../src/lib/analysis/categories';
import type { Mode } from '../../src/lib/analysis/buckets';

export default function AnalysisScreen() {
  const p = usePalette();
  const state = useAppState();
  const [mode, setMode] = useState<Mode>('day');
  const [open, setOpen] = useState<string | null>(null);
  const ctx = { sex: state.profile.sex, height: state.profile.height };
  const cats = buildCategories(state.days, mode, ctx);
  const hasData = Object.keys(state.days).length > 0;
  const cat = cats.find((c) => c.id === open) || null;

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      <Header />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        <Segmented options={[{ val: 'day', label: 'Day' }, { val: 'week', label: 'Week' }, { val: 'month', label: 'Month' }, { val: 'year', label: 'Year' }]} value={mode} onChange={setMode} style={{ marginBottom: 16 }} />
        {!hasData ? (
          <Text style={{ color: p.textDim, textAlign: 'center', marginTop: 40 }}>No data logged yet.</Text>
        ) : cat ? (
          <CategoryDetail cat={cat} onBack={() => setOpen(null)} />
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {cats.map((c) => (
              <Pressable key={c.id} onPress={() => setOpen(c.id)} style={{ width: '31.5%', backgroundColor: p.surface, borderColor: p.border, borderWidth: 1, borderRadius: radius.card, padding: 12 }}>
                <Icon name={c.icon as IconName} size={24} color={p.accent} />
                <Text style={{ fontSize: 14, fontWeight: '700', color: p.text, marginTop: 7 }}>{c.title}</Text>
                <Text style={{ fontSize: 11, color: p.textDim, marginTop: 2 }}>{c.desc}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function CategoryDetail({ cat, onBack }: { cat: Category; onBack: () => void }) {
  const p = usePalette();
  const cards = cat.build();
  return (
    <View>
      <Pressable onPress={onBack} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <Icon name="arrowLeft" size={22} color={p.text} />
        <Text style={{ fontSize: 19, fontWeight: '700', color: p.text }}>{cat.title}</Text>
      </Pressable>
      {cards.length === 0 ? <Text style={{ color: p.textDim }}>No data logged yet for this category.</Text> : cards.map((c, i) => <CardView key={i} card={c} buckets={cat.buckets} />)}
    </View>
  );
}

function CardView({ card, buckets }: { card: AnalysisCard; buckets: { label: string }[] }) {
  const p = usePalette();
  return (
    <Card style={{ padding: 14 }}>
      <Text style={{ fontSize: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, color: p.textDim }}>{card.title}</Text>
      {card.sub ? <Text style={{ fontSize: 11, color: p.textDim, marginTop: 2, marginBottom: 8 }}>{card.sub}</Text> : null}
      {(card.charts || []).map((ch, i) => (
        <View key={i} style={{ marginTop: 12 }}>
          <Text style={{ fontSize: 12, color: p.text, marginBottom: 6, fontWeight: '600' }}>{ch.label}</Text>
          <LineChart buckets={buckets} series={ch.series} zones={ch.zones} integer={ch.integer} target={ch.target} />
          {ch.legend ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 }}>
              {ch.legend.map(([name, color]) => (
                <View key={name} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color }} />
                  <Text style={{ fontSize: 11, color: p.textDim }}>{name}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ))}
      {(card.bars || []).map((bg, i) => (
        <View key={i} style={{ marginTop: 12 }}>
          {bg.label ? <Text style={{ fontSize: 12, color: p.text, marginBottom: 6, fontWeight: '600' }}>{bg.label}</Text> : null}
          <Bars rows={bg.rows} fmt={bg.fmt} />
        </View>
      ))}
      {card.stats && card.stats.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
          {card.stats.map((s, i) => (
            <View key={i} style={{ flexGrow: 1, minWidth: '45%', backgroundColor: p.surface2, borderColor: p.border, borderWidth: 1, borderRadius: radius.control, padding: 12 }}>
              <Text style={{ fontSize: 12, color: p.textDim, fontWeight: '600' }}>{s.label}</Text>
              <Text style={{ fontSize: 25, fontWeight: '700', marginTop: 4, color: s.color || p.text, fontVariant: ['tabular-nums'] }}>{s.value == null ? '-' : String(s.value)}{s.sub ? <Text style={{ fontSize: 12, color: p.textDim }}>{` ${s.sub}`}</Text> : null}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {(card.insights || []).map((ins, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 10, backgroundColor: p.surface2, borderRadius: radius.control, padding: 12, marginTop: 10 }}>
          <View style={{ width: 3, borderRadius: 2, backgroundColor: ins.strength === 'strong' ? '#16a34a' : ins.strength === 'mod' ? '#eab308' : p.accent }} />
          <Text style={{ flex: 1, fontSize: 14, color: p.text, lineHeight: 18 }}>{ins.text}</Text>
        </View>
      ))}
    </Card>
  );
}
