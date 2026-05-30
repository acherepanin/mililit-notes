import type { SelectOption } from './components/CustomSelect';
import type { Translator } from './i18n';

export const USER_THEMES = ['dark', 'light', 'aurora', 'ember', 'ocean'] as const;

export type UserTheme = (typeof USER_THEMES)[number];

const THEME_LABEL_KEY: Record<UserTheme, 'dark' | 'light' | 'themeAurora' | 'themeEmber' | 'themeOcean'> =
  {
    dark: 'dark',
    light: 'light',
    aurora: 'themeAurora',
    ember: 'themeEmber',
    ocean: 'themeOcean',
  };

export function isUserTheme(value: string | null | undefined): value is UserTheme {
  return !!value && (USER_THEMES as readonly string[]).includes(value);
}

export function parseUserTheme(
  value: string | null | undefined,
  fallback: UserTheme = 'dark',
): UserTheme {
  return isUserTheme(value) ? value : fallback;
}

export function getNextTheme(current: UserTheme): UserTheme {
  const index = USER_THEMES.indexOf(current);
  const nextIndex = index < 0 ? 0 : (index + 1) % USER_THEMES.length;

  return USER_THEMES[nextIndex] ?? 'dark';
}

export function isLightTheme(theme: UserTheme): boolean {
  return theme === 'light';
}

export function getThemeLabel(t: Translator, theme: UserTheme): string {
  return t(THEME_LABEL_KEY[theme]);
}

export function createThemeOptions(t: Translator): Array<SelectOption<UserTheme>> {
  return USER_THEMES.map((value) => ({
    value,
    label: getThemeLabel(t, value),
  }));
}
