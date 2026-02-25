import type { ContextSignature, MealCandidate } from './types';

const EXPLANATION_TEMPLATES = [
  'Fits your night and keeps dinner simple.',
  'This is the easiest strong fit right now.',
  'Best match for your current dinner rhythm.',
  'Quick win with what usually works for you.',
] as const;

function stableHash(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function buildOneLineExplanation(candidate: MealCandidate, context: ContextSignature): string {
  const seed = `${candidate.mealId}|${context.weekday}|${context.hour_block}|${context.mode}`;
  const idx = stableHash(seed) % EXPLANATION_TEMPLATES.length;
  const line = EXPLANATION_TEMPLATES[idx];
  return line.slice(0, 140).replace(/[\r\n]+/g, ' ').trim();
}
