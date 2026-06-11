import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HistoryItem } from '../../components/HistoryItem';
import { getAllMoles, type Mole } from '../../services/storage';
import { useLocale } from '../../services/i18n';
import { useTextScale } from '../../services/textScale';

const DARK  = '#1C1A18';
const STONE = '#8B7355';
const DIM   = '#9A9087';
const FAINT = '#C5BDB4';

export default function HistoryScreen() {
  const router = useRouter();
  const { t }  = useLocale();
  const fontScale = useTextScale();
  const [moles, setMoles] = useState<Mole[]>([]);

  useFocusEffect(useCallback(() => { setMoles(getAllMoles()); }, []));

  // Высокий = high + urgent (action-required категории)
  const highCount = moles.filter((m) => m.risk === 'high' || m.risk === 'urgent').length;
  const modCount  = moles.filter((m) => m.risk === 'moderate').length;
  const totalObs  = moles.reduce((n, m) => n + m.history.length, 0);

  const STATS = [
    { val: String(moles.length), lbl: t('history.statTotal') },
    { val: String(modCount),     lbl: t('history.statMod'),  warn:   modCount  > 0 },
    { val: String(highCount),    lbl: t('history.statHigh'), danger: highCount > 0 },
    { val: String(totalObs),     lbl: t('history.statObs') },
  ];

  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}>
        <Text style={[s.sup, { fontSize: Math.round(9 * fontScale) }]}>{t('history.title').toUpperCase()}</Text>
        <Text style={[s.title, { fontSize: Math.round(26 * fontScale) }]}>{t('history.title')}</Text>
        <Text style={[s.subtitle, { fontSize: Math.round(11 * fontScale) }]}>{t('history.subtitle')}</Text>
      </View>

      {/* Stats strip */}
      {moles.length > 0 && (
        <View style={s.statsRow}>
          {STATS.map((st) => (
            <View key={st.lbl} style={s.statCell}>
              <Text style={[s.statVal, { fontSize: Math.round(18 * fontScale) }, st.danger && { color: '#E8003D' }, (st as any).warn && { color: '#E06000' }]}>{st.val}</Text>
              <Text style={[s.statLbl, { fontSize: Math.round(8 * fontScale) }]}>{st.lbl}</Text>
            </View>
          ))}
        </View>
      )}

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        {moles.length === 0 && (
          <View style={s.emptyWrap}>
            <Text style={s.emptyIcon}>◷</Text>
            <Text style={[s.emptyTitle, { fontSize: Math.round(15 * fontScale) }]}>{t('history.empty')}</Text>
            <Text style={[s.emptyHint, { fontSize: Math.round(12 * fontScale) }]}>{t('history.emptyHint')}</Text>
            <TouchableOpacity style={s.emptyCta} onPress={() => router.push('/add')} activeOpacity={0.78}>
              <Text style={[s.emptyCtaTxt, { fontSize: Math.round(13 * fontScale) }]}>{t('history.cta')}</Text>
            </TouchableOpacity>
          </View>
        )}
        {moles.map((m) => (
          <HistoryItem
            key={m.id}
            mole={m}
            onPress={() => router.push({ pathname: '/result', params: { id: m.id } })}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:        { flex: 1, backgroundColor: '#F8F6F3' },
  header:      { paddingHorizontal: 24, paddingTop: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#EDE9E3' },
  sup:         { fontSize: 9, color: STONE, letterSpacing: 2.2, textTransform: 'uppercase', fontWeight: '600', marginBottom: 4 },
  title:       { fontSize: 26, fontWeight: '800', color: DARK, letterSpacing: -0.8, marginBottom: 2 },
  subtitle:    { fontSize: 11, color: FAINT, fontWeight: '400' },
  // Stats strip
  statsRow:    { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#EDE9E3', backgroundColor: '#fff' },
  statCell:    { flex: 1, alignItems: 'center', paddingVertical: 12, borderRightWidth: 1, borderRightColor: '#EDE9E3' },
  statVal:     { fontSize: 18, fontWeight: '800', color: DARK, letterSpacing: -0.5 },
  statLbl:     { fontSize: 8, color: FAINT, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 2 },
  // List
  scroll:      { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 24 },
  emptyWrap:   { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyIcon:   { fontSize: 36, color: FAINT, marginBottom: 4 },
  emptyTitle:  { fontSize: 15, fontWeight: '700', color: DIM },
  emptyHint:   { fontSize: 12, color: FAINT, textAlign: 'center', lineHeight: 18 },
  emptyCta:    { marginTop: 18, paddingVertical: 14, paddingHorizontal: 24, borderRadius: 18, backgroundColor: DARK, shadowColor: DARK, shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  emptyCtaTxt: { fontSize: 13, fontWeight: '700', color: '#F0EDE8', letterSpacing: 0.3 },
});
