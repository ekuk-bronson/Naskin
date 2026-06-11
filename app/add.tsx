import React, { useEffect, useRef, useState } from 'react';
import {
  Alert, Animated, Modal, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View, useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { CameraCapture } from '../components/CameraCapture';
import { analyzeImage } from '../services/mockAnalyzer';
import { getAllMoles, getMole, insertMole, updateMoleScore, type Mole, type MoleHistoryPoint, type UpdateScoreExtras } from '../services/storage';
import { scheduleHighRiskReminder } from '../services/notifications';
import { useLocale } from '../services/i18n';
import { checkPhotoQuality, type QualityResult } from '../services/preprocessing';
import { modelRunner } from '../model/ModelRunner';

const BG     = '#F8F6F3';
const DARK   = '#1C1A18';
const STONE  = '#8B7355';
const DIM    = '#9A9087';
const FAINT  = '#C5BDB4';
const BORDER = '#EDE9E3';

const BODY_LOCATION_KEYS = [
  'loc.head', 'loc.neck', 'loc.chest', 'loc.back', 'loc.belly',
  'loc.leftArm', 'loc.rightArm', 'loc.leftLeg', 'loc.rightLeg', 'loc.other',
];

type WizardStep = 1 | 2 | 3;

function StepDots({ total, current }: { total: number; current: WizardStep }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
      {Array.from({ length: total }, (_, i) => {
        const s = (i + 1) as WizardStep;
        const done   = s < current;
        const active = s === current;
        return (
          <View
            key={i}
            style={{
              width: active ? 18 : done ? 8 : 6,
              height: 6,
              borderRadius: 99,
              backgroundColor: active ? DARK : done ? STONE : FAINT,
            }}
          />
        );
      })}
    </View>
  );
}

export default function AddScreen() {
  const router = useRouter();
  const { t, locale } = useLocale();
  const { moleId: moleIdStr } = useLocalSearchParams<{ moleId?: string }>();
  const moleId       = moleIdStr ? Number(moleIdStr) : null;
  const existingMole = moleId ? getMole(moleId) : null;
  const isRescan     = !!moleId && !!existingMole;

  const { width } = useWindowDimensions();
  const [step, setStep]         = useState<WizardStep>(isRescan ? 2 : 1);
  const [moleName, setMoleName] = useState('');
  const [location, setLocation] = useState<string>('');
  // Compute default name once on mount — avoids running getAllMoles()
  // SQL on every re-render (Animated.Value triggers many).
  const [defaultName] = useState(() => `${t('add.placeholderName')} #${getAllMoles().length + 1}`);
  const [imageUri, setImageUri]     = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [quality, setQuality]       = useState<QualityResult | null>(null);
  const [qualityLoading, setQualityLoading] = useState(false);
  const [qualityIgnored, setQualityIgnored] = useState(false);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim    = useRef(new Animated.Value(1)).current;

  // Auto-run quality check whenever a new image is set on step 2.
  // Cheap path: only decode + segment + measure, no full pipeline.
  useEffect(() => {
    if (!imageUri || step !== 2) { setQuality(null); setQualityIgnored(false); return; }
    let cancelled = false;
    setQualityLoading(true);
    setQuality(null);
    setQualityIgnored(false);
    checkPhotoQuality(imageUri)
      .then((res) => { if (!cancelled) setQuality(res); })
      .catch(() => { if (!cancelled) setQuality(null); })
      .finally(() => { if (!cancelled) setQualityLoading(false); });
    return () => { cancelled = true; };
  }, [imageUri, step]);

  const qualityOk = !quality || quality.ok || qualityIgnored;

  // Start pulse + progress when entering step 3
  useEffect(() => {
    if (step !== 3) return;
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.06, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 900, useNativeDriver: true }),
      ])
    ).start();
    Animated.timing(progressAnim, { toValue: 1, duration: 2200, useNativeDriver: false }).start();
    runAnalysis();
  }, [step]);

  const goToStep3 = () => {
    progressAnim.setValue(0);
    pulseAnim.setValue(1);
    setStep(3);
  };

  const pickFromGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('add.errPermission'), t('add.errPermissionMsg'));
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!res.canceled && res.assets[0]) setImageUri(res.assets[0].uri);
  };

  const runAnalysis = async () => {
    if (!imageUri) return;
    try {
      const result = await analyzeImage(imageUri);
      const now    = new Date();
      const MONTHS_RU = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
      const MONTHS_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const m      = (locale === 'en' ? MONTHS_EN : MONTHS_RU)[now.getMonth()]!;

      if (isRescan && moleId) {
        // Update existing mole — append history point + refresh image/text
        const pt: MoleHistoryPoint = { m, s: result.score };
        const extras: UpdateScoreExtras = { imageUri, summary: result.summary, rec: result.rec };
        updateMoleScore(moleId, result.score, result.risk, result.abcde, pt, extras);
        if (result.risk === 'high' || result.risk === 'urgent') {
          scheduleHighRiskReminder(moleId, existingMole?.name ?? t('add.placeholderName')).catch(() => {});
        }
        router.replace({ pathname: '/result', params: { id: String(moleId) } });
      } else {
        const name = moleName.trim() || defaultName;
        const draft: Omit<Mole, 'id'> = {
          name,
          loc:      location,
          score:    result.score,
          risk:     result.risk,
          days:     0,
          changed:  false,
          size:     `${result.sizeMm} ${locale === 'en' ? 'mm' : 'мм'}`,
          since:    `${m} ${now.getFullYear()}`,
          imageUri: imageUri,
          abcde:    result.abcde,
          history:  [{ m, s: result.score }],
          summary:  result.summary,
          rec:      result.rec,
        };
        const newId = insertMole(draft);
        if (result.risk === 'high' || result.risk === 'urgent') {
          scheduleHighRiskReminder(newId, name).catch(() => {});
        }
        router.replace({ pathname: '/result', params: { id: String(newId) } });
      }
    } catch {
      Alert.alert(t('common.error'), t('add.errAnalysis'), [
        { text: t('common.back'), onPress: () => setStep(2) },
      ]);
    }
  };

  const backAction = () => {
    if (step === 1) router.back();
    else if (step === 2) { if (isRescan) router.back(); else setStep(1); }
    // step 3: back disabled
  };

  const progressWidth = progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  // ─── STEP 1 ────────────────────────────────────────────────────────────────
  if (step === 1) return (
    <SafeAreaView style={styles.root}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={backAction} activeOpacity={0.7}>
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>{t('add.titleNew')}</Text>
        <StepDots total={3} current={1} />
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>{t('add.headingName')}</Text>
        <Text style={styles.subLabel}>{t('add.lblName')}</Text>
        <View style={styles.inputCard}>
          <TextInput
            style={styles.input}
            value={moleName}
            onChangeText={setMoleName}
            placeholder={defaultName}
            placeholderTextColor={FAINT}
            maxLength={48}
            returnKeyType="done"
          />
        </View>
        <Text style={[styles.subLabel, { marginTop: 20 }]}>{t('add.lblLocation')}</Text>
        <View style={styles.chipGrid}>
          {BODY_LOCATION_KEYS.map((key) => {
            const label = t(key);
            const on    = location === label;
            return (
              <TouchableOpacity
                key={key}
                style={[styles.chip, on && styles.chipActive]}
                onPress={() => setLocation(label)}
                activeOpacity={0.75}
              >
                <Text style={[styles.chipText, on && styles.chipTextActive]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.ctaBtn, !location && styles.ctaBtnDisabled]}
          onPress={() => setStep(2)}
          disabled={!location}
          activeOpacity={0.82}
        >
          <Text style={styles.ctaBtnText}>{location ? t('add.next') : t('add.chooseLocation')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );

  // ─── STEP 2 ────────────────────────────────────────────────────────────────
  if (step === 2) return (
    <SafeAreaView style={styles.root}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={backAction} activeOpacity={0.7}>
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>{isRescan ? `${t('add.titleRescan')} · ${existingMole?.name ?? ''}` : t('add.titlePhoto')}</Text>
        <StepDots total={3} current={2} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.heading}>{t('add.headingPhoto')}</Text>
        {imageUri ? (
          <View style={styles.previewWrapper}>
            <Image source={{ uri: imageUri }} style={[styles.preview, { width: width - 48, height: width - 48 }]} contentFit="cover" />
            <TouchableOpacity onPress={() => setImageUri(null)} style={styles.retakeBtn}>
              <Text style={styles.retakeBtnText}>{t('add.retake')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.emptyPreview}>
            <Text style={styles.emptyIcon}>◎</Text>
            <Text style={styles.emptyText}>{t('add.emptyHint')}</Text>
          </View>
        )}

        {/* ── Quality-check banner ──────────────────────────────── */}
        {imageUri && qualityLoading && (
          <View style={styles.qBanner}>
            <View style={[styles.qDot, { backgroundColor: FAINT }]} />
            <Text style={styles.qLoading}>{t('add.qualityChecking')}</Text>
          </View>
        )}

        {imageUri && !qualityLoading && quality && !quality.ok && !qualityIgnored && (
          <View style={[styles.qBanner, styles.qBannerWarn]}>
            <View style={[styles.qDot, { backgroundColor: '#E06000' }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.qTitle}>{t('add.qualityProblem')}</Text>
              <Text style={styles.qBody}>{t(quality.reason ?? 'common.error')}</Text>
              <View style={styles.qActions}>
                <TouchableOpacity onPress={() => setImageUri(null)} activeOpacity={0.7}>
                  <Text style={styles.qLink}>{t('add.retake')}</Text>
                </TouchableOpacity>
                <Text style={styles.qSep}>·</Text>
                <TouchableOpacity onPress={() => setQualityIgnored(true)} activeOpacity={0.7}>
                  <Text style={[styles.qLink, styles.qLinkSecondary]}>{t('add.qualityIgnore')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {imageUri && !qualityLoading && quality && quality.ok && (
          <View style={[styles.qBanner, styles.qBannerOk]}>
            <View style={[styles.qDot, { backgroundColor: '#00904A' }]} />
            <Text style={styles.qOk}>{t('add.qualityOk')}</Text>
          </View>
        )}

        <TouchableOpacity style={[styles.photoBtn, styles.photoBtnPrimary]} onPress={() => setShowCamera(true)} activeOpacity={0.82}>
          <Text style={styles.photoBtnPrimaryText}>{t('add.takePhoto')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.photoBtn, styles.photoBtnSecondary]} onPress={pickFromGallery} activeOpacity={0.82}>
          <Text style={styles.photoBtnSecondaryText}>{t('add.fromGallery')}</Text>
        </TouchableOpacity>
      </ScrollView>
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.ctaBtn, (!imageUri || !qualityOk) && styles.ctaBtnDisabled]}
          onPress={goToStep3}
          disabled={!imageUri || !qualityOk}
          activeOpacity={0.82}
        >
          <Text style={styles.ctaBtnText}>{t('add.continue')}</Text>
        </TouchableOpacity>
      </View>
      <Modal visible={showCamera} animationType="slide" statusBarTranslucent>
        <CameraCapture
          onCapture={(uri) => { setImageUri(uri); setShowCamera(false); }}
          onClose={() => setShowCamera(false)}
          onPickGallery={pickFromGallery}
        />
      </Modal>
    </SafeAreaView>
  );

  // ─── STEP 3 ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.topBar}>
        <View style={[styles.backBtn, { opacity: 0.2 }]}>
          <Text style={styles.backBtnText}>←</Text>
        </View>
        <Text style={styles.topBarTitle}>{t('add.analyzing')}</Text>
        <StepDots total={3} current={3} />
      </View>
      <View style={styles.analyzeCenter}>
        <Animated.View style={[styles.orb, { transform: [{ scale: pulseAnim }] }]} />
        <Text style={styles.analyzeTitle}>{t('add.analyzing')}</Text>
        <Text style={styles.analyzeSubtitle}>{t('add.analyzingSub')}</Text>
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
        </View>

        {/* Demo-mode badge: shown when the TFLite model is not active */}
        {!modelRunner.isEnabled && (
          <View style={styles.demoBadge}>
            <View style={styles.demoDot} />
            <Text style={styles.demoText}>{t('analysis.mock')}</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:           { flex: 1, backgroundColor: BG },
  topBar:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: BORDER },
  backBtn:        { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backBtnText:    { fontSize: 20, color: DARK },
  topBarTitle:    { fontSize: 13, fontWeight: '600', color: DARK, letterSpacing: 0.2 },
  content:        { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 120 },
  heading:        { fontSize: 28, fontWeight: '800', color: DARK, letterSpacing: -0.8, marginBottom: 24 },
  subLabel:       { fontSize: 10, fontWeight: '700', color: FAINT, letterSpacing: 2.2, textTransform: 'uppercase', marginBottom: 10 },
  inputCard:      { backgroundColor: '#fff', borderWidth: 1, borderColor: BORDER, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 4, shadowColor: DARK, shadowOpacity: 0.03, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  input:          { fontSize: 15, color: DARK, paddingVertical: 14, fontWeight: '500' },
  chipGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:           { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, borderWidth: 1, borderColor: BORDER, backgroundColor: '#fff' },
  chipActive:     { backgroundColor: DARK, borderColor: DARK },
  chipText:       { fontSize: 12, color: DARK, fontWeight: '500' },
  chipTextActive: { color: '#F0EDE8' },
  bottomBar:      { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 24, paddingBottom: 32, paddingTop: 16, backgroundColor: BG, borderTopWidth: 1, borderTopColor: BORDER },
  ctaBtn:         { backgroundColor: DARK, borderRadius: 18, paddingVertical: 16, alignItems: 'center' },
  ctaBtnDisabled: { opacity: 0.35 },
  ctaBtnText:     { fontSize: 14, fontWeight: '700', color: '#F0EDE8', letterSpacing: 0.3 },
  previewWrapper: { alignItems: 'center', marginBottom: 20 },
  preview:        { borderRadius: 24, overflow: 'hidden' },
  retakeBtn:      { marginTop: 12 },
  retakeBtnText:  { fontSize: 12, color: STONE, fontWeight: '600', letterSpacing: 0.2 },
  emptyPreview:   { alignItems: 'center', justifyContent: 'center', height: 200, borderRadius: 24, borderWidth: 1.5, borderColor: BORDER, borderStyle: 'dashed', marginBottom: 20 },
  emptyIcon:      { fontSize: 40, color: FAINT, marginBottom: 12 },
  emptyText:      { fontSize: 12, color: FAINT, textAlign: 'center', lineHeight: 18 },
  photoBtn:       { borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginBottom: 10 },
  photoBtnPrimary:       { backgroundColor: DARK },
  photoBtnPrimaryText:   { fontSize: 14, fontWeight: '700', color: '#F0EDE8', letterSpacing: 0.3 },
  photoBtnSecondary:     { backgroundColor: '#fff', borderWidth: 1, borderColor: BORDER },
  photoBtnSecondaryText: { fontSize: 14, fontWeight: '700', color: DARK, letterSpacing: 0.3 },

  // Quality-check banner
  qBanner:          { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: BORDER, backgroundColor: '#fff', marginBottom: 14 },
  qBannerWarn:      { borderColor: '#F0D8A8', backgroundColor: '#FFF8F0' },
  qBannerOk:        { borderColor: '#C8E8D4', backgroundColor: '#F0FFF6' },
  qDot:             { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  qLoading:         { fontSize: 12, color: DIM, fontWeight: '500', flex: 1, marginTop: 1 },
  qOk:              { fontSize: 12, color: '#00904A', fontWeight: '600', flex: 1, marginTop: 1 },
  qTitle:           { fontSize: 12, fontWeight: '700', color: '#E06000', letterSpacing: 0.1, marginBottom: 3 },
  qBody:            { fontSize: 12, color: DARK, lineHeight: 17 },
  qActions:         { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  qLink:            { fontSize: 12, color: STONE, fontWeight: '700', letterSpacing: 0.2 },
  qLinkSecondary:   { color: DIM, fontWeight: '500' },
  qSep:             { fontSize: 12, color: FAINT },

  // Demo-mode hint shown during step 3 when the real model isn't loaded
  demoBadge:        { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 28, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, borderWidth: 1, borderColor: BORDER, backgroundColor: '#FBFAF7' },
  demoDot:          { width: 7, height: 7, borderRadius: 4, backgroundColor: STONE },
  demoText:         { fontSize: 11, fontWeight: '600', color: STONE, letterSpacing: 0.3 },
  analyzeCenter:  { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  orb:            { width: 120, height: 120, borderRadius: 60, backgroundColor: BORDER, marginBottom: 28, shadowColor: STONE, shadowOpacity: 0.15, shadowRadius: 20, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  analyzeTitle:   { fontSize: 20, fontWeight: '700', color: DARK, letterSpacing: -0.4, marginBottom: 8 },
  analyzeSubtitle:{ fontSize: 12, color: FAINT, letterSpacing: 0.2, lineHeight: 18 },
  progressTrack:  { width: '72%', height: 3, backgroundColor: BORDER, borderRadius: 99, marginTop: 32, overflow: 'hidden' },
  progressFill:   { height: '100%', backgroundColor: STONE, borderRadius: 99 },
});
