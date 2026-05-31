import { getPlanCardColor, renderPlanCardArt, type PlanCardColorKey } from '../utils/planCardTheme';

interface PlanCardDecorProps {
  artKey: string | null | undefined;
  colorKey: string | null | undefined;
  className?: string;
}

export function PlanCardDecor({ artKey, colorKey, className = '' }: PlanCardDecorProps) {
  const color = getPlanCardColor(colorKey);
  const resolved = color.key as PlanCardColorKey;

  return (
    <svg
      className={`plan-card-decor plan-card-theme plan-card-theme--${resolved} ${className}`.trim()}
      viewBox="0 0 120 120"
      aria-hidden
      preserveAspectRatio="xMaxYMin meet"
    >
      {renderPlanCardArt(artKey)}
    </svg>
  );
}
