import React, { useCallback, useState } from 'react';
import {
  View, Text, Image, ScrollView, Switch, Modal, TextInput,
  TouchableOpacity, StyleSheet, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { getAllMoles, getSetting, setSetting, type Mole } from '../../services/storage';
import { exportToPdf } from '../../services/pdfExport';
import { requestPermissions, scheduleReminder, cancelReminder, getNextReminderDate } from '../../services/notifications';
import { RISK_LEVELS } from '../../constants/riskLevels';
import { useAuth } from '../../contexts/AuthContext';
import { useLocale } from '../../services/i18n';
import { useTextScale } from '../../services/textScale';

const BG = '#F8F6F3', DARK = '#1C1A18', STONE = '#8B7355', DIM = '#9A9087', FAINT = '#C5BDB4', BORDER = '#EDE9E3';

const INTERVAL_DAYS = [7, 14, 30] as const;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const GENDER_KEYS = [
  { v: 'male',   k: 'profile.male' },
  { v: 'female', k: 'profile.female' },
] as const;
const SKIN_KEYS = [
  { v: 'light',  k: 'profile.skinLight' },
  { v: 'medium', k: 'profile.skinMedium' },
  { v: 'dark',   k: 'profile.skinDark' },
] as const;

function ProfileEditModal({
  visible, age, gender, skin, onCancel, onSave, t,
}: {
  visible: boolean;
  age: string; gender: string; skin: string;
  onCancel: () => void;
  onSave: (a: string, g: string, sk: string) => void;
  t: (key: string) => string;
}) {
  const [a, setA] = useState(age);
  const [g, setG] = useState(gender);
  const [sk, setSk] = useState(skin);

  React.useEffect(() => {
    if (visible) { setA(age); setG(gender); setSk(skin); }
  }, [visible, age, gender, skin]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={s.modalBackdrop}>
        <View style={s.modalCard}>
          <Text style={s.modalTitle}>{t('profile.modalTitle')}</Text>
          <Text style={s.modalSub}>{t('profile.modalSub')}</Text>

          <Text style={s.formLbl}>{t('profile.lblAge')}</Text>
          <TextInput
            style={s.formInput}
            value={a}
            onChangeText={(text) => setA(text.replace(/\D/g, '').slice(0, 3))}
            placeholder="35"
            placeholderTextColor={FAINT}
            keyboardType="number-pad"
            returnKeyType="done"
            maxLength={3}
          />

          <Text style={[s.formLbl, { marginTop: 14 }]}>{t('profile.lblGender')}</Text>
          <View style={s.chipRow}>
            {GENDER_KEYS.map((opt) => {
              const on = g === opt.v;
              return (
                <TouchableOpacity key={opt.v} onPress={() => setG(opt.v)} activeOpacity={0.72}
                  style={[s.formChip, on && s.formChipOn]}>
                  <Text style={[s.formChipTxt, on && s.formChipTxtOn]}>{t(opt.k)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[s.formLbl, { marginTop: 14 }]}>{t('profile.lblSkin')}</Text>
          <View style={s.chipRow}>
            {SKIN_KEYS.map((opt) => {
              const on = sk === opt.v;
              return (
                <TouchableOpacity key={opt.v} onPress={() => setSk(opt.v)} activeOpacity={0.72}
                  style={[s.formChip, on && s.formChipOn]}>
                  <Text style={[s.formChipTxt, on && s.formChipTxtOn]}>{t(opt.k)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={s.modalActions}>
            <TouchableOpacity style={s.modalCancel} onPress={onCancel} activeOpacity={0.72}>
              <Text style={s.modalCancelTxt}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.modalSave} onPress={() => onSave(a, g, sk)} activeOpacity={0.78}>
              <Text style={s.modalSaveTxt}>{t('common.save')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function NotifCard({
  enabled, interval, nextDate,
  onToggle, onInterval, t, locale,
}: {
  enabled: boolean; interval: number; nextDate: Date | null;
  onToggle: (v: boolean) => void; onInterval: (d: number) => void;
  t: (key: string) => string;
  locale: 'ru' | 'en';
}) {
  const nextLabel = nextDate
    ? nextDate.toLocaleString(locale === 'en' ? 'en' : 'ru', { day: 'numeric', month: 'long' })
    : null;
  const intervalLabel = (days: number) =>
    locale === 'en' ? `${days} days` : `${days} ${days === 1 ? 'день' : days < 5 ? 'дня' : 'дней'}`;
  return (
    <View style={s.card}>
      <Text style={s.cardSup}>{t('profile.reminders')}</Text>
      <View style={s.notifRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.notifLabel}>{t('profile.notifMain')}</Text>
          <Text style={s.notifSub}>{t('profile.remindersDesc')}</Text>
        </View>
        <Switch value={enabled} onValueChange={onToggle} trackColor={{ false: FAINT, true: STONE }} thumbColor="#fff" />
      </View>
      {enabled && (
        <>
          <Text style={s.intervalLbl}>{t('profile.reminderInt')}</Text>
          <View style={s.intervalRow}>
            {INTERVAL_DAYS.map((days) => {
              const on = interval === days;
              return (
                <TouchableOpacity key={days} onPress={() => onInterval(days)} activeOpacity={0.75}
                  style={[s.chip, on && s.chipActive]}>
                  <Text style={[s.chipText, on && s.chipTextActive]}>{intervalLabel(days)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {nextLabel && (
            <Text style={s.nextReminder}>{t('profile.nextReminder')} {nextLabel}</Text>
          )}
        </>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function ProfileScreen() {
  const { t, locale } = useLocale();
  const fontScale     = useTextScale();
  const [moles, setMoles]               = useState<Mole[]>([]);
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [interval, setInterval]         = useState(30);
  const [nextReminder, setNextReminder] = useState<Date | null>(null);
  const [exporting, setExporting]       = useState(false);
  const [editProfile, setEditProfile]   = useState(false);
  const [age, setAge]                   = useState('');
  const [gender, setGender]             = useState('');
  const [skin, setSkin]                 = useState('');
  const { user, signOut } = useAuth();

  useFocusEffect(useCallback(() => {
    setMoles(getAllMoles());
    const en  = getSetting('notif_enabled');
    const inv = getSetting('notif_interval');
    const enabled = en !== 'false';
    setNotifEnabled(enabled);
    setInterval(inv ? parseInt(inv, 10) : 30);
    setAge(getSetting('user_age')    ?? '');
    setGender(getSetting('user_gender') ?? '');
    setSkin(getSetting('user_skin')   ?? '');
    if (enabled) getNextReminderDate().then(setNextReminder);
    else setNextReminder(null);
  }, []));

  const handleToggle = async (v: boolean) => {
    setSetting('notif_enabled', v ? 'true' : 'false');
    setNotifEnabled(v);
    if (v) {
      const granted = await requestPermissions();
      if (!granted) {
        Alert.alert(
          locale === 'en' ? 'Permission denied' : 'Нет разрешения',
          locale === 'en' ? 'Allow notifications in device settings.' : 'Разрешите уведомления в настройках устройства.',
          [{ text: t('common.ok') }],
        );
        setSetting('notif_enabled', 'false'); setNotifEnabled(false); setNextReminder(null); return;
      }
      await scheduleReminder(interval);
      getNextReminderDate().then(setNextReminder);
    } else { await cancelReminder(); setNextReminder(null); }
  };

  const handleInterval = async (days: number) => {
    setSetting('notif_interval', String(days)); setInterval(days);
    if (notifEnabled) { await scheduleReminder(days); getNextReminderDate().then(setNextReminder); }
  };

  const handleSignOut = () =>
    Alert.alert(t('profile.signOutTitle'), t('profile.signOutMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('profile.signOut'), style: 'destructive', onPress: signOut },
    ]);

  // High bucket = high + urgent, low bucket = low + notable
  const high     = moles.filter((m) => m.risk === 'high' || m.risk === 'urgent');
  const moderate = moles.filter((m) => m.risk === 'moderate');
  const low      = moles.filter((m) => m.risk === 'low' || m.risk === 'notable');

  const skinLabel   = skin === 'light' ? t('profile.skinLight').split(' ')[0]
                     : skin === 'medium' ? t('profile.skinMedium').split(' ')[0]
                     : skin === 'dark' ? t('profile.skinDark').split(' ')[0]
                     : '';
  const genderLabel = gender === 'female' ? t('profile.female')
                     : gender === 'male' ? t('profile.male')
                     : '';

  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}>
        <Text style={[s.sup, { fontSize: Math.round(9 * fontScale) }]}>{locale === 'en' ? 'MEDICAL REPORT' : 'МЕДИЦИНСКИЙ ОТЧЁТ'}</Text>
        <Text style={[s.title, { fontSize: Math.round(26 * fontScale) }]}>{t('profile.title')}</Text>
        <Text style={[s.subtitle, { fontSize: Math.round(11 * fontScale) }]}>{new Date().toLocaleString(locale === 'en' ? 'en' : 'ru', { month: 'long', year: 'numeric' })}</Text>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* User card */}
        {user && (
          <View style={s.userCard}>
            {user.avatarUrl
              ? <Image source={{ uri: user.avatarUrl }} style={s.avatar} />
              : <View style={s.avatarFb}><Text style={s.avatarInit}>{user.name.charAt(0).toUpperCase()}</Text></View>
            }
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.userName} numberOfLines={1}>{user.name}</Text>
              <Text style={s.userEmail} numberOfLines={1}>{user.email}</Text>
              {(age || gender || skin) ? (
                <TouchableOpacity onPress={() => setEditProfile(true)} activeOpacity={0.7}>
                  <View style={s.tagRow}>
                    {age          ? <View style={s.tag}><Text style={s.tagTxt}>{age} {locale === 'en' ? 'y.o.' : 'лет'}</Text></View> : null}
                    {genderLabel  ? <View style={s.tag}><Text style={s.tagTxt}>{genderLabel}</Text></View> : null}
                    {skinLabel    ? <View style={s.tag}><Text style={s.tagTxt}>{skinLabel}</Text></View>   : null}
                    <View style={[s.tag, s.tagEdit]}><Text style={s.tagEditTxt}>{t('profile.editProfile')}</Text></View>
                  </View>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={() => setEditProfile(true)} activeOpacity={0.7} style={s.fillProfileBtn}>
                  <Text style={s.fillProfileTxt}>{t('profile.fillProfile')}</Text>
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity style={s.signOut} onPress={handleSignOut} activeOpacity={0.72}>
              <Text style={s.signOutTxt}>{t('profile.signOut')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Report card */}
        <View style={s.reportCard}>
          <View style={s.reportHead}>
            <View>
              <Text style={s.reportName}>FreeSkin</Text>
              <Text style={s.reportSub}>{t('login.tagline').toUpperCase()}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={s.reportDate}>{new Date().toLocaleString('ru', { day: 'numeric', month: 'long' })}</Text>
              <Text style={s.reportYear}>{new Date().getFullYear()}</Text>
            </View>
          </View>

          <View style={s.statsRow}>
            {([
              [t('profile.statTotal'), String(moles.length),    DARK],
              [t('profile.statMod'),   String(moderate.length), moderate.length > 0 ? '#E06000' : FAINT],
              [t('profile.statHigh'),  String(high.length),     high.length > 0     ? '#E8003D' : FAINT],
            ] as const).map(([lbl, val, color]) => (
              <View key={lbl} style={s.statCell}>
                <Text style={[s.statVal, { color }]} adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1}>{val}</Text>
                <Text style={s.statLbl}>{lbl}</Text>
              </View>
            ))}
          </View>

          <View style={s.divider} />
          {moles.length === 0 && <Text style={s.emptyNote}>{t('profile.noData')}</Text>}
          {moles.map((m) => {
            const cfg = RISK_LEVELS[m.risk];
            return (
              <View key={m.id} style={s.reportRow}>
                <View style={s.reportLeft}>
                  <View style={[s.dot, { backgroundColor: cfg.color }]} />
                  <View>
                    <Text style={s.reportMole}>{m.name}</Text>
                    <Text style={s.reportLoc}>{m.loc} · {m.size}</Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[s.reportLevel, { color: cfg.color, fontWeight: cfg.weight }]} numberOfLines={1}>{t(`risk.${m.risk}`)}</Text>
                  <Text style={s.reportRisk}>{t(`risk.${m.risk}.rec`)}</Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* High-risk alert */}
        {high.length > 0 && (
          <View style={s.alertCard}>
            <Text style={s.alertTitle}>{t('profile.alertHigh')}</Text>
            {high.map((m) => (
              <View key={m.id} style={s.alertRow}>
                <View style={s.alertDot} />
                <View style={{ flex: 1 }}>
                  <Text style={s.alertMole}>{m.name}</Text>
                  <Text style={s.alertRec}>{t(`risk.${m.risk}.rec`)}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Risk breakdown */}
        {moles.length > 0 && (
          <View style={s.card}>
            <Text style={s.cardSup}>{t('profile.distribution')}</Text>
            {([
              [t('risk.low'),      low.length,      RISK_LEVELS.low.color],
              [t('risk.moderate'), moderate.length, RISK_LEVELS.moderate.color],
              [t('risk.high'),     high.length,     RISK_LEVELS.high.color],
            ] as const).map(([lbl, count, color]) => (
              <View key={lbl} style={s.bkRow}>
                <View style={[s.dot, { backgroundColor: color }]} />
                <Text style={s.bkLbl}>{lbl}</Text>
                <View style={s.bkBg}>
                  <View style={[s.bkFill, { width: `${(count / moles.length) * 100}%` as any, backgroundColor: color }]} />
                </View>
                <Text style={[s.bkCount, { color }]}>{count}</Text>
              </View>
            ))}
          </View>
        )}

        <NotifCard enabled={notifEnabled} interval={interval} nextDate={nextReminder} onToggle={handleToggle} onInterval={handleInterval} t={t} locale={locale} />

        {/* Export */}
        <TouchableOpacity
          style={[s.exportBtn, exporting && { opacity: 0.55 }]}
          activeOpacity={0.78}
          disabled={exporting}
          onPress={async () => {
            if (moles.length === 0) {
              Alert.alert('Нет данных', 'Добавьте хотя бы одну родинку для отчёта.', [{ text: 'Понятно' }]);
              return;
            }
            setExporting(true);
            try {
              const res = await exportToPdf(moles, user?.name ?? 'Пользователь');
              if (res === 'not_installed')
                Alert.alert('Требуется установка', 'Выполните:\n\nnpx expo install expo-print expo-sharing', [{ text: 'Понятно' }]);
              else if (res === 'error')
                Alert.alert('Ошибка', 'Не удалось создать PDF.', [{ text: 'Понятно' }]);
            } finally {
              setExporting(false);
            }
          }}>
          <Text style={[s.exportTxt, { fontSize: Math.round(14 * fontScale) }]}>{exporting ? t('profile.exporting') : t('profile.export')}</Text>
        </TouchableOpacity>

        {/* Обязательный медицинский дисклеймер */}
        <Text style={[s.disclaimer, { fontSize: Math.round(11 * fontScale) }]}>{t('disclaimer')}</Text>

        <Text style={s.version}>{t('profile.versionLine')}</Text>
      </ScrollView>

      <ProfileEditModal
        visible={editProfile}
        age={age}
        gender={gender}
        skin={skin}
        t={t}
        onCancel={() => setEditProfile(false)}
        onSave={(a, g, sk) => {
          setSetting('user_age',    a);
          setSetting('user_gender', g);
          setSetting('user_skin',   sk);
          setAge(a); setGender(g); setSkin(sk);
          setEditProfile(false);
        }}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: BG },
  scroll:  { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 },

  header: { paddingHorizontal: 24, paddingTop: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: BORDER },
  sup:    { fontSize: 9, color: STONE, letterSpacing: 2.2, textTransform: 'uppercase', fontWeight: '600', marginBottom: 4 },
  title:  { fontSize: 26, fontWeight: '800', color: DARK, letterSpacing: -0.8, marginBottom: 2 },
  subtitle: { fontSize: 11, color: FAINT },

  userCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderWidth: 1, borderColor: BORDER, borderRadius: 20,
    padding: 14, marginBottom: 12,
    shadowColor: DARK, shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  avatar:    { width: 46, height: 46, borderRadius: 23, flexShrink: 0, backgroundColor: BORDER },
  avatarFb:  { width: 46, height: 46, borderRadius: 23, backgroundColor: DARK, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarInit:{ fontSize: 20, fontWeight: '800', color: '#F0EDE8' },
  userName:  { fontSize: 13, fontWeight: '700', color: DARK, letterSpacing: -0.2, marginBottom: 2 },
  userEmail: { fontSize: 11, color: FAINT },
  tagRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 7 },
  tag:       { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, borderWidth: 1, borderColor: BORDER, backgroundColor: BG },
  tagTxt:    { fontSize: 10, color: DIM, fontWeight: '500' },
  tagEdit:    { borderColor: STONE, backgroundColor: '#FFF8F0' },
  tagEditTxt: { fontSize: 10, color: STONE, fontWeight: '600' },
  fillProfileBtn: { marginTop: 7, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 99, borderWidth: 1, borderColor: STONE, backgroundColor: '#FFF8F0', alignSelf: 'flex-start' },
  fillProfileTxt: { fontSize: 11, color: STONE, fontWeight: '600', letterSpacing: 0.2 },
  signOut:   { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99, borderWidth: 1, borderColor: BORDER, backgroundColor: BG, flexShrink: 0 },
  signOutTxt:{ fontSize: 11, color: DIM, fontWeight: '600' },

  reportCard: {
    borderWidth: 1, borderColor: BORDER, borderRadius: 24, padding: 20, marginBottom: 12, backgroundColor: '#fff',
    shadowColor: DARK, shadowOpacity: 0.04, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  reportHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#F5F2EE' },
  reportName: { fontSize: 18, fontWeight: '800', color: DARK, letterSpacing: -0.6 },
  reportSub:  { fontSize: 9, color: STONE, letterSpacing: 2.0, textTransform: 'uppercase', marginTop: 3, fontWeight: '600' },
  reportDate: { fontSize: 12, color: DARK, fontWeight: '600', textAlign: 'right' },
  reportYear: { fontSize: 10, color: FAINT, marginTop: 1 },

  statsRow:  { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 18 },
  statCell:  { alignItems: 'center' },
  statVal:   { fontSize: 26, fontWeight: '800', letterSpacing: -0.8 },
  statLbl:   { fontSize: 9, color: FAINT, marginTop: 4, letterSpacing: 0.8, textTransform: 'uppercase' },
  divider:   { height: 1, backgroundColor: '#F5F2EE', marginBottom: 14 },
  emptyNote: { fontSize: 12, color: FAINT, textAlign: 'center', paddingVertical: 12 },
  reportRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#F5F2EE' },
  reportLeft:{ flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot:       { width: 7, height: 7, borderRadius: 4 },
  reportMole:{ fontSize: 12, color: DARK, fontWeight: '600', letterSpacing: -0.1 },
  reportLoc: { fontSize: 10, color: FAINT, marginTop: 1 },
  reportLevel:{ fontSize: 13, letterSpacing: -0.2, marginBottom: 2 },
  reportRisk: { fontSize: 9, color: FAINT, marginTop: 0, maxWidth: 160, textAlign: 'right' },

  alertCard: {
    borderWidth: 1, borderColor: '#F0D8DC', backgroundColor: '#FFF5F7', borderRadius: 20, padding: 16, marginBottom: 12,
    shadowColor: '#E8003D', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  alertTitle:{ fontSize: 12, fontWeight: '700', color: '#E8003D', marginBottom: 12 },
  alertRow:  { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 10 },
  alertDot:  { width: 6, height: 6, borderRadius: 3, backgroundColor: '#E8003D', marginTop: 3, flexShrink: 0 },
  alertMole: { fontSize: 12, color: DARK, fontWeight: '600', marginBottom: 2 },
  alertRec:  { fontSize: 11, color: DIM, lineHeight: 16 },

  card: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: BORDER, borderRadius: 20, padding: 16, marginBottom: 12,
    shadowColor: DARK, shadowOpacity: 0.03, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  cardSup:   { fontSize: 9, color: FAINT, letterSpacing: 2, textTransform: 'uppercase', fontWeight: '600', marginBottom: 14 },
  bkRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  bkLbl:     { fontSize: 11, color: DIM, width: 56, fontWeight: '500' },
  bkBg:      { flex: 1, height: 4, backgroundColor: '#F5F2EE', borderRadius: 99, overflow: 'hidden' },
  bkFill:    { height: '100%', borderRadius: 99 },
  bkCount:   { fontSize: 12, fontWeight: '700', width: 20, textAlign: 'right' },

  notifRow:    { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  notifLabel:  { fontSize: 13, color: DARK, fontWeight: '600', letterSpacing: -0.1 },
  notifSub:    { fontSize: 11, color: FAINT, marginTop: 2 },
  intervalLbl: { fontSize: 10, color: DIM, fontWeight: '600', letterSpacing: 0.4, marginTop: 14, marginBottom: 8 },
  intervalRow: { flexDirection: 'row', gap: 8 },
  chip:        { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 99, borderWidth: 1, borderColor: BORDER, backgroundColor: BG },
  chipActive:  { backgroundColor: DARK, borderColor: DARK },
  chipText:    { fontSize: 12, color: DIM, fontWeight: '600' },
  chipTextActive: { color: '#F0EDE8' },
  nextReminder:  { fontSize: 10, color: STONE, fontWeight: '500', marginTop: 10, letterSpacing: 0.2 },

  exportBtn: {
    paddingVertical: 16, borderRadius: 20, backgroundColor: DARK, alignItems: 'center', marginBottom: 20,
    shadowColor: DARK, shadowOpacity: 0.2, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 5,
  },
  exportTxt: { fontSize: 14, fontWeight: '700', color: '#F0EDE8', letterSpacing: 0.3 },
  disclaimer:{ fontSize: 11, color: DIM, textAlign: 'center', lineHeight: 16, marginBottom: 14, paddingHorizontal: 14, fontWeight: '500' },
  version:   { fontSize: 9, color: FAINT, textAlign: 'center', letterSpacing: 0.8 },

  // Profile-edit modal
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(28,26,24,0.45)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  modalCard:     { width: '100%', maxWidth: 420, backgroundColor: '#fff', borderRadius: 22, padding: 20, shadowColor: DARK, shadowOpacity: 0.18, shadowRadius: 22, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  modalTitle:    { fontSize: 17, fontWeight: '800', color: DARK, letterSpacing: -0.4 },
  modalSub:      { fontSize: 11, color: DIM, marginTop: 4, marginBottom: 18 },
  formLbl:       { fontSize: 9, color: FAINT, letterSpacing: 2, textTransform: 'uppercase', fontWeight: '600', marginBottom: 8 },
  formInput:     { fontSize: 14, color: DARK, fontWeight: '600', borderBottomWidth: 1, borderBottomColor: BORDER, paddingVertical: 8 },
  chipRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  formChip:      { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 99, borderWidth: 1, borderColor: BORDER, backgroundColor: BG },
  formChipOn:    { borderColor: DARK, backgroundColor: DARK },
  formChipTxt:   { fontSize: 11, color: DIM, fontWeight: '500' },
  formChipTxtOn: { color: '#F0EDE8', fontWeight: '600' },
  modalActions:  { flexDirection: 'row', gap: 10, marginTop: 20 },
  modalCancel:   { flex: 1, paddingVertical: 13, borderRadius: 14, borderWidth: 1, borderColor: BORDER, backgroundColor: '#fff', alignItems: 'center' },
  modalCancelTxt:{ fontSize: 13, fontWeight: '600', color: DIM },
  modalSave:     { flex: 1, paddingVertical: 13, borderRadius: 14, backgroundColor: DARK, alignItems: 'center' },
  modalSaveTxt:  { fontSize: 13, fontWeight: '700', color: '#F0EDE8' },
});
