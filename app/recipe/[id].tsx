import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { ArrowRight, Clock, DollarSign, ChefHat, Heart, Share2, ArrowLeft } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppContext } from '@/contexts/AppContext';
import AnimatedCard from '@/components/AnimatedCard';
import GradientButton from '@/components/GradientButton';

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams();
  const [recipe, setRecipe] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { setCurrentMealPlan, setGroceryList } = useAppContext();

  useEffect(() => {
    fetchRecipe();
  }, [id]);

  const fetchRecipe = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // In a real app, this would fetch from an API
      // For now, we'll simulate a network request
      setTimeout(() => {
        // Mock recipe data
        const recipeData = {
          id: id,
          title: '🌮 Quick Chicken Tacos',
          cookTime: '15 min',
          cost: '$6/serving',
          difficulty: 'Easy',
          thumbnail: 'https://images.pexels.com/photos/2092507/pexels-photo-2092507.jpeg?auto=compress&cs=tinysrgb&w=800&h=500',
          tags: ['mexican', 'chicken', 'quick', 'protein'],
          ingredients: ['chicken breast', 'taco shells', 'lettuce', 'tomatoes', 'cheese', 'lime'],
          rating: 4.8,
          views: '2.1M',
          instructions: [
            'Season chicken with salt, pepper, and taco seasoning',
            'Cook chicken in a pan for 6-8 minutes until done',
            'Warm taco shells in the oven for 2-3 minutes',
            'Assemble tacos with chicken, lettuce, tomatoes, and cheese',
            'Squeeze lime juice over tacos before serving'
          ],
          nutrition: {
            calories: 320,
            protein: 28,
            carbs: 30,
            fat: 12
          }
        };
        
        setRecipe(recipeData);
        setLoading(false);
      }, 1000);
    } catch (error) {
      setError('Failed to load recipe. Please try again.');
      setLoading(false);
    }
  };

  const handleAddToMealPlan = () => {
    if (!recipe) return;
    
    const newMeal = {
      day: 'Tonight',
      meal: recipe.title,
      cookTime: recipe.cookTime,
      cost: recipe.cost,
      ingredients: recipe.ingredients
    };
    
    setCurrentMealPlan(prev => [newMeal, ...prev]);
    setGroceryList(prev => [...new Set([...prev, ...recipe.ingredients])]);
    
    // Navigate back to home
    router.push('/(tabs)');
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF6B35" />
        <Text style={styles.loadingText}>Loading recipe...</Text>
      </View>
    );
  }

  if (error || !recipe) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error || 'Recipe not found'}</Text>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Hero Image */}
        <View style={styles.imageContainer}>
          <Image 
            source={{ uri: recipe.thumbnail }}
            style={styles.image}
            resizeMode="cover"
          />
          <LinearGradient
            colors={['rgba(0,0,0,0.7)', 'transparent']}
            style={styles.imageFade}
          />
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <ArrowLeft size={24} color="#FFF" />
          </TouchableOpacity>
        </View>
        
        <View style={styles.content}>
          {/* Recipe Header */}
          <View style={styles.header}>
            <Text style={styles.title}>{recipe.title}</Text>
            
            <View style={styles.metaContainer}>
              <View style={styles.metaItem}>
                <Clock size={16} color="#FF6B35" />
                <Text style={styles.metaText}>{recipe.cookTime}</Text>
              </View>
              <View style={styles.metaItem}>
                <DollarSign size={16} color="#FF6B35" />
                <Text style={styles.metaText}>{recipe.cost}</Text>
              </View>
              <View style={styles.metaItem}>
                <ChefHat size={16} color="#FF6B35" />
                <Text style={styles.metaText}>{recipe.difficulty}</Text>
              </View>
            </View>
            
            <View style={styles.tagsContainer}>
              {recipe.tags.map((tag: string, index: number) => (
                <View key={index} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          </View>
          
          {/* Ingredients */}
          <AnimatedCard style={styles.section}>
            <Text style={styles.sectionTitle}>Ingredients</Text>
            <View style={styles.ingredientsList}>
              {recipe.ingredients.map((ingredient: string, index: number) => (
                <View key={index} style={styles.ingredientItem}>
                  <View style={styles.bulletPoint} />
                  <Text style={styles.ingredientText}>{ingredient}</Text>
                </View>
              ))}
            </View>
          </AnimatedCard>
          
          {/* Instructions */}
          <AnimatedCard style={styles.section}>
            <Text style={styles.sectionTitle}>Instructions</Text>
            <View style={styles.instructionsList}>
              {recipe.instructions.map((instruction: string, index: number) => (
                <View key={index} style={styles.instructionItem}>
                  <View style={styles.instructionNumber}>
                    <Text style={styles.instructionNumberText}>{index + 1}</Text>
                  </View>
                  <Text style={styles.instructionText}>{instruction}</Text>
                </View>
              ))}
            </View>
          </AnimatedCard>
          
          {/* Nutrition */}
          <AnimatedCard style={styles.section}>
            <Text style={styles.sectionTitle}>Nutrition (per serving)</Text>
            <View style={styles.nutritionGrid}>
              <View style={styles.nutritionItem}>
                <Text style={styles.nutritionValue}>{recipe.nutrition.calories}</Text>
                <Text style={styles.nutritionLabel}>Calories</Text>
              </View>
              <View style={styles.nutritionItem}>
                <Text style={styles.nutritionValue}>{recipe.nutrition.protein}g</Text>
                <Text style={styles.nutritionLabel}>Protein</Text>
              </View>
              <View style={styles.nutritionItem}>
                <Text style={styles.nutritionValue}>{recipe.nutrition.carbs}g</Text>
                <Text style={styles.nutritionLabel}>Carbs</Text>
              </View>
              <View style={styles.nutritionItem}>
                <Text style={styles.nutritionValue}>{recipe.nutrition.fat}g</Text>
                <Text style={styles.nutritionLabel}>Fat</Text>
              </View>
            </View>
          </AnimatedCard>
          
          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity style={styles.actionButton}>
              <Heart size={20} color="#FF6B35" />
              <Text style={styles.actionButtonText}>Save</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.actionButton}>
              <Share2 size={20} color="#FF6B35" />
              <Text style={styles.actionButtonText}>Share</Text>
            </TouchableOpacity>
            
            <GradientButton
              title="Add to Meal Plan"
              onPress={handleAddToMealPlan}
              icon={<ArrowRight size={20} color="#FFF" />}
              style={styles.addButton}
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#DC3545',
    marginBottom: 20,
    textAlign: 'center',
  },
  backButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 30,
    left: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  backButtonText: {
    color: '#FF6B35',
    fontSize: 16,
    fontFamily: 'Inter-Bold',
  },
  imageContainer: {
    width: '100%',
    height: 300,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 100,
  },
  content: {
    padding: 20,
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontFamily: 'Inter-Bold',
    color: '#333',
    marginBottom: 12,
  },
  metaContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 20,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#666',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    backgroundColor: '#FFF5F2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#FFE0D6',
  },
  tagText: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    color: '#FF6B35',
    textTransform: 'capitalize',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    color: '#333',
    marginBottom: 16,
  },
  ingredientsList: {
    gap: 10,
  },
  ingredientItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bulletPoint: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF6B35',
  },
  ingredientText: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#333',
  },
  instructionsList: {
    gap: 16,
  },
  instructionItem: {
    flexDirection: 'row',
    gap: 12,
  },
  instructionNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FF6B35',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  instructionNumberText: {
    color: '#FFF',
    fontSize: 14,
    fontFamily: 'Inter-Bold',
  },
  instructionText: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#333',
    lineHeight: 24,
  },
  nutritionGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  nutritionItem: {
    alignItems: 'center',
  },
  nutritionValue: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    color: '#FF6B35',
    marginBottom: 4,
  },
  nutritionLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#666',
  },
  actionButtons: {
    flexDirection: 'row',
    marginTop: 10,
    marginBottom: 40,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#FF6B35',
    paddingVertical: 12,
    borderRadius: 25,
    gap: 8,
  },
  actionButtonText: {
    color: '#FF6B35',
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  addButton: {
    flex: 2,
  },
});