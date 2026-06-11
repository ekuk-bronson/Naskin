import { Redirect, Tabs } from 'expo-router';
import { Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { getSetting } from '../../services/storage';
import { useLocale } from '../../services/i18n';

const DARK  = '#1C1A18';
const FAINT = '#C5BDB4';

function TabIcon({ symbol, focused }: { symbol: string; focused: boolean }) {
  return (
    <Text style={{ fontSize: 18, color: focused ? DARK : FAINT }}>
      {symbol}
    </Text>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { user, loading } = useAuth();
  const { t } = useLocale();

  // Block access until auth state is resolved
  if (loading) return null;

  // Not signed in → redirect to login
  if (!user) return <Redirect href="/login" />;

  // First launch → show onboarding (tables already exist from module-level initDb)
  if (getSetting('onboarding_done') !== 'true') return <Redirect href="/onboarding" />;

  const tabBarHeight = 52 + insets.bottom;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: 'rgba(252,251,249,0.97)',
          borderTopColor: '#EDE9E3',
          borderTopWidth: 1,
          height: tabBarHeight,
          paddingBottom: insets.bottom,
        },
        tabBarActiveTintColor: DARK,
        tabBarInactiveTintColor: FAINT,
        tabBarLabelStyle: {
          fontSize: 9,
          letterSpacing: 0.8,
          fontWeight: '500',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tab.home'),
          tabBarIcon: ({ focused }) => <TabIcon symbol="⌂" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: t('tab.history'),
          tabBarIcon: ({ focused }) => <TabIcon symbol="◷" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tab.profile'),
          tabBarIcon: ({ focused }) => <TabIcon symbol="◈" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: t('tab.settings'),
          tabBarIcon: ({ focused }) => <TabIcon symbol="⚙" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
