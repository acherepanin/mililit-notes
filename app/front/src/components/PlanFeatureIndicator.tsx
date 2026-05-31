import { Check, X } from 'lucide-react';

import type { PlanFeatureTone } from '../utils/planFeatureLines';

export function PlanFeatureIndicator({ tone }: { tone: PlanFeatureTone }) {
  if (tone === 'available') {
    return <Check size={12} aria-hidden />;
  }
  return <X size={12} aria-hidden />;
}
