import React from 'react';
import { View, type ViewProps, type ViewStyle } from 'react-native';
import { Palette } from '../../constants/theme';

type HardCardProps = ViewProps & {
  /** Offset of the hard shadow in px (web: 5px 5px 0). */
  offset?: number;
  /** Fill color of the card. Defaults to paper. */
  bg?: string;
  /** Border/shadow color. Defaults to ink. */
  color?: string;
  /** Style applied to the bordered content box. */
  contentStyle?: ViewStyle;
};

/**
 * Brutalist offset-shadow box, matching the web `.hard` utility
 * (2px ink border + `5px 5px 0` solid shadow). Renders a solid offset
 * layer behind the content so the shadow is pixel-crisp on every platform
 * (native shadow APIs blur / don't offset consistently on Android).
 */
export function HardCard({
  offset = 5,
  bg = Palette.paper,
  color = Palette.ink,
  contentStyle,
  style,
  children,
  ...rest
}: HardCardProps) {
  return (
    <View
      style={[{ alignSelf: 'flex-start', marginRight: offset, marginBottom: offset }, style]}
      {...rest}
    >
      {/* solid offset shadow layer */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: offset,
          left: offset,
          right: -offset,
          bottom: -offset,
          backgroundColor: color,
        }}
      />
      {/* content */}
      <View style={[{ borderWidth: 2, borderColor: color, backgroundColor: bg }, contentStyle]}>
        {children}
      </View>
    </View>
  );
}
