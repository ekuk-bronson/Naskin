import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Font } from '../constants/theme';
import { scoreColor } from '../constants/riskLevels';
import { useLocale } from '../services/i18n';
import type { ABCDEScore } from '../services/storage';

const DARK  = '#141412';
const DIM   = '#6E6C66';
const FAINT = '#C5BDB4';

interface ABCDEData {
  asymmetry: ABCDEScore;
  border:    ABCDEScore;
  color:     ABCDEScore;
  diameter:  ABCDEScore;
  evolution: ABCDEScore;
}

const KEYS = ['asymmetry', 'border', 'color', 'diameter', 'evolution'] as const;

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/** One animated ABCDE row: staggered fade-up + bar fill + count-up number. */
function AbcdeRow({
  label, score, note, color, index,
}: { label: string; score: number; note: string; color: string; index: number }) {
  const delay = index * 90;
  // score < 0 is the "no data yet" sentinel (e.g. Evolution before a rescan).
  const noData = score < 0;
  const target = noData ? 0 : score;

  // Bar fill on the UI thread (smooth), mirrors the web `.animate-progress`.
  const w = useSharedValue(0);
  useEffect(() => {
    w.value = withDelay(delay + 120, withTiming(target * 10, {
      duration: 650, easing: Easing.out(Easing.cubic),
    }));
  }, [target]);
  const barStyle = useAnimatedStyle(() => ({ width: `${w.value}%` }));

  // Count-up of the numeric score.
  const [disp, setDisp] = useState(0);
  useEffect(() => {
    if (noData) return;
    let raf = 0;
    const start = Date.now();
    const tick = () => {
      const t = (Date.now() - start - delay - 120) / 650;
      if (t <= 0) { raf = requestAnimationFrame(tick); return; }
      setDisp(t >= 1 ? target : target * easeOutCubic(t));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  return (
    <Animated.View
      entering={FadeInDown.delay(delay).duration(420).springify().damping(18)}
      style={styles.card}
    >
      <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.score, { color: noData ? FAINT : color }]}>
          {noData ? '—' : `${disp.toFixed(1)}/10`}
        </Text>
      </View>
      <View style={styles.barBg}>
        <Animated.View style={[styles.barFill, barStyle, { backgroundColor: color }]} />
      </View>
      <Text style={styles.note}>{note}</Text>
    </Animated.View>
  );
}

export function AbcdeCard({ abcde }: { abcde: ABCDEData }) {
  const { t } = useLocale();
  return (
    <>
      {KEYS.map((key, i) => {
        const val = abcde[key];
        return (
          <AbcdeRow
            key={key}
            index={i}
            label={t(`abcde.lbl.${key}`)}
            score={val.s}
            // Notes are stored as i18n keys; legacy rows hold plain text,
            // which t() returns unchanged.
            note={t(val.n)}
            color={scoreColor(Math.max(0, val.s))}
          />
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
    borderRadius: 0,
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
  label: { fontSize: 12, fontFamily: Font.bodySemiBold, color: DARK, letterSpacing: -0.2 },
  score: { fontSize: 13, fontFamily: Font.display },
  // Brutalist square progress bar (was rounded).
  barBg: {
    height: 5,
    backgroundColor: '#F0EDE8',
    borderRadius: 0,
    marginBottom: 8,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 0 },
  note: { fontSize: 11, color: DIM, lineHeight: 16 },
});
