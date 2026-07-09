/**
 * Naskin design system — unified with the web (Naskin-web).
 * Swiss grid / brutalism: paper + ink + cobalt accent, semantic risk colors,
 * hard offset shadows, square corners, Unbounded / Inter Tight / JetBrains Mono.
 *
 * Mirrors web app/globals.css :root tokens and app/layout.tsx fonts.
 */

import { Platform } from 'react-native';

// ── Brand palette (1:1 with web --paper/--ink/--grey/--mist/--accent) ──
export const Palette = {
  paper:  '#F1EFEA',
  ink:    '#141412',
  grey:   '#6E6C66',
  mist:   '#DDDAD2',
  accent: '#2B3BEF',
  white:  '#FFFFFF',

  riskHigh:     '#E8003D',
  riskModerate: '#E06000',
  riskLow:      '#00904A',
} as const;

// ── Fonts (loaded via @expo-google-fonts in app/_layout.tsx) ──
// Family names match the keys passed to useFonts().
export const Font = {
  display:      'Unbounded_700Bold',    // brutal headlines
  displayMed:   'Unbounded_500Medium',
  body:         'InterTight_400Regular',
  bodyMed:      'InterTight_500Medium',
  bodySemiBold: 'InterTight_600SemiBold',
  mono:         'JetBrainsMono_500Medium', // labels / numbers
} as const;

// Brutalism = square corners everywhere.
export const Radius = { none: 0, sm: 0, md: 0, lg: 0 } as const;

export const Spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

/**
 * Hard offset shadow token (native shadow API). Crisp on iOS/web; on Android
 * it degrades to a soft elevation. For pixel-perfect offset boxes on all
 * platforms use the <HardCard> component (draws a solid offset layer).
 */
export function hardShadow(offset = 5) {
  return {
    shadowColor:   Palette.ink,
    shadowOffset:  { width: offset, height: offset },
    shadowOpacity: 1,
    shadowRadius:  0,
    elevation:     offset,
  } as const;
}

export const hardBorder = { borderWidth: 2, borderColor: Palette.ink } as const;

// ── Backward-compatible exports (existing consumers use Colors / Fonts) ──
// Web design is light-only (paper); dark mirrors it so the app stays on-brand.
const brand = {
  text:             Palette.ink,
  background:       Palette.paper,
  tint:             Palette.accent,
  icon:             Palette.grey,
  tabIconDefault:   Palette.grey,
  tabIconSelected:  Palette.accent,
};

export const Colors = {
  light: { ...brand },
  dark:  { ...brand },
};

export const Fonts = Platform.select({
  ios: {
    sans:    Font.body,
    serif:   Font.body,
    rounded: Font.body,
    mono:    Font.mono,
  },
  default: {
    sans:    Font.body,
    serif:   Font.body,
    rounded: Font.body,
    mono:    Font.mono,
  },
  web: {
    sans:    Font.body,
    serif:   Font.body,
    rounded: Font.body,
    mono:    Font.mono,
  },
});
