import { useMemo } from 'react';
import { getPackById, getPrimaryAudioTrackForPack } from '../seeds/packs';
import { recipes } from '../seeds/recipes';
import { selectDeterministicItem } from '../utils/deterministic-selector';
import { getTodaySeedKey } from '../utils/date-key';

export interface PackRecommendationResult {
  packId: string;
  packName: string;
  recipeId: string;
  recipeName: string;
  audioTrackId: string | null;
}

/**
 * Deterministically select one recipe from a pack based on userId + date
 * Same userId + date = ALWAYS same recipe from that pack
 */
export function usePackRecommendation(
  packId: string,
  userId: string
): PackRecommendationResult | null {
  return useMemo(() => {
    const pack = getPackById(packId);
    if (!pack) return null;

    // Get eligible recipes from pack
    const packRecipes = pack.recipeIds
      .map(rid => recipes.find(r => r.id === rid))
      .filter(Boolean);

    if (packRecipes.length === 0) return null;

    // Deterministic selection: userId + date seed
    const seedKey = getTodaySeedKey(userId);
    const selectedRecipe = selectDeterministicItem(packRecipes, seedKey);

    if (!selectedRecipe) return null;

    // Get primary audio track for this pack
    const audioTrackId = getPrimaryAudioTrackForPack(packId);

    return {
      packId: pack.id,
      packName: pack.name,
      recipeId: selectedRecipe.id,
      recipeName: selectedRecipe.name,
      audioTrackId,
    };
  }, [packId, userId]);
}
