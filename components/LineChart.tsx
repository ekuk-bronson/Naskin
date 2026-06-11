import React from 'react';
import { Text, View } from 'react-native';
import { useWindowDimensions } from 'react-native';
import type { MoleHistoryPoint } from '../services/storage';
import { scoreColor } from '../constants/riskLevels';

const STONE = '#8B7355';
const FAINT = '#C5BDB4';

interface Props {
  history: MoleHistoryPoint[];
  /** Extra horizontal space taken by the parent card (padding × 2 + screen padding) */
  outerPadding?: number;
}

export function LineChart({ history, outerPadding = 72 }: Props) {
  const { width } = useWindowDimensions();
  const H     = 130;
  const PAD_H = 10;
  const PAD_V = 18;
  const plotW = width - outerPadding - PAD_H * 2;
  const plotH = H - PAD_V * 2;
  const n     = history.length;

  if (n === 0) return null;

  const pts = history.map((h, i) => ({
    x: PAD_H + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW),
    y: PAD_V + plotH - (Math.max(0, Math.min(10, h.s)) / 10) * plotH,
    s: h.s, m: h.m,
  }));

  const segments = pts.slice(0, -1).map((p1, i) => {
    const p2 = pts[i + 1]!;
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    return {
      cx: (p1.x + p2.x) / 2, cy: (p1.y + p2.y) / 2,
      len: Math.sqrt(dx * dx + dy * dy),
      angle: Math.atan2(dy, dx) * (180 / Math.PI),
    };
  });

  const last      = pts[pts.length - 1]!;
  const lastColor = scoreColor(last.s);

  return (
    <View style={{ height: H + 20 }}>
      {/* Risk zone guides */}
      {[3, 6].map((v) => (
        <View key={v} style={{
          position: 'absolute', left: PAD_H,
          top: PAD_V + plotH - (v / 10) * plotH,
          width: plotW, height: 1, backgroundColor: '#EDE9E3',
        }} />
      ))}

      {/* Line segments */}
      {segments.map((seg, i) => (
        <View key={i} style={{
          position: 'absolute',
          left: seg.cx - seg.len / 2, top: seg.cy - 1.5,
          width: seg.len, height: 3,
          backgroundColor: STONE, borderRadius: 2,
          transform: [{ rotate: `${seg.angle}deg` }],
        }} />
      ))}

      {/* Dots */}
      {pts.map((pt, i) => {
        const isLast = i === n - 1;
        const col    = scoreColor(pt.s);
        return (
          <View key={i} style={{
            position: 'absolute',
            left: pt.x - (isLast ? 7 : 4), top: pt.y - (isLast ? 7 : 4),
            width: isLast ? 14 : 8, height: isLast ? 14 : 8,
            borderRadius: 99,
            backgroundColor: isLast ? col : '#fff',
            borderWidth: isLast ? 0 : 2, borderColor: STONE,
            shadowColor: isLast ? col : 'transparent',
            shadowOpacity: 0.35, shadowRadius: 6, elevation: isLast ? 3 : 0,
          }} />
        );
      })}

      {/* Score label above last dot */}
      <Text style={{
        position: 'absolute', left: last.x - 16, top: last.y - 24,
        width: 32, textAlign: 'center',
        fontSize: 12, fontWeight: '800', color: lastColor, letterSpacing: -0.3,
      }}>{last.s}</Text>

      {/* Month axis */}
      <View style={{
        position: 'absolute', bottom: 0, left: PAD_H - 8, right: PAD_H - 8,
        flexDirection: 'row', justifyContent: n === 1 ? 'center' : 'space-between',
      }}>
        {pts.map((pt, i) => (
          <Text key={i} style={{
            fontSize: 9, letterSpacing: 0.3,
            color: i === n - 1 ? STONE : FAINT,
            fontWeight: i === n - 1 ? '700' : '500',
          }}>{pt.m}</Text>
        ))}
      </View>
    </View>
  );
}
