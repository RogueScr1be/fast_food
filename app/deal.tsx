import React from 'react';
import {
  View,
  ScrollView,
  SafeAreaView,
  StyleSheet,
  Text,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSession } from '../lib/hooks/useSession';
import { useDealRecommendations } from '../lib/hooks/useDeterministicRecommendation';
import { RecipeCard } from './_components/RecipeCard';
import type { Recipe } from '../lib/seeds/recipes';

export default function DealScreen() {
  const router = useRouter();
  const session = useSession();

  const recommendations = useDealRecommendations(
    session.state.userId,
    session.state.selectedMood,
    [] // TODO: Load from acceptance_log
  );

  const handleSelectRecipe = (recipe: Recipe) => {
    session.setSelectedRecipe(recipe.id);
    router.push('/cook');
  };

  if (!recommendations) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.error}>No recipes available</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Tonight</Text>
        <Text style={styles.subtitle}>
          Pick one. Get cooking. Dinner in minutes.
        </Text>

        {/* Fancy Card (Highlighted) */}
        {recommendations.fancy && (
          <RecipeCard
            recipe={recommendations.fancy}
            variant="fancy"
            onPress={handleSelectRecipe}
            highlighted={session.state.selectedRecipeId === recommendations.fancy.id}
            style={styles.fancyCard}
          />
        )}

        {/* Easy Card */}
        {recommendations.easy && (
          <RecipeCard
            recipe={recommendations.easy}
            variant="easy"
            onPress={handleSelectRecipe}
            highlighted={session.state.selectedRecipeId === recommendations.easy.id}
          />
        )}

        {/* Cheap Card */}
        {recommendations.cheap && (
          <RecipeCard
            recipe={recommendations.cheap}
            variant="cheap"
            onPress={handleSelectRecipe}
            highlighted={session.state.selectedRecipeId === recommendations.cheap.id}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f1e8',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#131b2e',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
    lineHeight: 22,
  },
  fancyCard: {
    borderWidth: 2,
    borderColor: '#131b2e',
  },
  error: {
    fontSize: 18,
    color: '#ba1a1a',
    textAlign: 'center',
    marginTop: 40,
  },
});
