import type { ReactNode } from 'react';

import { PlanCardDecor } from './PlanCardDecor';
import { Tooltip } from './Tooltip';
import { PLAN_CARD_ARTS, PLAN_CARD_COLORS, type PlanCardArtKey, type PlanCardColorKey } from '../utils/planCardTheme';
import { resolvePlanIcon } from '../utils/planIcons';

interface PlanCardStickerProps {
  artKey: string | null | undefined;
  colorKey: string | null | undefined;
  iconKey: string | null | undefined;
}

export function PlanCardSticker({ artKey, colorKey, iconKey }: PlanCardStickerProps) {
  return (
    <div className="plan-card-sticker">
      {resolvePlanIcon(iconKey, 20)}
      <PlanCardDecor artKey={artKey} colorKey={colorKey} className="plan-card-sticker__art" />
    </div>
  );
}

interface PlanCardShellProps {
  artKey: string | null | undefined;
  children: ReactNode;
  className?: string;
  colorKey: string | null | undefined;
}

export function PlanCardShell({ artKey, children, className = '', colorKey }: PlanCardShellProps) {
  const resolved = ((colorKey as PlanCardColorKey) ?? 'sky') as PlanCardColorKey;

  return (
    <div
      className={`plan-card-shell plan-card-theme plan-card-theme--${resolved} ${className}`.trim()}
    >
      <PlanCardDecor artKey={artKey} colorKey={resolved} className="plan-card-shell__art" />
      <div className="plan-card-shell__body">{children}</div>
    </div>
  );
}

interface PlanCardColorPickerProps {
  label: string;
  language: 'ru' | 'en';
  value: PlanCardColorKey;
  onChange: (value: PlanCardColorKey) => void;
}

export function PlanCardColorPicker({ label, language, value, onChange }: PlanCardColorPickerProps) {
  return (
    <div className="plan-card-picker">
      <Tooltip label={label}>
        <span className="plan-card-picker__label">{label}</span>
      </Tooltip>
      <div
        className="plan-card-picker__colors"
        role="listbox"
        aria-label={label}
        style={{ ['--plan-picker-count' as string]: PLAN_CARD_COLORS.length }}
      >
        {PLAN_CARD_COLORS.map((option) => (
          <Tooltip
            key={option.key}
            label={language === 'ru' ? option.labelRu : option.labelEn}
          >
            <button
              className={`plan-card-picker__color plan-card-theme plan-card-theme--${option.key} ${
                value === option.key ? 'plan-card-picker__color--active' : ''
              }`.trim()}
              type="button"
              role="option"
              aria-selected={value === option.key}
              aria-label={language === 'ru' ? option.labelRu : option.labelEn}
              onClick={() => onChange(option.key)}
            />
          </Tooltip>
        ))}
      </div>
    </div>
  );
}

interface PlanCardArtPickerProps {
  artKey: PlanCardArtKey;
  colorKey: PlanCardColorKey;
  label: string;
  language: 'ru' | 'en';
  onChange: (value: PlanCardArtKey) => void;
}

export function PlanCardArtPicker({
  artKey,
  colorKey,
  label,
  language,
  onChange,
}: PlanCardArtPickerProps) {
  return (
    <div className="plan-card-picker">
      <Tooltip label={label}>
        <span className="plan-card-picker__label">{label}</span>
      </Tooltip>
      <div
        className="plan-card-picker__arts"
        role="listbox"
        aria-label={label}
        style={{ ['--plan-picker-count' as string]: PLAN_CARD_ARTS.length }}
      >
        {PLAN_CARD_ARTS.map((option) => (
          <Tooltip
            key={option.key}
            label={language === 'ru' ? option.labelRu : option.labelEn}
          >
            <button
              className={`plan-card-picker__art ${
                artKey === option.key ? 'plan-card-picker__art--active' : ''
              }`.trim()}
              type="button"
              role="option"
              aria-selected={artKey === option.key}
              aria-label={language === 'ru' ? option.labelRu : option.labelEn}
              onClick={() => onChange(option.key)}
            >
              <PlanCardDecor
                artKey={option.key}
                colorKey={colorKey}
                className="plan-card-picker__art-decor"
              />
            </button>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}
