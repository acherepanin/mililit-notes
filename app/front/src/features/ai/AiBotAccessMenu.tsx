import { Check, ChevronDown, FileText, PenLine, Send, ShieldCheck } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Tooltip } from '../../components/Tooltip';
import { TooltipText } from '../../components/TooltipText';
import type { Translator } from '../../i18n';
import type { AiBotAccessMode, AiBotUserSettings } from '../../types';
import {
  defaultBotPermissions,
  parseLimit,
  type AiBotPermissionKey,
  type BotAccessMenuMode,
  type BotSettingsPatch,
} from './aiAssistant.helpers';

export interface BotAccessMenuOption {
  key: AiBotPermissionKey;
  label: string;
  tooltip: string;
  icon: ReactNode;
}

interface BotAccessMenuProps {
  bot: AiBotUserSettings;
  disabled: boolean;
  options: BotAccessMenuOption[];
  t: Translator;
  onChange: (patch: BotSettingsPatch) => void;
}

interface BotLimitInputProps {
  label: string;
  tooltip: string;
  icon: ReactNode;
  value: number | null;
  disabled: boolean;
  t: Translator;
  onCommit: (value: number | null) => void;
}

function BotLimitInput({ label, tooltip, icon, value, disabled, t, onCommit }: BotLimitInputProps) {
  const [draft, setDraft] = useState(value ? String(value) : '');

  useEffect(() => {
    setDraft(value ? String(value) : '');
  }, [value]);

  const commit = () => {
    const nextValue = parseLimit(draft);
    if (nextValue !== value) {
      onCommit(nextValue);
    }
  };

  return (
    <label className="ai-bot-limit-option">
      <Tooltip label={tooltip}>{icon}</Tooltip>
      <TooltipText value={label} className="ai-bot-limit-option__label" />
      <input
        autoComplete="off"
        disabled={disabled}
        inputMode="numeric"
        value={draft}
        placeholder={t('aiLimitEmpty')}
        aria-label={label}
        onBlur={commit}
        onChange={(event) => setDraft(event.target.value.replace(/\D/g, ''))}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

export function AiBotAccessMenu({ bot, disabled, options, t, onChange }: BotAccessMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [direction, setDirection] = useState<'up' | 'down'>('down');
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const activePermissionCount = options.filter(
    (option) => bot.permissions?.[option.key] ?? defaultBotPermissions[option.key],
  ).length;
  const activeCount =
    activePermissionCount + (bot.accessMode === 'write' ? 1 : 0) + (bot.allowSecrets ? 1 : 0);
  const modeOptions: Array<{
    value: AiBotAccessMode;
    label: string;
    tooltip: string;
    icon: ReactNode;
  }> = [
    {
      value: 'read',
      label: t('aiBotReadOnly'),
      tooltip: t('aiBotModeReadTooltip'),
      icon: <FileText size={12} />,
    },
    {
      value: 'write',
      label: t('aiBotReadWrite'),
      tooltip: t('aiBotModeWriteTooltip'),
      icon: <PenLine size={12} />,
    },
  ];
  const dataOptions = options.filter((option) =>
    ['readNotes', 'listAttachments'].includes(option.key),
  );
  const actionOptions = options.filter(
    (option) => !['readNotes', 'listAttachments'].includes(option.key),
  );

  const updateMenuPosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) {
      return;
    }

    const rect = button.getBoundingClientRect();
    const menuWidth = 252;
    const freeBelow = window.innerHeight - rect.bottom;
    const freeAbove = rect.top;
    const nextDirection = freeBelow >= 280 || freeBelow >= freeAbove ? 'down' : 'up';
    const maxHeight = Math.max(
      180,
      Math.min(360, (nextDirection === 'down' ? freeBelow : freeAbove) - 12),
    );

    setDirection(nextDirection);
    setMenuStyle({
      left: Math.min(Math.max(12, rect.right - menuWidth), window.innerWidth - menuWidth - 12),
      top: nextDirection === 'down' ? rect.bottom + 5 : undefined,
      bottom: nextDirection === 'up' ? window.innerHeight - rect.top + 5 : undefined,
      width: menuWidth,
      maxHeight,
    });
  }, []);

  useLayoutEffect(() => {
    if (isOpen) {
      updateMenuPosition();
    }
  }, [isOpen, updateMenuPosition]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const closeOnOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };

    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen, updateMenuPosition]);

  const renderMenuButton = (
    key: BotAccessMenuMode,
    isActive: boolean,
    label: string,
    tooltip: string,
    icon: ReactNode,
    onClick: () => void,
  ) => (
    <button
      className={`ai-bot-access-option ${isActive ? 'ai-bot-access-option--active' : ''}`}
      type="button"
      key={key}
      aria-pressed={isActive}
      aria-label={tooltip}
      onClick={onClick}
    >
      <Tooltip label={tooltip}>{icon}</Tooltip>
      <TooltipText value={label} className="ai-bot-access-option__label" />
      {isActive ? <Check size={12} /> : <span />}
    </button>
  );

  const renderPermission = (option: BotAccessMenuOption) => {
    const isActive = bot.permissions?.[option.key] ?? defaultBotPermissions[option.key];

    return renderMenuButton(option.key, isActive, option.label, option.tooltip, option.icon, () =>
      onChange({ permissions: { [option.key]: !isActive } }),
    );
  };

  return (
    <div className="ai-bot-access" ref={rootRef}>
      <button
        className="ai-bot-access__button"
        type="button"
        ref={buttonRef}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={() => setIsOpen((current) => !current)}
      >
        <ShieldCheck size={12} />
        <TooltipText
          value={`${t('aiBotAccessMenu')} · ${activeCount}`}
          className="ai-bot-access__value"
        />
        <ChevronDown size={13} className="ai-bot-access__chevron" />
      </button>

      {isOpen
        ? createPortal(
            <div
              className={`ai-bot-access-menu ai-bot-access-menu--${direction}`}
              id={menuId}
              role="menu"
              ref={menuRef}
              style={menuStyle}
            >
              <section className="ai-bot-access-menu__group">
                <span>{t('aiBotModeGroup')}</span>
                {modeOptions.map((option) =>
                  renderMenuButton(
                    option.value,
                    bot.accessMode === option.value,
                    option.label,
                    option.tooltip,
                    option.icon,
                    () => onChange({ accessMode: option.value }),
                  ),
                )}
              </section>

              <section className="ai-bot-access-menu__group">
                <span>{t('aiBotDataGroup')}</span>
                {dataOptions.map(renderPermission)}
                {renderMenuButton(
                  'secrets',
                  bot.allowSecrets,
                  t('aiBotPermissionSecrets'),
                  t('aiBotSecretsTooltip'),
                  <ShieldCheck size={12} />,
                  () => onChange({ allowSecrets: !bot.allowSecrets }),
                )}
              </section>

              <section className="ai-bot-access-menu__group">
                <span>{t('aiBotActionsGroup')}</span>
                {actionOptions.map(renderPermission)}
              </section>

              <section className="ai-bot-access-menu__group">
                <span>{t('aiBotLimitsGroup')}</span>
                <BotLimitInput
                  label={t('aiBotLimitTotal')}
                  tooltip={t('aiBotLimitTotalTooltip')}
                  icon={<Send size={12} />}
                  value={bot.dailyRequestLimit}
                  disabled={disabled}
                  t={t}
                  onCommit={(value) => onChange({ dailyRequestLimit: value })}
                />
                <BotLimitInput
                  label={t('aiBotLimitRead')}
                  tooltip={t('aiBotLimitReadTooltip')}
                  icon={<FileText size={12} />}
                  value={bot.dailyReadLimit}
                  disabled={disabled}
                  t={t}
                  onCommit={(value) => onChange({ dailyReadLimit: value })}
                />
                <BotLimitInput
                  label={t('aiBotLimitWrite')}
                  tooltip={t('aiBotLimitWriteTooltip')}
                  icon={<PenLine size={12} />}
                  value={bot.dailyWriteLimit}
                  disabled={disabled}
                  t={t}
                  onCommit={(value) => onChange({ dailyWriteLimit: value })}
                />
              </section>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
