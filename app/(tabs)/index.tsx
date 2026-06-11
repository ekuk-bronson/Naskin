import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import {
  Alert, Animated, FlatList, Image, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RISK_LEVELS } from '../../constants/riskLevels';
import { deleteMole, getAllMoles, getSetting, setSetting, type Mole } from '../../services/storage';
import { cancelHighRiskReminder } from '../../services/notifications';
import { useLocale } from '../../services/i18n';
import { useTextScale } from '../../services/textScale';

const BG    = '#F8F6F3';
const DARK  = '#1C1A18';
const STONE = '#8B7355';
const DIM   = '#9A9087';
const FAINT = '#C5BDB4';

type SortKey = 'date' | 'score' | 'name';
const NEXT_SORT: Record<SortKey, SortKey>  = { date: 'score', score: 'name', name: 'date' };

function DeleteAction({ onPress, dragX, label }: { onPress: () => void; dragX: Animated.AnimatedInterpolation<number>; label: string }) {
  const scale   = dragX.interpolate({ inputRange: [-80, -40, 0], outputRange: [1, 0.85, 0.7], extrapolate: 'clamp' });
  const opacity = dragX.interpolate({ inputRange: [-80, -20, 0], outputRange: [1, 0.8, 0],   extrapolate: 'clamp' });
  return (
    <Animated.View style={[s.deleteWrap, { opacity }]}>
      <TouchableOpacity style={s.deleteBtn} onPress={onPress} activeOpacity={0.75}>
        <Animated.Text style={[s.deleteIcon, { transform: [{ scale }] }]}>🗑</Animated.Text>
        <Text style={s.deleteLabel}>{label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { t, locale } = useLocale();
  const fontScale = useTextScale();
  const [moles, setMoles]   = useState<Mole[]>([]);
  const [sortBy, setSortBy] = useState<SortKey>('date');
  const swipeRefs = useRef<Map<number, Swipeable>>(new Map());

  const SORT_LABELS: Record<SortKey, string> = {
    date:  t('home.sortDate'),
    score: t('home.sortScore'),
    name:  t('home.sortName'),
  };

  const confirmDelete = (id: number, name: string) => {
    swipeRefs.current.get(id)?.close();
    Alert.alert(
      t('home.confirmDelete'),
      `«${name}» ${t('home.confirmDeleteMsg')}`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.delete'), style: 'destructive',
          onPress: () => {
            deleteMole(id);
            cancelHighRiskReminder(id).catch(() => {});
            setMoles((p) => p.filter((m) => m.id !== id));
          },
        },
      ],
    );
  };

  useFocusEffect(useCallback(() => {
    setMoles(getAllMoles());
    const saved = getSetting('default_sort') as SortKey | null;
    if (saved && saved in SORT_LABELS) setSortBy(saved);
  }, []));

  const sorted = [...moles].sort((a, b) => {
    if (sortBy === 'score') return b.score - a.score;
    if (sortBy === 'name')  return a.name.localeCompare(b.name, 'ru');
    return 0;
  });

  // 5 categorisations collapsed to 3 buckets for the hero badges:
  //   high  = high + urgent
  //   mid   = moderate
  //   low   = low + notable
  const highRisk  = moles.filter((m) => m.risk === 'high' || m.risk === 'urgent').length;
  const moderate  = moles.filter((m) => m.risk === 'moderate').length;
  const low       = moles.filter((m) => m.risk === 'low' || m.risk === 'notable').length;
  const alertMole = moles.find((m) => m.changed);
  const normPct   = moles.length ? Math.round((low / moles.length) * 100) : 100;
  const monthLabel = new Date()
    .toLocaleString(locale === 'en' ? 'en' : 'ru', { month: 'long', year: 'numeric' })
    .replace(/^./, (c) => c.toUpperCase());

  return (
    <SafeAreaView style={s.root}>

      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={[s.headerSup, { fontSize: Math.round(9 * fontScale) }]} numberOfLines={1}>{monthLabel}</Text>
          <Text style={[s.headerTitle, { fontSize: Math.round(26 * fontScale) }]} adjustsFontSizeToFit minimumFontScale={0.8} numberOfLines={1}>{t('home.title')}</Text>
        </View>
        <TouchableOpacity style={s.reportBtn} onPress={() => router.navigate('/(tabs)/profile')} activeOpacity={0.72}>
          <Text style={s.reportBtnIcon}>◈</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={sorted}
        keyExtractor={(m) => String(m.id)}
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        windowSize={9}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        removeClippedSubviews
        ListHeaderComponent={
          <>
            {/* Dark hero card */}
            <View style={s.heroCard}>
              <View style={s.heroGlowA} pointerEvents="none" />
              <View style={s.heroGlowB} pointerEvents="none" />
              <View style={s.heroTop}>
                <View>
                  <Text style={[s.heroSup, { fontSize: Math.round(9 * fontScale) }]}>{t('home.heroTotal')}</Text>
                  <Text style={[s.heroCount, { fontSize: Math.round(56 * fontScale) }]} adjustsFontSizeToFit minimumFontScale={0.6} numberOfLines={1}>{moles.length}</Text>
                  <Text style={[s.heroMeta, { fontSize: Math.round(11 * fontScale) }]} numberOfLines={1}>
                    {moles.length
                      ? `${t('home.heroLastCheck')} ${moles[0]?.days ?? 0} ${locale === 'en' ? 'days ago' : 'дн. назад'}`
                      : t('home.heroEmpty')}
                  </Text>
                </View>
                <View style={s.heroRing}>
                  <Text style={[s.heroRingPct, { fontSize: Math.round(22 * fontScale) }]} adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1}>{normPct}%</Text>
                  <Text style={[s.heroRingLabel, { fontSize: Math.round(8 * fontScale) }]}>{t('home.heroNorm')}</Text>
                </View>
              </View>
              <View style={s.heroBadges}>
                {([
                  [String(highRisk), locale === 'en' ? 'HIGH'    : 'ВЫСОКИЙ', RISK_LEVELS.high.color],
                  [String(moderate), locale === 'en' ? 'MODERATE': 'СРЕДНИЙ', RISK_LEVELS.moderate.color],
                  [String(low),      locale === 'en' ? 'LOW'     : 'НОРМА',   RISK_LEVELS.low.color],
                ] as const).map(([num, label, color]) => (
                  <View key={label} style={[s.heroBadge, { borderColor: color + '30' }]}>
                    <View style={[s.heroBadgeDot, { backgroundColor: color }]} />
                    <Text style={[s.heroBadgeNum, { color }]}>{num}</Text>
                    <Text style={s.heroBadgeLabel}>{label}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Alert banner */}
            {alertMole && (
              <TouchableOpacity
                style={s.alertBanner}
                onPress={() => router.push({ pathname: '/result', params: { id: alertMole.id } })}
                activeOpacity={0.72}
              >
                <View style={s.alertPulse} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.alertTitle, { fontSize: Math.round(13 * fontScale) }]}>{t('home.alertTitle')}</Text>
                  <Text style={[s.alertSub, { fontSize: Math.round(11 * fontScale) }]} numberOfLines={1}>{alertMole.name} · {t('home.alertSub')}</Text>
                </View>
                <Text style={s.alertChevron}>›</Text>
              </TouchableOpacity>
            )}

            {/* Section header */}
            {moles.length > 0 && (
              <View style={s.sectionRow}>
                <Text style={s.sectionLabel}>{t('home.section')} · {moles.length}</Text>
                <TouchableOpacity
                  onPress={() => { const n = NEXT_SORT[sortBy]; setSortBy(n); setSetting('default_sort', n); }}
                  activeOpacity={0.65} style={s.sortBtn}
                >
                  <Text style={s.sortBtnText}>{SORT_LABELS[sortBy]} ↕</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        }
        ListEmptyComponent={
          <View style={s.emptyWrap}>
            <View style={s.emptyOrb}><View style={s.emptyDot} /></View>
            <Text style={s.emptyTitle}>{t('home.emptyTitle')}</Text>
            <Text style={s.emptyHint}>{t('home.emptyHint')}</Text>
          </View>
        }
        ListFooterComponent={<View style={{ height: 6 }} />}
        renderItem={({ item: m }) => {
          const cfg = RISK_LEVELS[m.risk];
          return (
            <Swipeable
              ref={(ref) => { if (ref) swipeRefs.current.set(m.id, ref); else swipeRefs.current.delete(m.id); }}
              renderRightActions={(_, dragX) => (
                <DeleteAction onPress={() => confirmDelete(m.id, m.name)} dragX={dragX} label={t('common.delete')} />
              )}
              rightThreshold={60} overshootRight={false}
              containerStyle={{ marginBottom: 8, borderRadius: 20 }}
            >
              <TouchableOpacity
                onPress={() => router.push({ pathname: '/result', params: { id: m.id } })}
                activeOpacity={0.72} style={[s.moleCard, { marginBottom: 0 }]}
              >
                {m.imageUri
                  ? <Image source={{ uri: m.imageUri }} style={s.moleThumb} />
                  : <View style={[s.molePlaceholder, { borderColor: cfg.colorBorder }]}><View style={s.moleDot} /></View>
                }
                <View style={s.moleMeta}>
                  <View style={s.moleTopRow}>
                    <Text style={[s.moleName, { fontSize: Math.round(13 * fontScale) }]} numberOfLines={1}>{m.name}</Text>
                    {m.changed && (
                      <View style={s.changedPill}><Text style={s.changedPillText}>⚠</Text></View>
                    )}
                  </View>
                  <Text style={[s.moleSub, { fontSize: Math.round(11 * fontScale) }]}>{m.loc} · {m.days} {locale === 'en' ? 'd' : 'дн.'}</Text>
                </View>
                <View style={s.moleScore}>
                  <View style={[s.moleRisk, { backgroundColor: cfg.colorBg, borderColor: cfg.colorBorder }]}>
                    <View style={[s.moleRiskDot, { backgroundColor: cfg.color }]} />
                    <Text style={[s.moleRiskText, { color: cfg.color, fontSize: Math.round(11 * fontScale) }]} numberOfLines={1}>{t(`risk.${m.risk}`)}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            </Swipeable>
          );
        }}
      />

      {/* Footer */}
      <View style={s.footer}>
        <TouchableOpacity style={s.addBtn} onPress={() => router.push('/add')} activeOpacity={0.78}>
          <Text style={[s.addBtnText, { fontSize: Math.round(14 * fontScale) }]}>{t('home.add')}</Text>
        </TouchableOpacity>
      </View>

    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:            { flex: 1, backgroundColor: BG },
  // Header
  header:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: 14, paddingBottom: 8 },
  headerSup:       { fontSize: 9, color: STONE, letterSpacing: 2.2, textTransform: 'uppercase', fontWeight: '600', marginBottom: 4 },
  headerTitle:     { fontSize: 26, fontWeight: '800', color: DARK, letterSpacing: -0.8 },
  reportBtn:       { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#EDE9E3', alignItems: 'center', justifyContent: 'center', shadowColor: DARK, shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  reportBtnIcon:   { fontSize: 18, color: STONE },
  scroll:          { flex: 1 },
  scrollContent:   { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 10 },
  // Hero
  heroCard:        { backgroundColor: DARK, borderRadius: 28, padding: 22, marginBottom: 12, overflow: 'hidden', position: 'relative' },
  heroGlowA:       { position: 'absolute', top: -40, right: -30, width: 170, height: 170, borderRadius: 85, backgroundColor: 'rgba(160,120,58,0.2)' },
  heroGlowB:       { position: 'absolute', bottom: -30, left: -30, width: 110, height: 110, borderRadius: 55, backgroundColor: 'rgba(45,80,200,0.1)' },
  heroTop:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  heroSup:         { fontSize: 9, color: '#5A5248', letterSpacing: 2.0, textTransform: 'uppercase', fontWeight: '600', marginBottom: 8 },
  heroCount:       { fontSize: 54, fontWeight: '800', color: '#F0EDE8', letterSpacing: -2, lineHeight: 56, marginBottom: 6 },
  heroMeta:        { fontSize: 11, color: '#524B43', fontWeight: '400' },
  heroRing:        { width: 68, height: 68, borderRadius: 34, borderWidth: 1.5, borderColor: STONE + '50', backgroundColor: 'rgba(139,115,85,0.12)', alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  heroRingPct:     { fontSize: 17, fontWeight: '800', color: STONE, letterSpacing: -0.5, lineHeight: 20 },
  heroRingLabel:   { fontSize: 7, color: '#5A5248', letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 2 },
  heroBadges:      { flexDirection: 'row', gap: 8 },
  heroBadge:       { flex: 1, backgroundColor: 'rgba(248,246,243,0.04)', borderWidth: 1, borderRadius: 16, paddingVertical: 12, alignItems: 'center', gap: 5 },
  heroBadgeDot:    { width: 5, height: 5, borderRadius: 3 },
  heroBadgeNum:    { fontSize: 21, fontWeight: '800', letterSpacing: -0.5, lineHeight: 22, textAlign: 'center' },
  heroBadgeLabel:  { fontSize: 7, color: '#504840', letterSpacing: 1.2, textTransform: 'uppercase' },
  // Alert
  alertBanner:     { backgroundColor: '#fff', borderWidth: 1, borderColor: '#F0D8DC', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14, shadowColor: '#E8003D', shadowOpacity: 0.07, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  alertPulse:      { width: 8, height: 8, borderRadius: 4, backgroundColor: '#E8003D', flexShrink: 0 },
  alertTitle:      { fontSize: 12, color: '#E8003D', fontWeight: '700', marginBottom: 2 },
  alertSub:        { fontSize: 11, color: DIM },
  alertChevron:    { fontSize: 20, color: FAINT },
  // Section
  sectionRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, marginTop: 2 },
  sectionLabel:    { fontSize: 9, color: FAINT, letterSpacing: 2, textTransform: 'uppercase', fontWeight: '600' },
  sortBtn:         { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, backgroundColor: '#fff', borderWidth: 1, borderColor: '#EDE9E3' },
  sortBtnText:     { fontSize: 10, color: STONE, fontWeight: '600', letterSpacing: 0.3 },
  // Empty
  emptyWrap:       { alignItems: 'center', paddingVertical: 52, gap: 8 },
  emptyOrb:        { width: 82, height: 82, borderRadius: 41, backgroundColor: '#EDE9E3', alignItems: 'center', justifyContent: 'center', marginBottom: 4, borderWidth: 1, borderColor: '#E0DAD2', shadowColor: DARK, shadowOpacity: 0.04, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  emptyDot:        { width: 36, height: 32, borderRadius: 99, backgroundColor: '#C5BDB4' },
  emptyTitle:      { fontSize: 15, fontWeight: '700', color: DIM, letterSpacing: -0.2 },
  emptyHint:       { fontSize: 12, color: FAINT, textAlign: 'center', lineHeight: 18, paddingHorizontal: 32 },
  // Mole card
  moleCard:        { backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 8, borderWidth: 1, borderColor: '#EDE9E3', shadowColor: DARK, shadowOpacity: 0.04, shadowRadius: 12, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  moleThumb:       { width: 50, height: 50, borderRadius: 15, flexShrink: 0, backgroundColor: '#EDE9E3' },
  molePlaceholder: { width: 50, height: 50, borderRadius: 15, flexShrink: 0, borderWidth: 1.5, backgroundColor: '#F8F0E8', alignItems: 'center', justifyContent: 'center' },
  moleDot:         { width: 24, height: 22, borderRadius: 99, backgroundColor: '#7A5035' },
  moleMeta:        { flex: 1, minWidth: 0 },
  moleTopRow:      { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  moleName:        { fontSize: 13, fontWeight: '700', color: DARK, letterSpacing: -0.3, flexShrink: 1 },
  changedPill:     { width: 18, height: 18, borderRadius: 9, backgroundColor: '#FFF0F3', borderWidth: 1, borderColor: '#FFD0D8', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  changedPillText: { fontSize: 9 },
  moleSub:         { fontSize: 11, color: DIM, letterSpacing: 0.1 },
  moleScore:       { alignItems: 'flex-end', justifyContent: 'center', gap: 5 },
  moleRisk:        { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 6 },
  moleRiskDot:     { width: 8, height: 8, borderRadius: 4 },
  moleRiskText:    { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
  // Swipe delete
  deleteWrap:      { width: 80, justifyContent: 'center', alignItems: 'center' },
  deleteBtn:       { width: 66, height: '90%', borderRadius: 18, backgroundColor: '#E8003D', alignItems: 'center', justifyContent: 'center', gap: 3 },
  deleteIcon:      { fontSize: 20 },
  deleteLabel:     { fontSize: 9, fontWeight: '700', color: '#fff', letterSpacing: 0.4 },
  // Footer
  footer:          { flexDirection: 'row', gap: 10, alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#EDE9E3', backgroundColor: '#FAFAF8' },
  addBtn:          { flex: 1, paddingVertical: 15, borderRadius: 18, backgroundColor: DARK, alignItems: 'center', justifyContent: 'center', shadowColor: DARK, shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  addBtnText:      { fontSize: 14, fontWeight: '700', color: '#F0EDE8', letterSpacing: 0.3 },
});
