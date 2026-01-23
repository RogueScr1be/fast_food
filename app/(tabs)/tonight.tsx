/**
 * Tonight Screen — Intent Capture
 * 
 * UI CONTRACT:
 * - Max 1 primary action per screen
 * - 4 quick-tap intent buttons
 * - Primary CTA at bottom, ≥48px height, full-width
 * 
 * FLOW:
 * User taps intent buttons → "Decide for me" → Decision screen
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  SafeAreaView,
} from 'react-native';
import { router } from 'expo-router';
import { Zap, DollarSign, Battery, Clock } from 'lucide-react-native';

/**
 * Intent options per contract
 */
type IntentOption = 'easy' | 'cheap' | 'no_energy' | 'quick';

interface IntentButtonProps {
  option: IntentOption;
  label: string;
  icon: React.ReactNode;
  selected: boolean;
  onPress: () => void;
}

/**
 * Intent Button Component
 */
function IntentButton({ label, icon, selected, onPress }: IntentButtonProps) {
  return (
    <TouchableOpacity
      style={[styles.intentButton, selected && styles.intentButtonSelected]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.intentIcon, selected && styles.intentIconSelected]}>
        {icon}
      </View>
      <Text style={[styles.intentLabel, selected && styles.intentLabelSelected]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/**
 * Tonight Screen — Main Component
 */
export default function TonightScreen() {
  const [selectedIntents, setSelectedIntents] = useState<Set<IntentOption>>(new Set());
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Toggle intent selection
   */
  const toggleIntent = (intent: IntentOption) => {
    setSelectedIntents(prev => {
      const newSet = new Set(prev);
      if (newSet.has(intent)) {
        newSet.delete(intent);
      } else {
        newSet.add(intent);
      }
      return newSet;
    });
  };

  /**
   * Handle "Decide for me" button press
   * Navigates to decision screen with selected intents
   */
  const handleDecide = async () => {
    setIsLoading(true);
    
    // Navigate to decision screen with intent params
    const intentParams = Array.from(selectedIntents).join(',');
    router.push({
      pathname: '/decision/[sessionId]',
      params: { 
        sessionId: `session-${Date.now()}`,
        intents: intentParams || 'none',
      },
    });
    
    // Reset loading after navigation
    setTimeout(() => setIsLoading(false), 500);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.greeting}>What sounds good tonight?</Text>
        <Text style={styles.subtitle}>Tap what matters most</Text>
      </View>

      {/* Intent Buttons Grid */}
      <View style={styles.intentGrid}>
        <IntentButton
          option="easy"
          label="Easy"
          icon={<Zap size={28} color={selectedIntents.has('easy') ? '#FFF' : '#FF6B35'} />}
          selected={selectedIntents.has('easy')}
          onPress={() => toggleIntent('easy')}
        />
        <IntentButton
          option="cheap"
          label="Cheap"
          icon={<DollarSign size={28} color={selectedIntents.has('cheap') ? '#FFF' : '#FF6B35'} />}
          selected={selectedIntents.has('cheap')}
          onPress={() => toggleIntent('cheap')}
        />
        <IntentButton
          option="no_energy"
          label="No Energy"
          icon={<Battery size={28} color={selectedIntents.has('no_energy') ? '#FFF' : '#FF6B35'} />}
          selected={selectedIntents.has('no_energy')}
          onPress={() => toggleIntent('no_energy')}
        />
        <IntentButton
          option="quick"
          label="Quick"
          icon={<Clock size={28} color={selectedIntents.has('quick') ? '#FFF' : '#FF6B35'} />}
          selected={selectedIntents.has('quick')}
          onPress={() => toggleIntent('quick')}
        />
      </View>

      {/* Primary CTA — Bottom, Full Width, ≥48px */}
      <View style={styles.ctaContainer}>
        <TouchableOpacity
          style={[styles.primaryButton, isLoading && styles.primaryButtonDisabled]}
          onPress={handleDecide}
          disabled={isLoading}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryButtonText}>
            {isLoading ? 'Deciding...' : 'Decide for me'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 20 : 40,
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  greeting: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    fontWeight: '400',
  },
  intentGrid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 12,
    justifyContent: 'center',
    alignContent: 'flex-start',
  },
  intentButton: {
    width: '45%',
    aspectRatio: 1,
    backgroundColor: '#FFF',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#F0F0F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  intentButtonSelected: {
    backgroundColor: '#FF6B35',
    borderColor: '#FF6B35',
  },
  intentIcon: {
    marginBottom: 12,
  },
  intentIconSelected: {
    // Icon color handled in component
  },
  intentLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  intentLabelSelected: {
    color: '#FFF',
  },
  ctaContainer: {
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 24 : 32,
    paddingTop: 16,
  },
  primaryButton: {
    backgroundColor: '#FF6B35',
    height: 56, // ≥48px per contract
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FF6B35',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryButtonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
  },
});
