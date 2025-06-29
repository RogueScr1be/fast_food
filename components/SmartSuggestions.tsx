import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Sparkles, Clock, DollarSign, Users } from 'lucide-react-native';
import Animated, {
  FadeInUp,
  FadeOutDown,
} from 'react-native-reanimated';

interface Suggestion {
  id: string;
  text: string;
  icon: React.ReactNode;
  category: 'quick' | 'budget' | 'family' | 'special';
}

interface SmartSuggestionsProps {
  suggestions?: Suggestion[];
  onSuggestionPress: (suggestion: Suggestion) => void;
  visible?: boolean;
}

const SmartSuggestions: React.FC<SmartSuggestionsProps> = ({
  suggestions,
  onSuggestionPress,
  visible = true,
}) => {
  if (!visible) return null;
  
  // Use default suggestions if none provided
  const displaySuggestions = suggestions || generateSmartSuggestions();

  if (displaySuggestions.length === 0) return null;

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'quick': return '#28A745';
      case 'budget': return '#FFC107';
      case 'family': return '#17A2B8';
      case 'special': return '#FF6B35';
      default: return '#6C757D';
    }
  };

  return (
    <Animated.View 
      entering={FadeInUp.duration(400)}
      exiting={FadeOutDown.duration(300)}
      style={styles.container}
    >
      <View style={styles.header}>
        <Sparkles size={16} color="#FF6B35" />
        <Text style={styles.title}>Smart Suggestions</Text>
      </View>
      
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {displaySuggestions.map((suggestion, index) => (
          <Animated.View
            key={suggestion.id}
            entering={FadeInUp.delay(index * 100).duration(400)}
          >
            <TouchableOpacity
              style={[
                styles.suggestionCard,
                { borderLeftColor: getCategoryColor(suggestion.category) }
              ]}
              onPress={() => onSuggestionPress(suggestion)}
              activeOpacity={0.7}
            >
              <View style={styles.iconContainer}>
                {suggestion.icon}
              </View>
              <Text style={styles.suggestionText} numberOfLines={2}>
                {suggestion.text}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        ))}
      </ScrollView>
    </Animated.View>
  );
};

// Default suggestions generator
export const generateSmartSuggestions = (context?: {
  timeOfDay?: 'morning' | 'afternoon' | 'evening';
  userProfile?: any;
  recentActivity?: string[];
}): Suggestion[] => {
  const baseSuggestions: Suggestion[] = [
    {
      id: 'quick-dinner',
      text: 'Quick 15-minute dinner',
      icon: <Clock size={16} color="#28A745" />,
      category: 'quick',
    },
    {
      id: 'budget-meals',
      text: 'Budget meals under $5',
      icon: <DollarSign size={16} color="#FFC107" />,
      category: 'budget',
    },
    {
      id: 'family-friendly',
      text: 'Kid-friendly recipes',
      icon: <Users size={16} color="#17A2B8" />,
      category: 'family',
    },
    {
      id: 'healthy-options',
      text: 'Healthy meal options',
      icon: <Sparkles size={16} color="#FF6B35" />,
      category: 'special',
    },
  ];

  // Add time-based suggestions
  if (context?.timeOfDay === 'evening') {
    baseSuggestions.unshift({
      id: 'tonight-dinner',
      text: 'What should I cook tonight?',
      icon: <Clock size={16} color="#FF6B35" />,
      category: 'special',
    });
  }

  // Add user profile based suggestions
  if (context?.userProfile) {
    const { favorites } = context.userProfile;
    if (favorites && favorites.length > 0) {
      const favorite = favorites[0];
      baseSuggestions.push({
        id: 'favorite-cuisine',
        text: `${favorite} recipes you'll love`,
        icon: <Sparkles size={16} color="#FF6B35" />,
        category: 'special',
      });
    }
  }

  return baseSuggestions.slice(0, 4); // Limit to 4 suggestions
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFF',
    borderRadius: 15,
    padding: 15,
    marginVertical: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontFamily: 'Inter-Bold',
    color: '#333',
  },
  scrollContent: {
    gap: 12,
    paddingRight: 20,
  },
  suggestionCard: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 3,
    minWidth: 140,
    maxWidth: 160,
  },
  iconContainer: {
    marginBottom: 8,
  },
  suggestionText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#333',
    lineHeight: 18,
  },
});

export default SmartSuggestions;
export { generateSmartSuggestions };