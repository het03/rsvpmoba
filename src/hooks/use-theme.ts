/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import useAppTheme from './useAppTheme';

export function useTheme() {
  const scheme = useColorScheme();
  const system = scheme === 'unspecified' ? 'light' : scheme;
  const { theme: appTheme } = useAppTheme();

  const final = appTheme ?? system;

  return Colors[final] ?? Colors.light;
}
