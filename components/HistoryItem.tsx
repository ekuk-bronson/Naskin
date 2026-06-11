import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { RISK_LEVELS, scoreColor } from '../constants/riskLevels';
import type { Mole } from '../services/storage';
import { useLocale } from '../services/i18n';

const DARK  = '#1C1A18';
const DIM   = '#9A9087';
const FAINT = '#C5BDB4';
const BAR_MAX = 36;

interface HistoryItemProps {
  mole: Mole;
  onPress: () => void;
}

export function HistoryItem({ mole, onPress }: HistoryItemProps) {
  const cfg = RISK_LEVELS[mole.risk];
  const { t } = useLocale();

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.72}
      style={styles.container}
    >
      <View style={styles.header}>
        {/* Avatar: real photo or placeholder */}
        {mole.imageUri ? (
          <Image source={{ uri: mole.imageUri }} style={styles.avatarPhoto} />
        ) : (
          <View style={[styles.avatar, { backgroundColor: cfg.colorBg, borderColor: cfg.colorBorder }]}>
            <View style={styles.avatarDot} />
          </View>
        )}

        <View style={styles.meta}>
          <Text style={styles.name} numberOfLines={1}>{mole.name}</Text>
          <Text style={styles.loc}>{mole.loc} · {mole.size}</Text>
        </View>

        <View style={{ alignItems: 'flex-end' }}>
          <View style={[styles.riskPill, { backgroundColor: cfg.colorBg, borderColor: cfg.colorBorder }]}>
            <View style={[styles.riskDot, { backgroundColor: cfg.color }]} />
            <Text style={[styles.riskPillText, { color: cfg.color }]} numberOfLines={1}>{t(`risk.${mole.risk}`)}</Text>
          </View>
        </View>
      </View>

      {/* Mini bar chart */}
      <View style={styles.chart}>
        {mole.history.map((h, i) => {
          const barH  = Math.max(3, (h.s / 10) * BAR_MAX);
          const color = scoreColor(h.s);
          const isLast = i === mole.history.length - 1;
          return (
            <View key={i} style={styles.barCol}>
              <View
                style={[styles.bar, {
                  height: barH,
                  backgroundColor: isLast ? color : color + '40',
                }]}
              />
              <Text style={styles.month}>{h.m}</Text>
            </View>
          );
        })}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#EDE9E3',
    borderRadius: 22,
    padding: 16,
    paddingHorizontal: 16,
    marginBottom: 10,
    shadowColor: DARK,
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  avatarPhoto: {
    width: 48,
    height: 48,
    borderRadius: 14,
    flexShrink: 0,
    backgroundColor: '#EDE9E3',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    overflow: 'hidden',
  },
  avatarDot: { width: 22, height: 20, borderRadius: 99, backgroundColor: '#7A5035' },
  meta: { flex: 1, minWidth: 0 },
  name: { fontSize: 13, fontWeight: '700', color: DARK, letterSpacing: -0.2, marginBottom: 3 },
  loc:  { fontSize: 10, color: FAINT },
  riskPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 99,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  riskDot:      { width: 7, height: 7, borderRadius: 4 },
  riskPillText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: BAR_MAX + 14,
    gap: 5,
  },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  bar: { width: '100%', borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  month: { fontSize: 8, color: FAINT, fontWeight: '500' },
});
