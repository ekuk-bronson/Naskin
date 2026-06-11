/**
 * Login screen — Google OAuth via expo-auth-session.
 *
 * Install before using:
 *   npx expo install expo-auth-session expo-crypto
 *
 * Then add .env at project root with your Google client IDs
 * (see services/auth.ts for the full setup guide).
 */
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect } from 'expo-router';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useAuth } from '../contexts/AuthContext';
import { GOOGLE_CLIENT_IDS } from '../services/auth';
import { useLocale } from '../services/i18n';
import { useTextScale } from '../services/textScale';

WebBrowser.maybeCompleteAuthSession();

const DARK  = '#1C1A18';
const STONE = '#8B7355';
const DIM   = '#9A9087';
const FAINT = '#C5BDB4';
const BG    = '#F8F6F3';

export default function LoginScreen() {
  const { user, signIn } = useAuth();
  const { t, locale }    = useLocale();
  const fontScale        = useTextScale();
  const [fetching, setFetching] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  // ── ALL hooks must be declared before any early return ────
  const [request, response, promptAsync] = Google.useAuthRequest(GOOGLE_CLIENT_IDS);

  const handleToken = async (token: string | null) => {
    if (!token) { setError(t('login.errProfile')); return; }
    setFetching(true);
    setError(null);

    // 10s timeout to avoid hanging on poor network
    const ctrl   = new AbortController();
    const timer  = setTimeout(() => ctrl.abort(), 10_000);

    try {
      const res  = await fetch('https://www.googleapis.com/userinfo/v2/me', {
        headers: { Authorization: `Bearer ${token}` },
        signal:  ctrl.signal,
      });
      if (!res.ok) { setError(t('login.errProfile')); return; }
      const data = await res.json();

      // Validate basic identity fields. Don't log the response (PII + token).
      const email = typeof data?.email === 'string' ? data.email : '';
      const id    = data?.id ?? data?.sub;
      if (!id || !email) { setError(t('login.errProfile')); return; }
      // Google returns verified_email for /userinfo/v2/me
      if (data?.verified_email === false) {
        setError(t('login.errProfile'));
        return;
      }

      signIn({
        id:    String(id),
        email,
        name:  typeof data?.name === 'string' ? data.name : email,
        avatarUrl: typeof data?.picture === 'string' ? data.picture : undefined,
      });
    } catch (e: any) {
      setError(e?.name === 'AbortError' ? t('login.errTimeout') : t('login.errProfile'));
    } finally {
      clearTimeout(timer);
      setFetching(false);
    }
  };

  useEffect(() => {
    if (response?.type === 'success') {
      handleToken(response.authentication?.accessToken ?? null);
    } else if (response?.type === 'error') {
      setError(t('login.errAuth'));
    }
  }, [response]);

  const busy = fetching;

  const handleGuest = () => {
    Alert.alert(
      t('login.guestTitle'),
      t('login.guestMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.continue'),
          onPress: () => signIn({
            id: 'guest',
            email: 'guest@freeskin.app',
            name: locale === 'en' ? 'Guest' : 'Гость',
            avatarUrl: undefined,
          }),
        },
      ],
    );
  };

  // ── Already logged in → skip to tabs (after all hooks) ────
  if (user) return <Redirect href="/(tabs)" />;

  return (
    <SafeAreaView style={styles.root}>
      {/* ── Marble decoration ─────────────────────────── */}
      <View style={styles.decoTop}    pointerEvents="none" />
      <View style={styles.decoBottom} pointerEvents="none" />

      {/* ── Branding ──────────────────────────────────── */}
      <View style={styles.brandBlock}>
        <View style={styles.logoMark}>
          <View style={styles.logoOuter}>
            <View style={styles.logoInner} />
          </View>
        </View>
        <Text style={[styles.appName, { fontSize: Math.round(32 * fontScale) }]}>FreeSkin</Text>
        <Text style={[styles.tagline, { fontSize: Math.round(10 * fontScale) }]}>{t('login.tagline')}</Text>
      </View>

      {/* ── Hero text ─────────────────────────────────── */}
      <View style={styles.heroBlock}>
        <Text style={[styles.heroTitle, { fontSize: Math.round(26 * fontScale) }]}>{t('login.heroTitle')}</Text>
        <Text style={[styles.heroSub, { fontSize: Math.round(12 * fontScale) }]}>{t('login.heroSub')}</Text>
      </View>

      {/* ── Sign-in area ──────────────────────────────── */}
      <View style={styles.signInBlock}>
        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.googleBtn, (busy || !request) && styles.googleBtnDisabled]}
          onPress={() => {
            setError(null);
            promptAsync();
          }}
          disabled={busy || !request}
          activeOpacity={0.78}
        >
          {busy ? (
            <ActivityIndicator color={DARK} />
          ) : (
            <>
              {/* Google "G" — approximated with colored text */}
              <View style={styles.googleIcon}>
                <Text style={styles.googleIconText}>G</Text>
              </View>
              <Text style={[styles.googleBtnText, { fontSize: Math.round(14 * fontScale) }]}>{t('login.signInGoogle')}</Text>
            </>
          )}
        </TouchableOpacity>

        {!request && !busy && (
          <Text style={styles.configNote}>{t('login.configNote')}</Text>
        )}

        {/* Guest mode — bypasses OAuth for testing */}
        <TouchableOpacity
          style={styles.guestBtn}
          onPress={handleGuest}
          activeOpacity={0.7}
          disabled={busy}
        >
          <Text style={[styles.guestBtnText, { fontSize: Math.round(13 * fontScale) }]}>{t('login.guest')}</Text>
        </TouchableOpacity>

        <Text style={[styles.disclaimer, { fontSize: Math.round(10 * fontScale) }]}>{t('disclaimer')}</Text>
      </View>

      {/* ── Version ───────────────────────────────────── */}
      <Text style={styles.version}>FreeSkin v0.1.0</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:              { flex: 1, backgroundColor: BG, paddingHorizontal: 28, justifyContent: 'space-between' },
  decoTop:           { position: 'absolute', top: -80, right: -80, width: 260, height: 260, borderRadius: 130, backgroundColor: 'rgba(139,115,85,0.07)' },
  decoBottom:        { position: 'absolute', bottom: -60, left: -60, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(200,185,165,0.1)' },
  brandBlock:        { alignItems: 'center', paddingTop: 48 },
  logoMark:          { marginBottom: 16, alignItems: 'center', justifyContent: 'center' },
  logoOuter:         { width: 72, height: 72, borderRadius: 36, backgroundColor: DARK, alignItems: 'center', justifyContent: 'center', shadowColor: DARK, shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  logoInner:         { width: 32, height: 29, borderRadius: 99, backgroundColor: '#7A5035', opacity: 0.9 },
  appName:           { fontSize: 32, fontWeight: '800', color: DARK, letterSpacing: -1, marginBottom: 4 },
  tagline:           { fontSize: 10, color: STONE, letterSpacing: 2.2, textTransform: 'uppercase', fontWeight: '600' },
  heroBlock:         { alignItems: 'center', paddingHorizontal: 8 },
  heroTitle:         { fontSize: 26, fontWeight: '800', color: DARK, letterSpacing: -0.8, textAlign: 'center', lineHeight: 34, marginBottom: 12 },
  heroSub:           { fontSize: 12, color: FAINT, textAlign: 'center', lineHeight: 18 },
  signInBlock:       { paddingBottom: 8 },
  errorBanner:       { backgroundColor: '#FFF0F3', borderWidth: 1, borderColor: '#FFD0D8', borderRadius: 12, padding: 10, marginBottom: 10 },
  errorText:         { fontSize: 12, color: '#E8003D', textAlign: 'center', fontWeight: '500' },
  googleBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#EDE9E3', borderRadius: 20, paddingVertical: 16, marginBottom: 14, shadowColor: DARK, shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  googleBtnDisabled: { opacity: 0.55 },
  googleIcon:        { width: 24, height: 24, borderRadius: 12, backgroundColor: '#4285F4', alignItems: 'center', justifyContent: 'center' },
  googleIconText:    { fontSize: 13, fontWeight: '800', color: '#fff', letterSpacing: -0.2 },
  googleBtnText:     { fontSize: 14, fontWeight: '700', color: DARK, letterSpacing: 0.3 },
  configNote:        { fontSize: 10, color: STONE, textAlign: 'center', lineHeight: 16, marginBottom: 14 },
  guestBtn:          { alignItems: 'center', paddingVertical: 12, marginBottom: 10 },
  guestBtnText:      { fontSize: 13, color: STONE, fontWeight: '600', textDecorationLine: 'underline' },
  disclaimer:        { fontSize: 10, color: FAINT, textAlign: 'center', lineHeight: 16 },
  version:           { fontSize: 9, color: FAINT, textAlign: 'center', letterSpacing: 0.8, paddingBottom: 6 },
});
