import React from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import type { Recipe } from '../lib/seeds/recipes';
import { recipeImages } from '../lib/seeds/images';

interface RecipeCardProps {
  recipe: Recipe;
  variant: 'fancy' | 'easy' | 'cheap';
  onPress: (recipe: Recipe) => void;
  style?: ViewStyle;
  highlighted?: boolean;
}

const variantMetadata = {
  fancy: { tag: 'Elevated', duration: 'Fine Dining • 45m' },
  easy: { tag: 'Effortless', duration: 'Balanced • 15m' },
  cheap: { tag: 'Economical', duration: 'Classic • 20m' },
};

export function RecipeCard({
  recipe,
  variant,
  onPress,
  style,
  highlighted = false,
}: RecipeCardProps) {
  const metadata = variantMetadata[variant];
  const imageSource = recipeImages[recipe.id];

  return (
    <TouchableOpacity
      onPress={() => onPress(recipe)}
      activeOpacity={0.8}
      style={[styles.card, highlighted && styles.highlighted, style]}
    >
      <View style={styles.imageContainer}>
        <Image
          source={imageSource}
          style={styles.image}
          resizeMode="cover"
        />
        <View style={styles.tagOverlay}>
          <Text style={styles.tagText}>{metadata.tag}</Text>
        </View>
      </View>

      <View style={styles.content}>
        <Text style={styles.heading}>{variant.toUpperCase()}</Text>
        <Text style={styles.title}>{recipe.name}</Text>

        <View style={styles.footer}>
          <Text style={styles.duration}>{metadata.duration}</Text>
          <Text style={styles.arrow}>→</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  highlighted: {
    borderWidth: 2,
    borderColor: '#131b2e',
  },
  imageContainer: {
    width: '100%',
    height: 160,
    position: 'relative',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  tagOverlay: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#131b2e',
  },
  content: {
    padding: 16,
  },
  heading: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#131b2e',
    marginBottom: 12,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  duration: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  arrow: {
    fontSize: 20,
    color: '#131b2e',
  },
});
