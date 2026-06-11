import React from 'react';
import { View, StyleSheet } from 'react-native';

interface GridProps {
  opacity?: number;
  color?: string;
}

/** Subtle blueprint grid decoration — decorative only, pointerEvents none */
export function Grid({ opacity = 0.035, color = '#0044FF' }: GridProps) {
  const lineColor = color + Math.round(opacity * 255).toString(16).padStart(2, '0');
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: 14 }).map((_, i) => (
        <View
          key={`h${i}`}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: i * 52,
            height: 0.5,
            backgroundColor: lineColor,
          }}
        />
      ))}
      {Array.from({ length: 10 }).map((_, i) => (
        <View
          key={`v${i}`}
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: i * 44,
            width: 0.5,
            backgroundColor: lineColor,
          }}
        />
      ))}
    </View>
  );
}
