/**
 * Fast Food Design System Tokens
 * 
 * Follows the Design Constitution: calm, OS-like, minimal, elegant.
 * Blue/green accent palette for a clean, trustworthy feel.
 */

export const colors = {
  // Backgrounds
  background: '#FAFAFA',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  
  // Borders
  border: '#E5E5E5',
  borderSubtle: '#F0F0F0',
  
  // Text
  textPrimary: '#171717',
  textSecondary: '#525252',
  textMuted: '#A3A3A3',
  textInverse: '#FFFFFF',
  
  // Accent - Blue (primary actions)
  accentBlue: '#2563EB',
  accentBlueLight: '#DBEAFE',
  accentBlueDark: '#1D4ED8',
  
  // Accent - Green (success, confirmation)
  accentGreen: '#10B981',
  accentGreenLight: '#D1FAE5',
  accentGreenDark: '#059669',
  
  // Muted states
  muted: '#9CA3AF',
  mutedLight: '#F3F4F6',
  
  // Semantic
  error: '#DC2626',
  errorLight: '#FEE2E2',
  warning: '#F59E0B',
  warningLight: '#FEF3C7',
  
  // Allergy indicator — amber treatment (not clinical red)
  warningAmber: '#D97706',
  warningAmberBg: '#FEF3C7',
  
  // Glass overlay system
  // Tint values are for Level 0 (collapsed). GlassOverlay interpolates
  // to deeper tints at Level 1/2 for legibility.
  glass: 'rgba(25, 25, 25, 0.20)',
  glassFallback: 'rgba(15, 15, 15, 0.40)',
  glassDeep: 'rgba(25, 25, 25, 0.65)',
  glassFallbackDeep: 'rgba(15, 15, 15, 0.82)',
  glassBorder: 'rgba(255, 255, 255, 0.10)',
  glassHandle: 'rgba(255, 255, 255, 0.35)',
  glassText: 'rgba(255, 255, 255, 0.92)',
  glassTextMuted: 'rgba(255, 255, 255, 0.55)',
  // Tonight hybrid-glass accents (iOS-first with fallback tints)
  tonightHeroGlassTintIOS: 'rgba(248, 250, 252, 0.56)',
  tonightHeroGlassTintFallback: 'rgba(248, 250, 252, 0.92)',
  tonightCtaGlassTintIOS: 'rgba(243, 246, 252, 0.52)',
  tonightCtaGlassTintFallback: 'rgba(243, 246, 252, 0.90)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
} as const;

export const typography = {
  // Sizes
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 28,
  '4xl': 32,
  
  // Weights (for fontWeight)
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
} as const;

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
} as const;

// Minimum touch target per accessibility guidelines
export const MIN_TOUCH_TARGET = 48;

/**
 * Glass overlay constants.
 * Blur intensity is FIXED (never animated) for Android perf.
 */
export const glass = {
  /** BlurView intensity on iOS (fixed, not animated) */
  blurIntensity: 80,
  /** BlurView tint on iOS */
  blurTint: 'dark' as const,
  /** Handle bar dimensions */
  handleWidth: 36,
  handleHeight: 4,
  handleRadius: 2,
  /** Spring config for level snapping */
  springDamping: 20,
  springStiffness: 200,
  springMass: 0.5,
} as const;

/**
 * Idle affordance constants.
 */
export const idle = {
  /** Time before idle affordance triggers (ms) */
  thresholdMs: 7000,
  /** Horizontal card nudge distance (px) */
  nudgePx: 12,
  /** Vertical overlay lift distance (px) */
  liftPx: 40,
} as const;

export type Colors = typeof colors;
export type Spacing = typeof spacing;
export type Radii = typeof radii;
export type Typography = typeof typography;
export type Glass = typeof glass;
export type Idle = typeof idle;
