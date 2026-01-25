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
 * 
 * SESSION LIFECYCLE:
 * - Calls /api/decision-os/drm with the trigger reason
 * - DRM endpoint returns fallback decision and marks session as rescued
 * - User acknowledges and proceeds to execute screen
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Utensils, AlertTriangle } from 'lucide-react-native';
import type { DrmOutput } from '../types/decision-os';

type DrmTriggerReason = 
  | 'rejection_threshold' 
  | 'time_threshold' 
  | 'explicit_done' 
  | 'no_valid_meal'
  | 'not_time_yet'
  | 'none';

/**
 * Rescue Screen — Main Component
 */
export default function RescueScreen() {
  const { sessionId, reason } = useLocalSearchParams<{ 
    sessionId: string; 
    reason: DrmTriggerReason;
  }>();
  
  const [rescue, setRescue] = useState<DrmOutput | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Call DRM API on mount
   */
  useEffect(() => {
    callDrmApi();
  }, [sessionId, reason]);

  /**
   * Call DRM endpoint to get fallback decision
   */
  const callDrmApi = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Map reason to trigger
      let trigger: string = reason || 'explicit_done';
      if (trigger === 'rejection_threshold') {
        trigger = 'explicit_done'; // API uses explicit_done for 2-rejection trigger from client
      }
      if (trigger === 'no_valid_meal') {
        trigger = 'explicit_done'; // Let server figure out the actual reason
      }
      
      const response = await fetch('/api/decision-os/drm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          trigger,
        }),
      });
      
      const data = await response.json();
      
      if (data.drmActivated && data.decision) {
        setRescue(data.decision);
      } else if (!data.drmActivated) {
        // DRM not activated (e.g., time_threshold before threshold time)
        setError('Rescue not needed right now');
      } else {
        setError('No rescue available');
      }
    } catch (err) {
      console.error('DRM API error:', err);
      setError('Unable to get rescue option');
    } finally {
      setIsLoading(false);
    }
  };

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
      router.replace('/(tabs)');
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

  /**
   * Handle "This isn't working" button press
   * Explicit DRM trigger from user
   */
  const handleExplicitDone = async () => {
    setIsLoading(true);
    
    try {
      const response = await fetch('/api/decision-os/drm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          trigger: 'explicit_done',
        }),
      });
      
      const data = await response.json();
      
      if (data.drmActivated && data.decision) {
        setRescue(data.decision);
      }
    } catch (err) {
      console.error('Explicit DRM API error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF6B35" />
          <Text style={styles.loadingText}>Finding a rescue...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Error/no rescue state
  if (error || !rescue) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <AlertTriangle size={48} color="#FF6B35" />
          <Text style={styles.title}>{error || 'Rescue unavailable'}</Text>
          <Text style={styles.subtitle}>Let's start fresh</Text>
          
          {/* Option to trigger explicit DRM */}
          <TouchableOpacity 
            style={styles.explicitDoneButton} 
            onPress={handleExplicitDone}
          >
            <Text style={styles.explicitDoneText}>This isn't working</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.okayButton} 
            onPress={() => router.replace('/(tabs)')}
          >
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
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
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
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
  explicitDoneButton: {
    marginBottom: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#FF6B35',
    borderRadius: 12,
  },
  explicitDoneText: {
    color: '#FF6B35',
    fontSize: 16,
    fontWeight: '500',
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
