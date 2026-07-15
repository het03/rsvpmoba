export const Colors = {
  light: {
    // Existing
    text: '#111827',
    background: '#FAFAF9',
    backgroundElement: '#F3F4F6',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#6B7280',

    // Added from old theme
    card: '#F3F4F6',
    primary: '#4F8EF7',
    subtext: '#6B7280',
    border: '#D1D5DB',
  },

  dark: {
    // Existing
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',

    // Dark equivalents
    card: '#212225',
    primary: '#4F8EF7',
    subtext: '#B0B4BA',
    border: '#3A3A3A',
  },
  sepia: {
    text: '#2B2B20',
    background: '#F4ECD8',
    backgroundElement: '#F1E7CF',
    backgroundSelected: '#E6DDC1',
    textSecondary: '#6B5B3A',
    card: '#F4ECD8',
    primary: '#4F8EF7',
    subtext: '#6B5B3A',
    border: '#E2D6BD',
  },
} as const;

export const Fonts = {
  mono: 'monospace',
} as const;

export type ThemeColor = keyof typeof Colors['light'];

export const Spacing = {
  half: 6,
  one: 4,
  two: 8,
  three: 12,
  four: 16,
  five: 20,
  six: 24,
} as const;

export const MaxContentWidth = 900;

export const BottomTabInset = 64;