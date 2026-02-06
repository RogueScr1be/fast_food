/**
 * RescueCard — DRM (Dinner Rescue Mode) Card
 *
 * Thin wrapper around DecisionCard with variant="rescue".
 * Preserves the `meal` prop API so existing deal.tsx imports are unaffected.
 *
 * Visual differences (handled by DecisionCard variant):
 *   - Warm amber scrim instead of cool black
 *   - Amber accept CTA instead of green
 *   - "Rescue" badge top-left
 */

import React from 'react';
import type { DrmSeed } from '../lib/seeds/types';
import { DecisionCard, PassDirection } from './DecisionCard';

export type { PassDirection } from './DecisionCard';

export interface RescueCardProps {
  meal: DrmSeed;
  whyText: string;
  expanded: boolean;
  onToggleExpand: () => void;
  onAccept: () => void;
  onPass: (direction: PassDirection) => void;
}

export function RescueCard({ meal, ...rest }: RescueCardProps) {
  return <DecisionCard recipe={meal} variant="rescue" {...rest} />;
}

export default RescueCard;
