import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

interface SuggestionChipsProps {
  suggestions: string[];
  onPress: (suggestion: string) => void;
}

const SuggestionChips: React.FC<SuggestionChipsProps> = ({ suggestions, onPress }) => {
  if (!suggestions || suggestions.length === 0) return null;
  
  return (
    <View style={styles.container}>
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {suggestions.map((suggestion, index) => (
          <Animated.View
            key={index}
            entering={FadeIn.delay(index * 100).springify()}
          >
            <TouchableOpacity 
              style={styles.chip}
              onPress={() => onPress(suggestion)}
              activeOpacity={0.7}
            >
              <Text style={styles.text}>{suggestion}</Text>
            </TouchableOpacity>
          </Animated.View>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  content: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  text: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#8A2BE2',
  },
});

export default SuggestionChips;