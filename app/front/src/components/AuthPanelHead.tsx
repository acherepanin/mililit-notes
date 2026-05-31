import { Languages, Palette } from 'lucide-react';
import type { ReactNode } from 'react';

import type { Translator } from '../i18n';
import { getNextTheme, getThemeLabel } from '../themes';
import type { UserLanguage, UserTheme } from '../types';
import { IconButton } from './IconButton';

interface AuthPanelHeadProps {
  title: string;
  language: UserLanguage;
  theme: UserTheme;
  t: Translator;
  onLanguageChange: (language: UserLanguage) => void;
  onThemeChange: (theme: UserTheme) => void;
  actions?: ReactNode;
}

export function AuthPanelHead({
  title,
  language,
  theme,
  t,
  onLanguageChange,
  onThemeChange,
  actions,
}: AuthPanelHeadProps) {
  return (
    <div className="auth-panel__head">
      <h1>{title}</h1>
      <div className="auth-panel__toolbar">
        <IconButton
          label={`${t('language')}: ${language === 'ru' ? 'RU' : 'EN'}`}
          icon={<Languages size={18} aria-hidden />}
          onClick={() => onLanguageChange(language === 'ru' ? 'en' : 'ru')}
        />
        <IconButton
          label={`${t('theme')}: ${getThemeLabel(t, theme)}`}
          icon={<Palette size={18} aria-hidden />}
          onClick={() => onThemeChange(getNextTheme(theme))}
        />
        {actions}
      </div>
    </div>
  );
}
