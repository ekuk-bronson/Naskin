import { useRouter } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocale } from '../services/i18n';

const BG   = '#F8F6F3';
const DARK = '#1C1A18';
const STONE = '#8B7355';
const DIM  = '#9A9087';
const FAINT = '#C5BDB4';

const TIPS = [
  { letter: 'A', titleKey: 'modal.aTitle', descKey: 'modal.aDesc' },
  { letter: 'B', titleKey: 'modal.bTitle', descKey: 'modal.bDesc' },
  { letter: 'C', titleKey: 'modal.cTitle', descKey: 'modal.cDesc' },
  { letter: 'D', titleKey: 'modal.dTitle', descKey: 'modal.dDesc' },
  { letter: 'E', titleKey: 'modal.eTitle', descKey: 'modal.eDesc' },
];

export default function ModalScreen() {
  const router = useRouter();
  const { t } = useLocale();
  return (
    <SafeAreaView style={s.root}>
      <View style={s.topBar}>
        <TouchableOpacity style={s.closeBtn} onPress={() => router.back()} activeOpacity={0.72}>
          <Text style={s.closeTxt}>✕</Text>
        </TouchableOpacity>
        <Text style={s.topTitle}>{t('modal.title')}</Text>
        <View style={{ width: 36 }} />
      </View>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Text style={s.lead}>{t('modal.sub')}</Text>
        {TIPS.map((tip) => (
          <View key={tip.letter} style={s.card}>
            <View style={s.badge}><Text style={s.badgeLetter}>{tip.letter}</Text></View>
            <View style={s.cardText}>
              <Text style={s.cardTitle}>{t(tip.titleKey)}</Text>
              <Text style={s.cardBody}>{t(tip.descKey)}</Text>
            </View>
          </View>
        ))}
        <View style={s.disclaimer}>
          <Text style={s.disclaimerTxt}>{t('disclaimer')}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:          { flex: 1, backgroundColor: BG },
  topBar:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#EDE9E3' },
  closeBtn:      { width: 36, height: 36, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#EDE9E3', alignItems: 'center', justifyContent: 'center' },
  closeTxt:      { fontSize: 14, color: DIM },
  topTitle:      { fontSize: 15, fontWeight: '700', color: DARK, letterSpacing: -0.3 },
  content:       { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 36 },
  lead:          { fontSize: 14, color: DIM, lineHeight: 22, marginBottom: 20 },
  card:          { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#EDE9E3', gap: 14 },
  badge:         { width: 44, height: 44, borderRadius: 12, backgroundColor: DARK, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  badgeLetter:   { fontSize: 20, fontWeight: '800', color: '#F0EDE8' },
  cardText:      { flex: 1 },
  cardTitle:     { fontSize: 13, fontWeight: '700', color: DARK, marginBottom: 5 },
  cardBody:      { fontSize: 12, color: DIM, lineHeight: 18 },
  disclaimer:    { marginTop: 12, padding: 14, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#EDE9E3' },
  disclaimerTxt: { fontSize: 11, color: FAINT, textAlign: 'center', lineHeight: 17 },
});
