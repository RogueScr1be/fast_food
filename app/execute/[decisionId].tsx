/**
 * Execute Screen — Execution Steps Display
 * 
 * UI CONTRACT:
 * - Max 7 execution steps (hard max per Miller's Law)
 * - Step-by-step progression
 * - "Done" completion button
 * - "This isn't working" DRM trigger
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Check, AlertCircle, ChefHat } from 'lucide-react-native';

/**
 * Execute Screen — Main Component
 */
export default function ExecuteScreen() {
  const { decisionId, meal, steps: stepsJson, time } = useLocalSearchParams<{
    decisionId: string;
    meal: string;
    steps: string;
    time: string;
  }>();
  
  const steps: string[] = stepsJson ? JSON.parse(stepsJson) : [];
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [allDone, setAllDone] = useState(false);

  /**
   * Toggle step completion
   */
  const toggleStep = (index: number) => {
    setCompletedSteps(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  /**
   * Handle "Done" button press
   */
  const handleDone = async () => {
    setAllDone(true);
    
    // Record completion (fire-and-forget)
    try {
      await fetch('/api/decision-os/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: decisionId,
          userAction: 'approved',
        }),
      });
    } catch {
      // Silent fail - completion is tracked locally
    }
    
    // Navigate back to home after brief delay
    setTimeout(() => {
      router.replace('/(tabs)/tonight');
    }, 1500);
  };

  /**
   * Handle "This isn't working" — DRM trigger
   */
  const handleNotWorking = () => {
    router.replace({
      pathname: '/rescue',
      params: { 
        sessionId: decisionId,
        reason: 'explicit_done',
      },
    });
  };

  // Success state
  if (allDone) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.successContainer}>
          <View style={styles.successIcon}>
            <Check size={48} color="#FFF" />
          </View>
          <Text style={styles.successTitle}>Dinner solved!</Text>
          <Text style={styles.successSubtitle}>Enjoy your meal</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Limit to 7 steps per contract (Miller's Law)
  const displaySteps = steps.slice(0, 7);
  const progress = (completedSteps.size / displaySteps.length) * 100;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.mealInfo}>
          <ChefHat size={24} color="#FF6B35" />
          <Text style={styles.mealName}>{meal}</Text>
        </View>
        <Text style={styles.timeEstimate}>{time}</Text>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <View style={[styles.progressBar, { width: `${progress}%` }]} />
      </View>

      {/* Steps List */}
      <ScrollView style={styles.stepsContainer} showsVerticalScrollIndicator={false}>
        {displaySteps.map((step, index) => {
          const isCompleted = completedSteps.has(index);
          return (
            <TouchableOpacity
              key={index}
              style={[styles.stepItem, isCompleted && styles.stepItemCompleted]}
              onPress={() => toggleStep(index)}
              activeOpacity={0.7}
            >
              <View style={[styles.stepNumber, isCompleted && styles.stepNumberCompleted]}>
                {isCompleted ? (
                  <Check size={16} color="#FFF" />
                ) : (
                  <Text style={styles.stepNumberText}>{index + 1}</Text>
                )}
              </View>
              <Text style={[styles.stepText, isCompleted && styles.stepTextCompleted]}>
                {step}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Action Buttons */}
      <View style={styles.actionsContainer}>
        {/* Primary CTA: Done (green) */}
        <TouchableOpacity
          style={[
            styles.doneButton,
            completedSteps.size < displaySteps.length && styles.doneButtonDisabled,
          ]}
          onPress={handleDone}
          activeOpacity={0.8}
        >
          <Text style={styles.doneButtonText}>Done</Text>
        </TouchableOpacity>

        {/* Secondary: DRM trigger */}
        <TouchableOpacity
          style={styles.notWorkingButton}
          onPress={handleNotWorking}
          activeOpacity={0.6}
        >
          <AlertCircle size={16} color="#999" />
          <Text style={styles.notWorkingText}>This isn't working</Text>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 20 : 40,
    paddingBottom: 16,
  },
  mealInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mealName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  timeEstimate: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  progressContainer: {
    height: 4,
    backgroundColor: '#E0E0E0',
    marginHorizontal: 24,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 2,
  },
  stepsContainer: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  stepItemCompleted: {
    backgroundColor: '#F5F5F5',
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FF6B35',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  stepNumberCompleted: {
    backgroundColor: '#4CAF50',
  },
  stepNumberText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  stepText: {
    flex: 1,
    fontSize: 16,
    color: '#1A1A1A',
    lineHeight: 24,
  },
  stepTextCompleted: {
    color: '#999',
    textDecorationLine: 'line-through',
  },
  actionsContainer: {
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 24 : 32,
    paddingTop: 16,
    gap: 12,
  },
  doneButton: {
    backgroundColor: '#4CAF50',
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  doneButtonDisabled: {
    backgroundColor: '#BDBDBD',
    shadowColor: '#BDBDBD',
  },
  doneButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
  },
  notWorkingButton: {
    height: 44,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  notWorkingText: {
    fontSize: 14,
    color: '#999',
    fontWeight: '500',
  },
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  successIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 16,
    color: '#666',
  },
});
