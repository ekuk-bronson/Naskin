import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, TextInput, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getMole, updateMoleMeta, type Mole } from '../services/storage';
import { LineChart } from '../components/LineChart';
import { RISK_LEVELS, scoreColor, getRiskLevel } from '../constants/riskLevels';
import { useLocale } from '../services/i18n';
import { useTextScale } from '../services/textScale';

const BG = '#F8F6F3', DARK = '#1C1A18', STONE = '#8B7355', DIM = '#9A9087', FAINT = '#C5BDB4';

type Tab = 'info' | 'history' | 'compare';
const BODY_ZONE_KEYS = ['loc.head', 'loc.neck', 'loc.chest', 'loc.back', 'loc.belly', 'loc.shoulder', 'loc.arm', 'loc.leg'];

/** Russian plural form picker. forms = [1, 2-4, 5+]. */
function pluralRu(n: number, forms: [string, string, string]): string {
  const mod10  = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}

export default function ResultScreen() {
  const router        = useRouter();
  const { id }        = useLocalSearchParams<{ id?: string }>();
  const { t, locale } = useLocale();
  const fontScale     = useTextScale();

  // Localised risk-level helpers: prefer i18n keys, fall back to RU defaults from RISK_LEVELS
  const lvlLabel = (key: string) => {
    const v = t(`risk.${key}.label`);
    return v !== `risk.${key}.label` ? v : RISK_LEVELS[key as keyof typeof RISK_LEVELS]?.label ?? key;
  };
  const lvlShort = (key: string) => {
    const v = t(`risk.${key}`);
    return v !== `risk.${key}` ? v : RISK_LEVELS[key as keyof typeof RISK_LEVELS]?.short ?? key;
  };
  const lvlRec = (key: string) => {
    const v = t(`risk.${key}.rec`);
    return v !== `risk.${key}.rec` ? v : RISK_LEVELS[key as keyof typeof RISK_LEVELS]?.rec ?? '';
  };
  const lvlSummary = (key: string) => t(`risk.${key}.summary`);

  const [mole, setMole]         = useState<Mole | null>(null);
  const [tab, setTab]           = useState<Tab>('info');
  const [editing, setEditing]   = useState(false);
  const [editName, setEditName] = useState('');
  const [editLoc, setEditLoc]   = useState('');

  useEffect(() => {
    if (id) { const found = getMole(Number(id)); if (found) setMole(found); }
  }, [id]);

  if (!mole) {
    return (
      <View style={[s.root, s.centered]}>
        <Text style={s.notFound}>{t('result.notFound')}</Text>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.72}>
          <Text style={s.backLink}>← {t('common.back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const cfg = RISK_LEVELS[mole.risk];

  const startEdit = () => { setEditName(mole.name); setEditLoc(mole.loc); setEditing(true); };
  const saveEdit  = () => {
    const name = editName.trim() || mole.name, loc = editLoc.trim() || mole.loc;
    updateMoleMeta(mole.id, name, loc);
    setMole({ ...mole, name, loc }); setEditing(false);
  };

  return (
    <SafeAreaView style={s.root}>
      {/* Header */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()} activeOpacity={0.72}>
          <Text style={s.backBtnTxt}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[s.detailName, { fontSize: Math.round(15 * fontScale) }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{mole.name}</Text>
          <Text style={[s.detailSub, { fontSize: Math.round(11 * fontScale) }]} numberOfLines={1}>{mole.loc} · {locale === 'en' ? 'since' : 'с'} {mole.since}</Text>
        </View>
        {mole.changed && !editing && (
          <View style={s.changedChip}><Text style={s.changedChipTxt}>{t('result.changed')}</Text></View>
        )}
        {editing ? (
          <>
            <TouchableOpacity style={s.editActionBtn} onPress={() => setEditing(false)} activeOpacity={0.72}>
              <Text style={s.editCancelTxt}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.editActionBtn, s.editSaveBtn]} onPress={saveEdit} activeOpacity={0.78}>
              <Text style={s.editSaveTxt}>{t('common.save')}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={s.editBtn} onPress={startEdit} activeOpacity={0.72}>
            <Text style={s.editBtnIcon}>✎</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Edit card */}
      {editing && (
        <View style={s.editCard}>
          <Text style={s.editLbl}>{t('add.lblName')}</Text>
          <TextInput style={s.editInput} value={editName} onChangeText={setEditName}
            placeholder={mole.name} placeholderTextColor={FAINT} autoFocus returnKeyType="next" />
          <Text style={[s.editLbl, { marginTop: 14 }]}>{t('add.lblLocation')}</Text>
          <View style={s.zoneGrid}>
            {BODY_ZONE_KEYS.map((zKey) => {
              const label = t(zKey);
              const on    = editLoc === label;
              return (
                <TouchableOpacity key={zKey} onPress={() => setEditLoc(label)} activeOpacity={0.72}
                  style={[s.zoneChip, on && s.zoneChipOn]}>
                  <Text style={[s.zoneChipTxt, on && s.zoneChipTxtOn]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* Score hero */}
      <View style={s.heroPad}>
        <View style={[s.heroCard, { shadowColor: cfg.color, shadowOpacity: 0.12, shadowRadius: 24, shadowOffset: { width: 0, height: 6 }, elevation: 4 }]}>
          <View style={s.heroLeft}>
            <View style={[s.heroMole, { backgroundColor: cfg.colorBg, borderColor: cfg.colorBorder }]}>
              {mole.imageUri
                ? <Image source={{ uri: mole.imageUri }} style={s.heroMoleImg} />
                : <View style={s.heroMoleDot} />}
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.heroLevel, { color: cfg.color, fontWeight: cfg.weight, fontSize: Math.round(24 * fontScale) }]}
              adjustsFontSizeToFit minimumFontScale={0.6} numberOfLines={1}>{lvlLabel(mole.risk)}</Text>
            <Text style={[s.heroRec, { color: cfg.color, fontSize: Math.round(12 * fontScale) }]} numberOfLines={2}>{lvlRec(mole.risk)}</Text>
            <Text style={[s.heroMeta, { fontSize: Math.round(11 * fontScale) }]} numberOfLines={1}>Ø {mole.size} · {mole.days} {locale === 'en' ? 'days ago' : 'дн. назад'}</Text>
          </View>
          {mole.changed && (
            <View style={s.heroChangedBadge}><Text style={s.heroChangedTxt}>{t('result.changedHero')}</Text></View>
          )}
        </View>
      </View>

      {/* Re-scan button — primary CTA */}
      {!editing && (
        <TouchableOpacity
          style={s.rescanBtn}
          onPress={() => router.push({ pathname: '/add', params: { moleId: String(mole.id) } })}
          activeOpacity={0.78}
        >
          <Text style={[s.rescanTxt, { fontSize: Math.round(13 * fontScale) }]}>{t('result.rescan')}</Text>
        </TouchableOpacity>
      )}

      {/* Tabs */}
      <View style={s.tabs}>
        {(['info', 'history', 'compare'] as Tab[]).map((tt) => {
          const labels: Record<Tab, string> = {
            info:    t('result.tabAnalysis'),
            history: t('result.tabHistory'),
            compare: t('result.tabCompare'),
          };
          const active = tab === tt;
          return (
            <TouchableOpacity key={tt} onPress={() => setTab(tt)} activeOpacity={0.72}
              style={[s.tabBtn, active && s.tabBtnActive]}>
              <Text style={[s.tabBtnTxt, active && s.tabBtnTxtActive, { fontSize: Math.round(11 * fontScale) }]}>{labels[tt]}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Анализ — MVP: только категория + рекомендация + дисклеймер */}
        {tab === 'info' && (
          <>
            <View style={[s.summaryBox, { borderColor: cfg.colorBorder, backgroundColor: cfg.colorBg }]}>
              <Text style={[s.summaryTxt, { fontSize: Math.round(12 * fontScale) }]}>{lvlSummary(mole.risk)}</Text>
              <Text style={[s.recTxt, { color: cfg.color, fontSize: Math.round(12 * fontScale) }]}>→ {lvlRec(mole.risk)}</Text>
            </View>

            {/* Обязательный медицинский дисклеймер */}
            <View style={s.disclaimerBox}>
              <Text style={[s.disclaimerTxt, { fontSize: Math.round(11 * fontScale) }]}>{t('disclaimer')}</Text>
            </View>
          </>
        )}

        {/* История */}
        {tab === 'history' && (
          <>
            <View style={s.chartCard}>
              <View style={s.chartHeader}>
                <Text style={s.chartLbl}>{t('result.dynLabel')}</Text>
                <Text style={s.chartCount}>{mole.history.length} {locale === 'en'
                  ? (mole.history.length === 1 ? 'scan' : 'scans')
                  : pluralRu(mole.history.length, ['замер', 'замера', 'замеров'])}</Text>
              </View>
              <LineChart history={mole.history} />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              <View style={s.thumbRow}>
                {mole.history.map((h, i) => {
                  const color = scoreColor(h.s);
                  const cf    = RISK_LEVELS[getRiskLevel(h.s)];
                  return (
                    <View key={i} style={s.thumb}>
                      <View style={[s.thumbBox, { borderColor: `${color}55`, backgroundColor: `${color}12` }]}>
                        <View style={[s.thumbDot, { backgroundColor: color }]} />
                      </View>
                      <Text style={s.thumbMonth}>{h.m}</Text>
                      <Text style={[s.thumbScore, { color }]} numberOfLines={1}>{lvlShort(getRiskLevel(h.s))}</Text>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </>
        )}

        {/* Сравнение */}
        {tab === 'compare' && mole.history.length >= 2 && (
          <>
            <View style={s.compareRow}>
              {[mole.history[0], mole.history[mole.history.length - 1]].map((h, i) => {
                const color = scoreColor(h.s);
                const cf    = RISK_LEVELS[getRiskLevel(h.s)];
                return (
                  <View key={i} style={[s.compareCard, { borderColor: `${color}44`, backgroundColor: `${color}0A` }]}>
                    <View style={[s.compareMole, { borderColor: `${color}55`, backgroundColor: `${color}18` }]}>
                      <View style={[s.compareMoleDot, { backgroundColor: color }]} />
                    </View>
                    <Text style={s.compareMonth} numberOfLines={1}>
                      {h.m} {i === 0 ? mole.since.split(' ')[1] : new Date().getFullYear()}
                    </Text>
                    <Text style={[s.compareLevel, { color }]} adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1}>{lvlShort(getRiskLevel(h.s))}</Text>
                  </View>
                );
              })}
            </View>
            <View style={s.compareStats}>
              {(() => {
                const first = mole.history[0].s;
                const last  = mole.history[mole.history.length - 1].s;
                const diff  = last - first;
                const dynamic =
                  Math.abs(diff) < 0.3 ? t('result.dynStable')
                    : diff > 0          ? t('result.dynRising')
                    :                     t('result.dynFalling');
                const dynColor =
                  Math.abs(diff) < 0.3 ? STONE
                    : diff > 0          ? '#D03020'
                    :                     '#00904A';
                return ([
                  [t('result.dynamic'),       dynamic,                       dynColor],
                  [t('result.measurements'),  String(mole.history.length),   STONE],
                  [t('result.currentLevel'),  lvlShort(mole.risk),           RISK_LEVELS[mole.risk].color],
                ] as const).map(([label, val, color]) => (
                  <View key={label} style={s.compareStatRow}>
                    <Text style={s.compareStatLabel}>{label}</Text>
                    <Text style={[s.compareStatVal, { color }]}>{val}</Text>
                  </View>
                ));
              })()}
            </View>
          </>
        )}
        {tab === 'compare' && mole.history.length < 2 && (
          <Text style={s.notEnoughData}>{t('result.compareNeeds')}</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:            { flex: 1, backgroundColor: BG },
  centered:        { alignItems: 'center', justifyContent: 'center' },
  scroll:          { flex: 1 },
  scrollContent:   { padding: 20, paddingBottom: 32 },
  notFound:        { color: DIM, fontSize: 14, marginBottom: 16 },
  backLink:        { color: STONE, fontSize: 13, fontWeight: '600' },
  topBar:          { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 14 },
  backBtn:         { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: '#EDE9E3', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', flexShrink: 0, shadowColor: DARK, shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  backBtnTxt:      { color: DIM, fontSize: 16 },
  detailName:      { fontSize: 15, fontWeight: '700', color: DARK, letterSpacing: -0.3 },
  detailSub:       { fontSize: 11, color: FAINT, marginTop: 2 },
  changedChip:     { borderWidth: 1, borderColor: '#F0D8A8', backgroundColor: '#FFF8F0', borderRadius: 99, paddingHorizontal: 12, paddingVertical: 5 },
  changedChipTxt:  { fontSize: 10, color: '#E06000', fontWeight: '600' },
  editBtn:         { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: '#EDE9E3', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  editBtnIcon:     { fontSize: 15, color: STONE },
  editActionBtn:   { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 99, borderWidth: 1, borderColor: '#EDE9E3', backgroundColor: '#fff', flexShrink: 0 },
  editCancelTxt:   { fontSize: 11, color: DIM, fontWeight: '600' },
  editSaveBtn:     { backgroundColor: DARK, borderColor: DARK },
  editSaveTxt:     { fontSize: 11, color: '#F0EDE8', fontWeight: '700' },
  editCard:        { marginHorizontal: 20, marginBottom: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: '#EDE9E3', borderRadius: 20, padding: 16, shadowColor: DARK, shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  editLbl:         { fontSize: 9, color: FAINT, letterSpacing: 2, textTransform: 'uppercase', fontWeight: '600', marginBottom: 8 },
  editInput:       { fontSize: 14, color: DARK, fontWeight: '600', borderBottomWidth: 1, borderBottomColor: '#EDE9E3', paddingVertical: 6 },
  zoneGrid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  zoneChip:        { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 22, borderWidth: 1, borderColor: '#EDE9E3', backgroundColor: '#F8F6F3' },
  zoneChipOn:      { borderColor: DARK, backgroundColor: DARK },
  zoneChipTxt:     { fontSize: 11, color: DIM, fontWeight: '500' },
  zoneChipTxtOn:   { color: '#F0EDE8', fontWeight: '600' },
  heroPad:         { paddingHorizontal: 20, paddingBottom: 14 },
  heroCard:        { backgroundColor: '#fff', borderRadius: 24, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderColor: '#EDE9E3', overflow: 'hidden' },
  heroLeft:        { flexShrink: 0 },
  heroMole:        { width: 80, height: 80, borderRadius: 20, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  heroMoleImg:     { width: '100%', height: '100%' },
  heroMoleDot:     { width: 36, height: 32, borderRadius: 99, backgroundColor: '#7A5035' },
  heroLevel:       { fontSize: 24, letterSpacing: -0.8, lineHeight: 28, marginBottom: 6 },
  heroRec:         { fontSize: 12, fontWeight: '600', letterSpacing: 0.1, lineHeight: 16, marginBottom: 8, opacity: 0.85 },
  heroMeta:        { fontSize: 11, color: DIM },
  heroChangedBadge:{ position: 'absolute', top: 10, right: 10, borderWidth: 1, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4, borderColor: '#F0D8A8', backgroundColor: '#FFF8F0' },
  heroChangedTxt:  { fontSize: 9, color: '#E06000', fontWeight: '700' },
  rescanBtn:       { marginHorizontal: 20, marginBottom: 12, paddingVertical: 14, borderRadius: 18, backgroundColor: DARK, alignItems: 'center', shadowColor: DARK, shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  rescanTxt:       { fontSize: 13, fontWeight: '700', color: '#F0EDE8', letterSpacing: 0.3 },
  tabs:            { flexDirection: 'row', gap: 6, paddingHorizontal: 20, paddingBottom: 12 },
  tabBtn:          { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 22, borderWidth: 1.5, borderColor: '#EDE9E3', backgroundColor: '#fff' },
  tabBtnActive:    { borderColor: DARK, backgroundColor: DARK },
  tabBtnTxt:       { fontSize: 11, color: FAINT, letterSpacing: 0.2, fontWeight: '500' },
  tabBtnTxtActive: { color: '#F0EDE8', fontWeight: '700' },
  summaryBox:      { borderWidth: 1, borderRadius: 18, padding: 16, marginTop: 4 },
  summaryTxt:      { fontSize: 12, color: DIM, lineHeight: 20, marginBottom: 8 },
  recTxt:          { fontSize: 12, fontWeight: '600' },
  abcdeLink:       { alignSelf: 'center', marginTop: 12, marginBottom: 4, paddingVertical: 8, paddingHorizontal: 16 },
  abcdeLinkTxt:    { fontSize: 12, color: STONE, fontWeight: '600', letterSpacing: 0.2 },
  disclaimerBox:   { marginTop: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: '#EDE9E3', backgroundColor: '#FBFAF7' },
  disclaimerTxt:   { fontSize: 11, color: DIM, lineHeight: 16, textAlign: 'center', fontWeight: '500' },
  chartCard:       { backgroundColor: '#fff', borderWidth: 1, borderColor: '#EDE9E3', borderRadius: 20, padding: 16, marginBottom: 10, shadowColor: DARK, shadowOpacity: 0.04, shadowRadius: 12, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  chartHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  chartLbl:        { fontSize: 9, color: FAINT, letterSpacing: 2, textTransform: 'uppercase', fontWeight: '600' },
  chartCount:      { fontSize: 10, color: STONE, fontWeight: '600', letterSpacing: 0.2 },
  thumbRow:        { flexDirection: 'row', gap: 8, paddingHorizontal: 2 },
  thumb:           { alignItems: 'center', gap: 4 },
  thumbBox:        { width: 52, height: 52, borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  thumbDot:        { width: 22, height: 20, borderRadius: 99 },
  thumbMonth:      { fontSize: 9, color: FAINT, fontWeight: '500' },
  thumbScore:      { fontSize: 11, fontWeight: '800' },
  compareRow:      { flexDirection: 'row', gap: 10, marginBottom: 12 },
  compareCard:     { flex: 1, borderWidth: 1.5, borderRadius: 20, padding: 14, alignItems: 'center' },
  compareMole:     { width: 52, height: 52, borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginBottom: 10, overflow: 'hidden' },
  compareMoleDot:  { width: 22, height: 20, borderRadius: 99 },
  compareMonth:    { fontSize: 10, color: DIM, marginBottom: 4 },
  compareLevel:    { fontSize: 14, fontWeight: '800', letterSpacing: -0.3, textAlign: 'center', marginTop: 2 },
  compareStats:    { backgroundColor: '#fff', borderWidth: 1, borderColor: '#EDE9E3', borderRadius: 18, paddingHorizontal: 16, shadowColor: DARK, shadowOpacity: 0.03, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  compareStatRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F5F2EE' },
  compareStatLabel:{ fontSize: 12, color: DIM },
  compareStatVal:  { fontSize: 13, fontWeight: '700' },
  notEnoughData:   { color: FAINT, fontSize: 12, textAlign: 'center', lineHeight: 18, marginTop: 40 },
});
