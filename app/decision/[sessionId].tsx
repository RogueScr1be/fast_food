/**
 * Decision Screen — Single Decision Display
 * 
 * UI CONTRACT:
 * - Exactly ONE decision displayed
 * - Large "Let's do it" approve button (green/primary)
 * - Small "Not tonight" reject button (secondary)
 * - No other options visible
 * 
 * FLOW:
 * Approve → Execute screen
 * Reject → Increment rejection count → Maybe DRM
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
import { Clock, DollarSign, ChefHat, AlertTriangle } from 'lucide-react-native';
import type { ArbiterOutput, DrmOutput } from '../../types/decision-os';

/**
 * Decision Screen — Main Component
 */
export default function DecisionScreen() {
  const { sessionId, intents } = useLocalSearchParams<{ sessionId: string; intents: string }>();
  
  const [decision, setDecision] = useState<ArbiterOutput | DrmOutput | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [rejectionCount, setRejectionCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch decision from API
   */
  useEffect(() => {
    fetchDecision();
  }, [sessionId, intents]);

  const fetchDecision = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Build context from intents
      const selectedIntents = intents?.split(',').filter(i => i !== 'none') || [];
      
      const response = await fetch('/api/decision-os/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: {
            intents: selectedIntents,
            rejectionCount,
          },
        }),
      });
      
      const data = await response.json();
      
      if (data.decision) {
        // Map old response to ArbiterOutput shape
        const arbiterOutput: ArbiterOutput = {
          decision_id: `dec-${sessionId}-${Date.now()}`,
          mode: 'cook',
          meal: data.decision.meal || 'Suggested Meal',
          meal_id: data.decision.mealId || 1,
          confidence: 0.85,
          estimated_time: `${data.decision.prepTime || 25} min`,
          estimated_cost: `$${((data.decision.cost || 12) / 100).toFixed(0)}`,
          execution_payload: {
            steps: data.decision.steps || ['Prepare ingredients', 'Cook meal', 'Serve and enjoy'],
            ingredients_needed: [],
            substitutions: [],
          },
        };
        setDecision(arbiterOutput);
      } else if (data.drmRecommended) {
        // DRM should trigger - redirect to rescue
        router.replace({
          pathname: '/rescue',
          params: { sessionId, reason: 'no_valid_meal' },
        });
      } else {
        setError('No decision available');
      }
    } catch (err) {
      // Fallback decision for demo/offline
      const fallbackDecision: ArbiterOutput = {
        decision_id: `dec-${sessionId}-${Date.now()}`,
        mode: 'cook',
        meal: 'Chicken Pasta',
        meal_id: 1,
        confidence: 0.85,
        estimated_time: '30 min',
        estimated_cost: '$12',
        execution_payload: {
          steps: [
            'Boil water and cook pasta according to package',
            'Season and cook chicken in pan',
            'Add sauce and simmer',
            'Combine pasta with sauce and chicken',
            'Serve and enjoy',
          ],
          ingredients_needed: ['pasta', 'chicken', 'sauce'],
          substitutions: [],
        },
      };
      setDecision(fallbackDecision);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handle approve action
   * Navigate to execute screen
   */
  const handleApprove = async () => {
    if (!decision) return;
    
    // Navigate to execution screen
    router.push({
      pathname: '/execute/[decisionId]',
      params: {
        decisionId: decision.decision_id,
        meal: decision.meal,
        steps: JSON.stringify(decision.execution_payload.steps),
        time: decision.estimated_time,
      },
    });
  };

  /**
   * Handle reject action
   * Increment rejection count, maybe trigger DRM
   */
  const handleReject = async () => {
    const newRejectionCount = rejectionCount + 1;
    setRejectionCount(newRejectionCount);
    
    // Per contract: 2 rejections triggers DRM
    if (newRejectionCount >= 2) {
      router.replace({
        pathname: '/rescue',
        params: { sessionId, reason: 'rejection_threshold' },
      });
      return;
    }
    
    // Fetch new decision
    setIsLoading(true);
    await fetchDecision();
  };

  // Loading state
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF6B35" />
          <Text style={styles.loadingText}>Finding the perfect meal...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Error state
  if (error || !decision) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <AlertTriangle size={48} color="#FF6B35" />
          <Text style={styles.errorText}>{error || 'Something went wrong'}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={fetchDecision}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Check if this is a DRM rescue
  const isRescue = 'is_rescue' in decision && decision.is_rescue;

  return (
    <SafeAreaView style={styles.container}>
      {/* Rejection indicator */}
      {rejectionCount > 0 && (
        <View style={styles.rejectionIndicator}>
          <Text style={styles.rejectionText}>
            {rejectionCount === 1 ? "Let's try this one..." : "Last chance before rescue!"}
          </Text>
        </View>
      )}

      {/* Single Decision Card */}
      <View style={styles.cardContainer}>
        <View style={styles.card}>
          {/* Meal Name */}
          <Text style={styles.mealName}>{decision.meal}</Text>
          
          {/* Meta Info */}
          <View style={styles.metaContainer}>
            <View style={styles.metaItem}>
              <Clock size={18} color="#666" />
              <Text style={styles.metaText}>{decision.estimated_time}</Text>
            </View>
            <View style={styles.metaItem}>
              <DollarSign size={18} color="#666" />
              <Text style={styles.metaText}>{decision.estimated_cost}</Text>
            </View>
            <View style={styles.metaItem}>
              <ChefHat size={18} color="#666" />
              <Text style={styles.metaText}>{decision.mode}</Text>
            </View>
          </View>

          {/* Confidence (informational only) */}
          <View style={styles.confidenceContainer}>
            <View style={[styles.confidenceBar, { width: `${decision.confidence * 100}%` }]} />
          </View>
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionsContainer}>
        {/* Primary CTA: Approve (green, large, full-width) */}
        <TouchableOpacity
          style={styles.approveButton}
          onPress={handleApprove}
          activeOpacity={0.8}
        >
          <Text style={styles.approveButtonText}>Let's do it</Text>
        </TouchableOpacity>

        {/* Secondary: Reject (small, dismissive) */}
        {!isRescue && (
          <TouchableOpacity
            style={styles.rejectButton}
            onPress={handleReject}
            activeOpacity={0.6}
          >
            <Text style={styles.rejectButtonText}>Not tonight</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#FF6B35',
    borderRadius: 12,
  },
  retryButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  rejectionIndicator: {
    backgroundColor: '#FFF3E0',
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginHorizontal: 24,
    marginTop: Platform.OS === 'ios' ? 20 : 40,
    borderRadius: 12,
  },
  rejectionText: {
    color: '#E65100',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  cardContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 4,
  },
  mealName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1A1A',
    textAlign: 'center',
    marginBottom: 24,
  },
  metaContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    marginBottom: 24,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  confidenceContainer: {
    height: 4,
    backgroundColor: '#F0F0F0',
    borderRadius: 2,
    overflow: 'hidden',
  },
  confidenceBar: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 2,
  },
  actionsContainer: {
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 24 : 32,
    paddingTop: 16,
    gap: 12,
  },
  approveButton: {
    backgroundColor: '#4CAF50', // Green per contract
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
  approveButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
  },
  rejectButton: {
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rejectButtonText: {
    fontSize: 14,
    color: '#999',
    fontWeight: '500',
  },
});
