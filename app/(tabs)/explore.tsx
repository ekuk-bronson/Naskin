import React, { useCallback, useState } from 'react';
import {
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { getSetting, setSetting, deleteAllMolesForCurrentUser } from '../../services/storage';
import { useLocale, setLocale } from '../../services/i18n';
import { setTextSize as setTextSizeStore, useTextScale } from '../../services/textScale';

const BG     = '#F8F6F3';
const DARK   = '#1C1A18';
const STONE  = '#8B7355';
const DIM    = '#9A9087';
const FAINT  = '#C5BDB4';
const BORDER = '#EDE9E3';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

function SettingsCard({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

interface RowProps {
  label: string;
  sublabel?: string;
  isFirst?: boolean;
  children?: React.ReactNode;
  onPress?: () => void;
}

function SettingsRow({ label, sublabel, isFirst, children, onPress }: RowProps) {
  const rowStyle = [styles.row, isFirst && styles.rowFirst];
  const inner = (
    <>
      <View style={styles.rowLeft}>
        <Text style={styles.rowLabel}>{label}</Text>
        {sublabel ? <Text style={styles.rowSublabel}>{sublabel}</Text> : null}
      </View>
      {children}
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.7} style={rowStyle} onPress={onPress}>
        {inner}
      </TouchableOpacity>
    );
  }
  return <View style={rowStyle}>{inner}</View>;
}

interface ChipOption {
  value: string;
  label: string;
  disabled?: boolean;
  badge?: string;
}

interface ChipSelectorProps {
  options: ChipOption[];
  selected: string;
  onSelect: (value: string) => void;
}

function ChipSelector({ options, selected, onSelect }: ChipSelectorProps) {
  return (
    <View style={styles.chipRow}>
      {options.map((option) => {
        const isActive = option.value === selected;
        return (
          <TouchableOpacity
            key={option.value}
            activeOpacity={0.75}
            onPress={() => onSelect(option.value)}
            style={[
              styles.chip,
              isActive && styles.chipActive,
              option.disabled && styles.chipDisabled,
            ]}
          >
            <Text style={isActive ? styles.chipTextActive : styles.chipText}>
              {option.label}
              {option.badge ? (
                <Text style={{ fontSize: 10, color: DIM }}>{' ' + option.badge}</Text>
              ) : null}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Default export
// ---------------------------------------------------------------------------

export default function SettingsScreen() {
  const router = useRouter();
  const { t }  = useLocale();
  const fontScale = useTextScale();
  const [textSize, setTextSize]               = useState<'normal' | 'large'>('normal');
  const [hapticsEnabled, setHapticsEnabled]   = useState(true);
  const [language, setLanguage]               = useState<'ru' | 'en'>('ru');
  const [defaultSort, setDefaultSort]         = useState<'date' | 'score' | 'name'>('date');
  const [analysisQuality, setAnalysisQuality] = useState<'standard' | 'high'>('standard');

  useFocusEffect(
    useCallback(() => {
      setTextSize((getSetting('text_size') as any) ?? 'normal');
      setHapticsEnabled(getSetting('haptics') !== 'false');
      setLanguage((getSetting('language') as any) ?? 'ru');
      setDefaultSort((getSetting('default_sort') as any) ?? 'date');
      setAnalysisQuality((getSetting('analysis_quality') as any) ?? 'standard');
    }, []),
  );

  const handleTextSize = (v: 'normal' | 'large') => {
    setTextSize(v);
    // setTextSizeStore writes to settings + notifies all subscribers,
    // so any component using useTextScale() / useScaledFont() re-renders.
    setTextSizeStore(v);
  };

  const handleHaptics = async (v: boolean) => {
    if (v) { try { await Haptics.selectionAsync(); } catch {} }
    setSetting('haptics', v ? 'true' : 'false');
    setHapticsEnabled(v);
  };

  const handleLanguage = (v: 'ru' | 'en') => {
    setLanguage(v);
    // setLocale internally writes to setSetting('language', v) and notifies
    // all useLocale() subscribers — entire UI re-renders in the new locale.
    setLocale(v);
  };

  const handleDefaultSort = (v: 'date' | 'score' | 'name') => {
    setSetting('default_sort', v);
    setDefaultSort(v);
  };

  const handleAnalysisQuality = (v: 'standard' | 'high') => {
    setSetting('analysis_quality', v);
    setAnalysisQuality(v);
  };

  const handlePrivacyPolicy = () => {
    Linking.openURL('https://freeskin.app/privacy').catch(() =>
      Alert.alert(
        t('settings.privacy'),
        'https://freeskin.app/privacy',
        [{ text: t('common.ok') }],
      ),
    );
  };

  const handleContactDev = () => {
    Linking.openURL('mailto:support@freeskin.app?subject=FreeSkin%20Feedback').catch(() =>
      Alert.alert(t('common.error'), 'mailto: not supported', [{ text: t('common.ok') }]),
    );
  };

  const handleResetOnboarding = () => {
    setSetting('onboarding_done', '');
    router.replace('/onboarding');
  };

  const handleEraseData = () => {
    Alert.alert(
      t('settings.eraseTitle'),
      t('settings.eraseMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.eraseConfirm'),
          style: 'destructive',
          onPress: async () => {
            const n = await deleteAllMolesForCurrentUser();
            Alert.alert(t('settings.eraseDone'), t('settings.eraseDoneMsg').replace('{n}', String(n)));
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={[styles.sup, { fontSize: Math.round(9 * fontScale) }]}>{t('settings.title').toUpperCase()}</Text>
        <Text style={[styles.title, { fontSize: Math.round(28 * fontScale) }]}>{t('settings.title')}</Text>
        <Text style={[styles.subtitle, { fontSize: Math.round(11 * fontScale) }]}>{t('settings.subtitle')}</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <SectionHeader title={t('settings.secInterface')} />
        <SettingsCard>
          <SettingsRow isFirst label={t('settings.textSize')}>
            <ChipSelector
              options={[
                { value: 'normal', label: t('settings.textNormal') },
                { value: 'large',  label: t('settings.textLarge') },
              ]}
              selected={textSize}
              onSelect={handleTextSize as (v: string) => void}
            />
          </SettingsRow>
          <SettingsRow label={t('settings.haptics')}>
            <Switch
              value={hapticsEnabled}
              onValueChange={handleHaptics}
              trackColor={{ false: FAINT, true: STONE }}
              thumbColor="#fff"
            />
          </SettingsRow>
        </SettingsCard>

        <SectionHeader title={t('settings.secLanguage')} />
        <SettingsCard>
          <SettingsRow isFirst label={t('settings.appLang')}>
            <ChipSelector
              options={[
                { value: 'ru', label: t('settings.langRu') },
                { value: 'en', label: t('settings.langEn') },
              ]}
              selected={language}
              onSelect={handleLanguage as (v: string) => void}
            />
          </SettingsRow>
        </SettingsCard>

        <SectionHeader title={t('settings.secData')} />
        <SettingsCard>
          <SettingsRow isFirst label={t('settings.dataSort')}>
            <ChipSelector
              options={[
                { value: 'date',  label: t('settings.sortDate') },
                { value: 'score', label: t('settings.sortRisk') },
                { value: 'name',  label: t('settings.sortName') },
              ]}
              selected={defaultSort}
              onSelect={handleDefaultSort as (v: string) => void}
            />
          </SettingsRow>
          <SettingsRow label={t('settings.analysis')} sublabel={t('settings.qualityDesc')}>
            <ChipSelector
              options={[
                { value: 'standard', label: t('settings.qualityStd') },
                { value: 'high',     label: t('settings.qualityHigh') },
              ]}
              selected={analysisQuality}
              onSelect={handleAnalysisQuality as (v: string) => void}
            />
          </SettingsRow>
          <SettingsRow
            label={t('settings.erase')}
            sublabel={t('settings.eraseSub')}
            onPress={handleEraseData}
          >
            <Text style={[styles.chevron, { color: '#E8003D' }]}>›</Text>
          </SettingsRow>
        </SettingsCard>

        <SectionHeader title={t('settings.secAbout')} />
        <SettingsCard>
          <View style={styles.appInfoBlock}>
            <View style={styles.appInfoLeft}>
              <Text style={styles.appInfoAppName}>FreeSkin</Text>
              <Text style={styles.appInfoAppSub}>{t('login.tagline').toUpperCase()}</Text>
            </View>
            <View style={styles.appInfoRight}>
              <Text style={styles.appInfoVersion}>v0.1.0</Text>
              <Text style={styles.appInfoSdk}>Expo SDK 54</Text>
            </View>
          </View>
          <SettingsRow isFirst label={t('settings.privacy')} onPress={handlePrivacyPolicy}>
            <Text style={styles.chevron}>›</Text>
          </SettingsRow>
          <SettingsRow label={t('settings.contact')} onPress={handleContactDev}>
            <Text style={styles.chevron}>›</Text>
          </SettingsRow>
          <SettingsRow label={t('settings.replayOb')} sublabel={t('settings.replayObSub')} onPress={handleResetOnboarding}>
            <Text style={styles.chevron}>›</Text>
          </SettingsRow>
        </SettingsCard>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:             { flex: 1, backgroundColor: BG },
  header:           { paddingHorizontal: 24, paddingTop: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: BORDER },
  sup:              { fontSize: 9, color: STONE, letterSpacing: 2.2, fontWeight: '600', textTransform: 'uppercase', marginBottom: 4 },
  title:            { fontSize: 28, fontWeight: '800', color: DARK, letterSpacing: -0.8 },
  subtitle:         { fontSize: 11, color: FAINT, marginTop: 3 },
  scroll:           { flex: 1 },
  content:          { paddingHorizontal: 16, paddingBottom: 36 },
  sectionHeader:    { fontSize: 9, color: FAINT, letterSpacing: 2.0, textTransform: 'uppercase', fontWeight: '600', marginTop: 22, marginBottom: 8, marginLeft: 2 },
  card:             { backgroundColor: '#fff', borderWidth: 1, borderColor: BORDER, borderRadius: 24, marginBottom: 4, shadowColor: DARK, shadowOpacity: 0.04, shadowRadius: 12, shadowOffset: { width: 0, height: 3 }, elevation: 2, overflow: 'hidden' },
  row:              { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14, borderTopWidth: 1, borderTopColor: BORDER },
  rowFirst:         { borderTopWidth: 0 },
  rowLeft:          { flex: 1 },
  rowLabel:         { fontSize: 14, color: DARK, fontWeight: '600', letterSpacing: -0.1 },
  rowSublabel:      { fontSize: 11, color: DIM, marginTop: 2 },
  chipRow:          { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip:             { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99, borderWidth: 1, borderColor: BORDER, backgroundColor: BG },
  chipActive:       { backgroundColor: DARK, borderColor: DARK },
  chipDisabled:     { opacity: 0.4 },
  chipText:         { fontSize: 12, color: DIM, fontWeight: '600' },
  chipTextActive:   { fontSize: 12, color: '#F0EDE8', fontWeight: '600' },
  chevron:          { fontSize: 18, color: FAINT, fontWeight: '300' },
  appInfoBlock:     { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: BORDER, flexDirection: 'row', justifyContent: 'space-between' },
  appInfoLeft:      {},
  appInfoAppName:   { fontSize: 18, fontWeight: '800', color: DARK, letterSpacing: -0.6 },
  appInfoAppSub:    { fontSize: 9, color: STONE, letterSpacing: 2.0, textTransform: 'uppercase', fontWeight: '600', marginTop: 3 },
  appInfoRight:     { alignItems: 'flex-end' },
  appInfoVersion:   { fontSize: 12, color: DARK, fontWeight: '600' },
  appInfoSdk:       { fontSize: 10, color: FAINT, marginTop: 1 },
});
