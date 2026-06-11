import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { RISK_LEVELS, type RiskLevel } from '../constants/riskLevels';

interface RiskBadgeProps {
  risk:  RiskLevel;
  score: number;
  size?: 'sm' | 'lg';
}

export function RiskBadge({ risk, score, size = 'sm' }: RiskBadgeProps) {
  const cfg  = RISK_LEVELS[risk];
  const isLg = size === 'lg';

  return (
    <View
      style={[
        styles.container,
        {
          borderColor:       cfg.colorBorder,
          backgroundColor:   cfg.colorBg,
          paddingHorizontal: isLg ? 20 : 12,
          paddingVertical:   isLg ? 14 : 7,
          shadowColor:       cfg.color,
          shadowOpacity:     0.1,
          shadowRadius:      10,
          shadowOffset:      { width: 0, height: 3 },
        },
      ]}
    >
      <Text
        style={[
          styles.score,
          { color: cfg.color, fontSize: isLg ? 40 : 22, fontWeight: cfg.weight },
        ]}
      >
        {score}
      </Text>
      <Text style={[styles.label, { color: cfg.colorDim, fontSize: isLg ? 11 : 9 }]}>
        {cfg.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderWidth: 1, borderRadius: 16, alignItems: 'center' },
  score: { letterSpacing: -1 },
  label: { letterSpacing: 0.5, marginTop: 2, fontWeight: '600', textTransform: 'uppercase' },
});
