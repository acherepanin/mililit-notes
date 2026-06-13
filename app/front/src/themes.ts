import type { SelectOption } from './components/CustomSelect';
import type { Translator } from './i18n';

export const USER_THEMES = ['dark', 'light', 'system'] as const;

export type UserTheme = (typeof USER_THEMES)[number];

export type AppliedTheme = 'dark' | 'light';

const THEME_LABEL_KEY: Record<UserTheme, 'dark' | 'light' | 'themeSystem'> = {
  dark: 'dark',
  light: 'light',
  system: 'themeSystem',
};

const darkSchemeQuery =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

let selectedTheme: UserTheme = 'dark';

export function resolveAppliedTheme(theme: UserTheme): AppliedTheme {
  if (theme === 'system') {
    return darkSchemeQuery && !darkSchemeQuery.matches ? 'light' : 'dark';
  }

  return theme === 'light' ? 'light' : 'dark';
}

export function applyTheme(theme: UserTheme): void {
  selectedTheme = theme;
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = resolveAppliedTheme(theme);
  }
}

if (darkSchemeQuery) {
  const handleSchemeChange = () => {
    if (selectedTheme === 'system' && typeof document !== 'undefined') {
      document.documentElement.dataset.theme = resolveAppliedTheme('system');
    }
  };

  if (typeof darkSchemeQuery.addEventListener === 'function') {
    darkSchemeQuery.addEventListener('change', handleSchemeChange);
  } else if (typeof darkSchemeQuery.addListener === 'function') {
    darkSchemeQuery.addListener(handleSchemeChange);
  }
}

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
  return resolveAppliedTheme(theme) === 'light';
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
