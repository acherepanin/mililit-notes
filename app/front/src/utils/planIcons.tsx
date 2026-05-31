import {
  Bot,
  Crown,
  Diamond,
  Flame,
  Folder,
  Gem,
  Gift,
  HardDrive,
  Heart,
  Leaf,
  NotebookText,
  Package,
  Rocket,
  Shield,
  Sparkles,
  Star,
  Sun,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';

export type PlanIconKey =
  | 'package'
  | 'sparkles'
  | 'notebook'
  | 'star'
  | 'crown'
  | 'rocket'
  | 'gem'
  | 'diamond'
  | 'zap'
  | 'bot'
  | 'folder'
  | 'shield'
  | 'heart'
  | 'sun'
  | 'leaf'
  | 'gift'
  | 'flame'
  | 'hard-drive';

export interface PlanIconOption {
  key: PlanIconKey;
  Icon: LucideIcon;
}

export const PLAN_ICON_OPTIONS: PlanIconOption[] = [
  { key: 'package', Icon: Package },
  { key: 'sparkles', Icon: Sparkles },
  { key: 'notebook', Icon: NotebookText },
  { key: 'star', Icon: Star },
  { key: 'crown', Icon: Crown },
  { key: 'rocket', Icon: Rocket },
  { key: 'gem', Icon: Gem },
  { key: 'diamond', Icon: Diamond },
  { key: 'zap', Icon: Zap },
  { key: 'bot', Icon: Bot },
  { key: 'folder', Icon: Folder },
  { key: 'shield', Icon: Shield },
  { key: 'heart', Icon: Heart },
  { key: 'sun', Icon: Sun },
  { key: 'leaf', Icon: Leaf },
  { key: 'gift', Icon: Gift },
  { key: 'flame', Icon: Flame },
  { key: 'hard-drive', Icon: HardDrive },
];

const iconMap = Object.fromEntries(PLAN_ICON_OPTIONS.map((item) => [item.key, item.Icon])) as Record<
  PlanIconKey,
  LucideIcon
>;

export function resolvePlanIcon(iconKey: string | null | undefined, size = 16): ReactNode {
  const Icon = iconMap[(iconKey as PlanIconKey) ?? 'package'] ?? Package;
  return <Icon size={size} aria-hidden />;
}

export function isPlanIconKey(value: string): value is PlanIconKey {
  return value in iconMap;
}
