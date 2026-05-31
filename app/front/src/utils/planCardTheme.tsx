import type { ReactNode } from 'react';

export type PlanCardColorKey = 'sky' | 'mint' | 'sun' | 'rose' | 'lilac' | 'coral' | 'slate';
export type PlanCardArtKey = 'bubbles' | 'rings' | 'stars' | 'blocks' | 'petals';

export interface PlanCardColorOption {
  key: PlanCardColorKey;
  labelRu: string;
  labelEn: string;
}

export const PLAN_CARD_COLORS: PlanCardColorOption[] = [
  { key: 'sky', labelRu: 'Небо', labelEn: 'Sky' },
  { key: 'mint', labelRu: 'Мята', labelEn: 'Mint' },
  { key: 'sun', labelRu: 'Солнце', labelEn: 'Sun' },
  { key: 'rose', labelRu: 'Роза', labelEn: 'Rose' },
  { key: 'lilac', labelRu: 'Сирень', labelEn: 'Lilac' },
  { key: 'coral', labelRu: 'Коралл', labelEn: 'Coral' },
  { key: 'slate', labelRu: 'Графит', labelEn: 'Slate' },
];

export const PLAN_CARD_ARTS: Array<{ key: PlanCardArtKey; labelRu: string; labelEn: string }> = [
  { key: 'bubbles', labelRu: 'Пузыри', labelEn: 'Bubbles' },
  { key: 'rings', labelRu: 'Кольца', labelEn: 'Rings' },
  { key: 'stars', labelRu: 'Звёзды', labelEn: 'Stars' },
  { key: 'blocks', labelRu: 'Блоки', labelEn: 'Blocks' },
  { key: 'petals', labelRu: 'Лепестки', labelEn: 'Petals' },
];

const colorMap = Object.fromEntries(PLAN_CARD_COLORS.map((item) => [item.key, item])) as Record<
  PlanCardColorKey,
  PlanCardColorOption
>;

export function isPlanCardColorKey(value: string): value is PlanCardColorKey {
  return value in colorMap;
}

export function isPlanCardArtKey(value: string): value is PlanCardArtKey {
  return PLAN_CARD_ARTS.some((item) => item.key === value);
}

export function getPlanCardColor(key: string | null | undefined): PlanCardColorOption {
  if (key && isPlanCardColorKey(key)) {
    return colorMap[key];
  }
  return colorMap.sky;
}

export function getPlanCardArt(key: string | null | undefined): PlanCardArtKey {
  if (key && isPlanCardArtKey(key)) {
    return key;
  }
  return 'bubbles';
}

export function renderPlanCardArt(artKey: string | null | undefined): ReactNode {
  const art = getPlanCardArt(artKey);
  switch (art) {
    case 'rings':
      return (
        <>
          <circle cx="92" cy="28" r="24" fill="none" stroke="currentColor" strokeWidth="8" opacity="0.55" />
          <circle cx="92" cy="28" r="12" fill="none" stroke="currentColor" strokeWidth="6" opacity="0.75" />
          <circle cx="108" cy="52" r="8" fill="currentColor" opacity="0.35" />
        </>
      );
    case 'stars':
      return (
        <>
          <path d="M96 18 L98 24 L104 24 L99 28 L101 34 L96 30 L91 34 L93 28 L88 24 L94 24 Z" fill="currentColor" opacity="0.7" />
          <path d="M112 44 L113 47 L116 47 L114 49 L115 52 L112 50 L109 52 L110 49 L108 47 L111 47 Z" fill="currentColor" opacity="0.55" />
          <circle cx="78" cy="36" r="5" fill="currentColor" opacity="0.35" />
        </>
      );
    case 'blocks':
      return (
        <>
          <rect x="78" y="16" width="22" height="22" rx="6" fill="currentColor" opacity="0.45" transform="rotate(12 89 27)" />
          <rect x="98" y="34" width="16" height="16" rx="5" fill="currentColor" opacity="0.65" transform="rotate(-8 106 42)" />
          <rect x="72" y="42" width="12" height="12" rx="4" fill="currentColor" opacity="0.35" />
        </>
      );
    case 'petals':
      return (
        <>
          <ellipse cx="92" cy="24" rx="14" ry="8" fill="currentColor" opacity="0.5" transform="rotate(25 92 24)" />
          <ellipse cx="104" cy="38" rx="10" ry="6" fill="currentColor" opacity="0.42" transform="rotate(-18 104 38)" />
          <ellipse cx="82" cy="40" rx="8" ry="5" fill="currentColor" opacity="0.38" transform="rotate(40 82 40)" />
        </>
      );
    case 'bubbles':
    default:
      return (
        <>
          <circle cx="96" cy="26" r="18" fill="currentColor" opacity="0.42" />
          <circle cx="112" cy="48" r="10" fill="currentColor" opacity="0.55" />
          <circle cx="82" cy="42" r="7" fill="currentColor" opacity="0.32" />
        </>
      );
  }
}
