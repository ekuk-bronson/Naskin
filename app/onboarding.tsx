import React, { useCallback, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { setSetting } from '../services/storage';
import { useAuth } from '../contexts/AuthContext';
import { useLocale } from '../services/i18n';

const { width: W } = Dimensions.get('window');

const BG     = '#F8F6F3';
const DARK   = '#1C1A18';
const STONE  = '#8B7355';
const DIM    = '#9A9087';
const FAINT  = '#C5BDB4';
const BORDER = '#EDE9E3';

// ---------------------------------------------------------------------------
// Static visuals
// ---------------------------------------------------------------------------

function VisualWelcome({ tagline }: { tagline: string }) {
  return (
    <View style={vis.welcomeWrap}>
      <View style={vis.logoOuter}><View style={vis.logoInner} /></View>
      <Text style={vis.welcomeSub}>{tagline}</Text>
    </View>
  );
}

const STEP_KEYS = [
  { n: '1', key: 'ob.feat1Title' },
  { n: '2', key: 'ob.feat2Title' },
  { n: '3', key: 'ob.feat3Title' },
];

function VisualSteps({ t }: { t: (k: string) => string }) {
  return (
    <View style={vis.stepsWrap}>
      {STEP_KEYS.map((step) => (
        <View key={step.n} style={vis.stepChip}>
          <View style={vis.stepBadge}><Text style={vis.stepNum}>{step.n}</Text></View>
          <Text style={vis.stepText}>{t(step.key)}</Text>
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Profile visual (stateful via props)
// ---------------------------------------------------------------------------

interface ProfileProps {
  age: string;      setAge:      (v: string) => void;
  gender: string;   setGender:   (v: string) => void;
  skinType: string; setSkinType: (v: string) => void;
}

const GENDERS = [
  { value: 'female', label: 'Женский' },
  { value: 'male',   label: 'Мужской' },
];
const SKIN_OPTIONS = [
  { value: 'light',  label: 'Светлая', sub: 'I–II' },
  { value: 'medium', label: 'Средняя', sub: 'III–IV' },
  { value: 'dark',   label: 'Тёмная',  sub: 'V–VI' },
];

function VisualProfile({ age, setAge, gender, setGender, skinType, setSkinType }: ProfileProps) {
  return (
    <View style={vis.profileWrap}>
      <View style={vis.profileField}>
        <Text style={vis.profileLbl}>AGE / ВОЗРАСТ</Text>
        <TextInput
          style={vis.profileInput}
          value={age}
          onChangeText={(t) => setAge(t.replace(/\D/g, '').slice(0, 3))}
          keyboardType="numeric"
          placeholder="Например: 34"
          placeholderTextColor={FAINT}
          returnKeyType="done"
          maxLength={3}
        />
      </View>
      <View style={vis.profileField}>
        <Text style={vis.profileLbl}>GENDER / ПОЛ</Text>
        <View style={vis.profileChips}>
          {GENDERS.map((g) => {
            const on = gender === g.value;
            return (
              <TouchableOpacity
                key={g.value} onPress={() => setGender(g.value)} activeOpacity={0.75}
                style={[vis.profileChip, on && vis.profileChipA]}
              >
                <Text style={on ? vis.pctA : vis.pct}>{g.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      <View style={vis.profileField}>
        <Text style={vis.profileLbl}>SKIN TYPE / ТИП КОЖИ</Text>
        <View style={vis.profileChips}>
          {SKIN_OPTIONS.map((sk) => {
            const on = skinType === sk.value;
            return (
              <TouchableOpacity
                key={sk.value} onPress={() => setSkinType(sk.value)} activeOpacity={0.75}
                style={[vis.profileChip, on && vis.profileChipA, { flex: 1 }]}
              >
                <Text style={on ? vis.pctA : vis.pct}>{sk.label}</Text>
                <Text style={[vis.pctSub, on && { color: FAINT }]}>{sk.sub}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

function VisualPrivacy({ subtitle }: { subtitle: string }) {
  return (
    <View style={vis.privacyWrap}>
      <View style={vis.lockCircle}><Text style={vis.lockIcon}>⊕</Text></View>
      <Text style={vis.privacySub}>{subtitle}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Slide data
// ---------------------------------------------------------------------------

interface Slide {
  id: string; sup: string; title: string; body: string | null;
  Visual: React.FC<any>; hasBody: boolean; visualProps?: any;
}

function buildSlides(t: (k: string) => string, locale: 'ru' | 'en'): Slide[] {
  return [
    {
      id: 'welcome',
      sup:   locale === 'en' ? 'WELCOME' : 'ДОБРО ПОЖАЛОВАТЬ',
      title: 'FreeSkin',
      body:  t('ob.welcomeSub'),
      Visual: VisualWelcome, hasBody: true,
      visualProps: { tagline: t('login.tagline') },
    },
    {
      id: 'how',
      sup:   locale === 'en' ? 'HOW IT WORKS' : 'КАК ЭТО РАБОТАЕТ',
      title: locale === 'en' ? 'Three simple steps' : 'Три простых шага',
      body: null, Visual: VisualSteps, hasBody: false,
      visualProps: { t },
    },
    {
      id: 'disclaimer',
      sup:   locale === 'en' ? 'IMPORTANT' : 'ВАЖНО',
      title: locale === 'en' ? 'Not a diagnosis' : 'Это не диагноз',
      body:  t('disclaimer'),
      Visual: VisualPrivacy, hasBody: true,
      visualProps: { subtitle: locale === 'en' ? 'Only on your device' : 'Только на вашем устройстве' },
    },
  ];
}

// ---------------------------------------------------------------------------
// Dots
// ---------------------------------------------------------------------------

function Dots({ current, total }: { current: number; total: number }) {
  return (
    <View style={dot.row} importantForAccessibility="no-hide-descendants">
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[dot.base, { width: i === current ? 20 : 7, backgroundColor: i === current ? DARK : FAINT }]}
        />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// SlideItem
// ---------------------------------------------------------------------------

function SlideItem({ slide }: { slide: Slide }) {
  const { Visual } = slide;
  return (
    <View style={[s.slide, { width: W }]}>
      <Visual {...(slide.visualProps ?? {})} />
      <View style={s.textBlock}>
        <Text style={s.sup}>{slide.sup}</Text>
        <Text style={s.title}>{slide.title}</Text>
        {slide.hasBody && slide.body ? <Text style={s.body}>{slide.body}</Text> : null}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function OnboardingScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { t, locale } = useLocale();
  const SLIDES = buildSlides(t, locale);
  const [idx, setIdx]           = useState(0);
  const [age, setAge]           = useState('');
  const [gender, setGender]     = useState('');
  const [skinType, setSkinType] = useState('');
  const listRef = useRef<FlatList>(null);

  const onViewRef  = useRef(({ viewableItems }: any) => {
    const i = viewableItems[0]?.index;
    if (i != null) setIdx(i);
  });
  const viewConfig = useRef({ viewAreaCoveragePercentThreshold: 50 });

  const finish = useCallback(() => {
    setSetting('onboarding_done', 'true');
    if (age)      setSetting('user_age',    age);
    if (gender)   setSetting('user_gender', gender);
    if (skinType) setSetting('user_skin',   skinType);
    router.replace('/(tabs)');
  }, [router, age, gender, skinType]);

  const next = useCallback(() => {
    if (idx < SLIDES.length - 1) {
      const n = idx + 1;
      listRef.current?.scrollToIndex({ index: n, animated: true });
      setIdx(n);
    } else {
      finish();
    }
  }, [idx, finish]);

  const isLast = idx === SLIDES.length - 1;

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.decoTR} pointerEvents="none" />
      <View style={s.decoBL} pointerEvents="none" />

      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <SlideItem slide={item} />
        )}
        horizontal pagingEnabled bounces={false}
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        onViewableItemsChanged={onViewRef.current}
        viewabilityConfig={viewConfig.current}
        style={s.list}
      />

      <View style={[s.bottom, { paddingBottom: insets.bottom + 20 }]}>
        <Dots current={idx} total={SLIDES.length} />
        <TouchableOpacity style={s.btn} onPress={next} activeOpacity={0.78}
          accessibilityLabel={isLast ? t('ob.start') : t('common.next')}>
          <Text style={s.btnText}>{isLast ? t('ob.start') : t('common.next')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.skip, isLast && s.skipHidden]} onPress={finish}
          activeOpacity={0.7} disabled={isLast} accessibilityLabel={t('ob.skip')}>
          <Text style={s.skipText}>{t('ob.skip')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const vis = StyleSheet.create({
  welcomeWrap:  { alignItems: 'center', marginBottom: 40 },
  logoOuter: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: DARK,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: DARK, shadowOpacity: 0.18, shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 }, elevation: 6,
  },
  logoInner:    { width: 44, height: 28, borderRadius: 14, backgroundColor: STONE, opacity: 0.9 },
  welcomeSub:   { marginTop: 18, fontSize: 13, color: STONE, letterSpacing: 1.8, fontWeight: '500' },

  stepsWrap:    { marginBottom: 8 },
  stepChip: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: BORDER,
    borderRadius: 12, paddingVertical: 14, paddingHorizontal: 18, marginBottom: 12,
  },
  stepBadge:    { width: 28, height: 28, borderRadius: 14, backgroundColor: DARK, alignItems: 'center', justifyContent: 'center' },
  stepNum:      { fontSize: 13, fontWeight: '700', color: BG },
  stepText:     { marginLeft: 14, fontSize: 15, color: DARK, fontWeight: '500' },

  abcdeRow:     { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  abcdeItem:    { flex: 1, alignItems: 'center', marginHorizontal: 4 },
  abcdeBox:     { width: 52, height: 52, borderRadius: 12, backgroundColor: BORDER, alignItems: 'center', justifyContent: 'center' },
  abcdeLetter:  { fontSize: 22, fontWeight: '800', color: DARK },
  abcdeLabel:   { marginTop: 8, fontSize: 11, color: STONE, fontWeight: '500', letterSpacing: 0.4, textAlign: 'center' },

  profileWrap:  { marginBottom: 8 },
  profileField: { marginBottom: 16 },
  profileLbl:   { fontSize: 9, color: FAINT, letterSpacing: 2.0, textTransform: 'uppercase', fontWeight: '600', marginBottom: 10 },
  profileInput: { fontSize: 16, fontWeight: '600', color: DARK, borderBottomWidth: 1.5, borderBottomColor: BORDER, paddingVertical: 8, paddingHorizontal: 2 },
  profileChips: { flexDirection: 'row', gap: 8 },
  profileChip:  { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: BORDER, backgroundColor: BG, gap: 2 },
  profileChipA: { backgroundColor: DARK, borderColor: DARK },
  pct:          { fontSize: 13, color: DIM, fontWeight: '600' },
  pctA:         { fontSize: 13, color: BG,  fontWeight: '700' },
  pctSub:       { fontSize: 10, color: FAINT },

  privacyWrap:  { alignItems: 'center', marginBottom: 40 },
  lockCircle:   { width: 80, height: 80, borderRadius: 40, backgroundColor: BORDER, alignItems: 'center', justifyContent: 'center' },
  lockIcon:     { fontSize: 36, color: DARK, fontWeight: '300' },
  privacySub:   { marginTop: 16, fontSize: 12, color: DIM, textAlign: 'center', letterSpacing: 0.4 },
});

const dot = StyleSheet.create({
  row:  { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', height: 20 },
  base: { height: 7, borderRadius: 4, marginHorizontal: 3 },
});

const s = StyleSheet.create({
  root:      { flex: 1, backgroundColor: BG },
  decoTR:    { position: 'absolute', top: -70, right: -70, width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(139,115,85,0.06)' },
  decoBL:    { position: 'absolute', bottom: 100, left: -60, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(200,185,165,0.08)' },
  list:      { flex: 1 },
  slide:     { flex: 1, paddingHorizontal: 32, paddingTop: 52, justifyContent: 'center' },
  textBlock: { marginTop: 8 },
  sup:       { fontSize: 9, color: STONE, letterSpacing: 2.2, textTransform: 'uppercase', fontWeight: '600', marginBottom: 12 },
  title:     { fontSize: 28, fontWeight: '800', color: DARK, letterSpacing: -0.8, lineHeight: 36, marginBottom: 14 },
  body:      { fontSize: 15, color: DIM, lineHeight: 24, fontWeight: '400' },
  bottom:    { paddingHorizontal: 32, paddingTop: 16, borderTopWidth: 1, borderTopColor: BORDER, backgroundColor: BG },
  btn:       { height: 54, backgroundColor: DARK, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginTop: 20 },
  btnText:   { fontSize: 16, fontWeight: '700', color: BG, letterSpacing: 0.3 },
  skip:      { height: 44, justifyContent: 'center', alignItems: 'center', marginTop: 8 },
  skipHidden:{ opacity: 0 },
  skipText:  { fontSize: 14, color: DIM, fontWeight: '400' },
});
