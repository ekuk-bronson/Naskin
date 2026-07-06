import { StyleSheet, Text, type TextProps } from 'react-native';

import { useThemeColor } from '@/hooks/use-theme-color';
import { Font, Palette } from '@/constants/theme';

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: 'default' | 'title' | 'defaultSemiBold' | 'subtitle' | 'link' | 'label';
};

export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = 'default',
  ...rest
}: ThemedTextProps) {
  const color = useThemeColor({ light: lightColor, dark: darkColor }, 'text');

  return (
    <Text
      style={[
        { color },
        type === 'default' ? styles.default : undefined,
        type === 'defaultSemiBold' ? styles.defaultSemiBold : undefined,
        type === 'title' ? styles.title : undefined,
        type === 'subtitle' ? styles.subtitle : undefined,
        type === 'label' ? styles.label : undefined,
        type === 'link' ? styles.link : undefined,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  default: {
    fontFamily: Font.body,
    fontSize: 16,
    lineHeight: 24,
  },
  defaultSemiBold: {
    fontFamily: Font.bodySemiBold,
    fontSize: 16,
    lineHeight: 24,
  },
  title: {
    // Unbounded — brutal display headline
    fontFamily: Font.display,
    fontSize: 32,
    lineHeight: 36,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontFamily: Font.displayMed,
    fontSize: 20,
    lineHeight: 26,
  },
  label: {
    // JetBrains Mono — uppercase technical label
    fontFamily: Font.mono,
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  link: {
    fontFamily: Font.bodyMed,
    fontSize: 16,
    lineHeight: 30,
    color: Palette.accent,
  },
});
