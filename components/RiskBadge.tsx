import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { RISK_LEVELS, type RiskLevel } from '../constants/riskLevels';
import { Palette, Font, hardShadow } from '../constants/theme';

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
        hardShadow(isLg ? 4 : 3),
        {
          backgroundColor:   cfg.colorBg,
          paddingHorizontal: isLg ? 20 : 12,
          paddingVertical:   isLg ? 14 : 8,
        },
      ]}
    >
      <Text
        style={[
          styles.score,
          { color: cfg.color, fontSize: isLg ? 40 : 22 },
        ]}
      >
        {score}
      </Text>
      <Text style={[styles.label, { fontSize: isLg ? 11 : 9 }]}>
        {cfg.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Brutalist: square corners, 2px ink border, hard offset shadow.
  container: {
    borderWidth: 2,
    borderColor: Palette.ink,
    borderRadius: 0,
    alignItems: 'center',
  },
  score: {
    fontFamily: Font.display,
    letterSpacing: -1,
  },
  label: {
    fontFamily: Font.mono,
    color: Palette.ink,
    letterSpacing: 0.5,
    marginTop: 3,
    textTransform: 'uppercase',
  },
});
