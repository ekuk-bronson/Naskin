import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ABCDE_LABELS, scoreColor } from '../constants/riskLevels';
import type { ABCDEScore } from '../services/storage';

const DARK  = '#1C1A18';
const DIM   = '#9A9087';
const FAINT = '#C5BDB4';

interface ABCDEData {
  asymmetry: ABCDEScore;
  border:    ABCDEScore;
  color:     ABCDEScore;
  diameter:  ABCDEScore;
  evolution: ABCDEScore;
}

const KEYS = ['asymmetry', 'border', 'color', 'diameter', 'evolution'] as const;

export function AbcdeCard({ abcde }: { abcde: ABCDEData }) {
  return (
    <>
      {KEYS.map((key) => {
        const val   = abcde[key];
        const color = scoreColor(val.s);
        return (
          <View key={key} style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.label}>{ABCDE_LABELS[key]}</Text>
              <Text style={[styles.score, { color }]}>{val.s}/10</Text>
            </View>
            <View style={styles.barBg}>
              <View
                style={[styles.barFill, {
                  width: `${val.s * 10}%` as any,
                  backgroundColor: color,
                }]}
              />
            </View>
            <Text style={styles.note}>{val.n}</Text>
          </View>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#EDE9E3',
    borderRadius: 18,
    padding: 14,
    paddingHorizontal: 16,
    marginBottom: 8,
    shadowColor: DARK,
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  label: { fontSize: 12, fontWeight: '700', color: DARK, letterSpacing: -0.2 },
  score: { fontSize: 13, fontWeight: '800' },
  barBg: {
    height: 4,
    backgroundColor: '#F0EDE8',
    borderRadius: 99,
    marginBottom: 8,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 99 },
  note: { fontSize: 11, color: DIM, lineHeight: 16 },
});
