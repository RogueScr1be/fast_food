/**
 * Rescue Screen — DRM Fallback Display
 * 
 * UI CONTRACT:
 * - DRM NEVER asks permission
 * - Shows fallback decision (no choice)
 * - "Okay" acknowledgment button
 * - Auto-proceeds after display
 * 
 * DRM has ABSOLUTE AUTHORITY per contract
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Utensils, AlertTriangle } from 'lucide-react-native';
import { executeDrmOverride, getFallbackConfig, DEFAULT_FALLBACK_CONFIG } from '../lib/decision-os/drm/fallback';
import type { DrmOutput, DrmTriggerReason } from '../lib/decision-os/drm/fallback';

/**
 * Rescue Screen — Main Component
 */
export default function RescueScreen() {
  const { sessionId, reason } = useLocalSearchParams<{ 
    sessionId: string; 
    reason: DrmTriggerReason;
  }>();
  
  const [rescue, setRescue] = useState<DrmOutput | null>(null);

  /**
   * Execute DRM override on mount
   */
  useEffect(() => {
    const fallbackConfig = getFallbackConfig(DEFAULT_FALLBACK_CONFIG);
    const drmResult = executeDrmOverride(
      sessionId || 'rescue-session',
      fallbackConfig,
      reason || 'explicit_done'
    );
    setRescue(drmResult);
  }, [sessionId, reason]);

  /**
   * Get reason display text
   */
  const getReasonText = (r: DrmTriggerReason | undefined): string => {
    switch (r) {
      case 'rejection_threshold':
        return "You've rejected a couple options.";
      case 'time_threshold':
        return "It's getting late.";
      case 'explicit_done':
        return "No problem.";
      case 'no_valid_meal':
        return "Nothing fits right now.";
      default:
        return "Let's simplify.";
    }
  };

  /**
   * Handle "Okay" button press
   * Navigate to execute screen with fallback
   */
  const handleOkay = () => {
    if (!rescue) {
      router.replace('/(tabs)/tonight');
      return;
    }
    
    router.replace({
      pathname: '/execute/[decisionId]',
      params: {
        decisionId: rescue.decision_id,
        meal: rescue.meal,
        steps: JSON.stringify(rescue.execution_payload.steps),
        time: rescue.estimated_time,
      },
    });
  };

  // Loading/no rescue state
  if (!rescue) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <AlertTriangle size={48} color="#FF6B35" />
          <Text style={styles.title}>Rescue unavailable</Text>
          <Text style={styles.subtitle}>Let's start fresh</Text>
          <TouchableOpacity style={styles.okayButton} onPress={() => router.replace('/(tabs)/tonight')}>
            <Text style={styles.okayButtonText}>Start Over</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Rescue Icon */}
      <View style={styles.iconContainer}>
        <View style={styles.iconBackground}>
          <Utensils size={32} color="#FFF" />
        </View>
      </View>

      {/* Content */}
      <View style={styles.content}>
        {/* Reason Text */}
        <Text style={styles.reasonText}>{getReasonText(reason)}</Text>
        
        {/* Title */}
        <Text style={styles.title}>Here's a rescue:</Text>
        
        {/* Fallback Meal Card */}
        <View style={styles.rescueCard}>
          <Text style={styles.mealName}>{rescue.meal}</Text>
          <Text style={styles.instructions}>
            {rescue.execution_payload.steps[0]}
          </Text>
        </View>
        
        {/* DRM Note */}
        <Text style={styles.drmNote}>
          Quick and easy. No decisions needed.
        </Text>
      </View>

      {/* Primary CTA: Okay (acknowledgment) */}
      <View style={styles.actionsContainer}>
        <TouchableOpacity
          style={styles.okayButton}
          onPress={handleOkay}
          activeOpacity={0.8}
        >
          <Text style={styles.okayButtonText}>Okay</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF3E0', // Warm rescue color
  },
  iconContainer: {
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 60 : 80,
    paddingBottom: 24,
  },
  iconBackground: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FF6B35',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  reasonText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1A1A',
    textAlign: 'center',
    marginBottom: 32,
  },
  rescueCard: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 4,
    marginBottom: 24,
  },
  mealName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 12,
    textAlign: 'center',
  },
  instructions: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
  },
  drmNote: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  actionsContainer: {
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 24 : 32,
    paddingTop: 16,
  },
  okayButton: {
    backgroundColor: '#FF6B35',
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FF6B35',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  okayButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
  },
});
