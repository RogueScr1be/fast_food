/**
 * Decision OS - Single Card Execution Interface
 * 
 * INVARIANTS:
 * - Shows exactly ONE actionable card at a time
 * - Three actions only: Approve, Reject, Trigger DRM
 * - No lists, no browsing, no history
 * - No arrays of decisions in component state
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Check, X, Zap, Clock, ChefHat, ShoppingBag, ExternalLink } from 'lucide-react-native';
import type { Decision, DecisionResponse, DrmResponse, DecisionType } from '../types/decision-os';

// API base URL
const getApiBase = (): string => {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.location.origin;
  }
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:8081';
  }
  return 'http://localhost:8081';
};

const API_BASE = getApiBase();

/**
 * Decision Card Component
 * Renders a SINGLE decision - no arrays, no lists
 */
interface DecisionCardProps {
  decision: Decision;
  onApprove: () => void;
  onReject: () => void;
  onTriggerDrm: () => void;
  isProcessing: boolean;
}

const DecisionCard: React.FC<DecisionCardProps> = ({
  decision,
  onApprove,
  onReject,
  onTriggerDrm,
  isProcessing,
}) => {
  const getIcon = (type: DecisionType) => {
    switch (type) {
      case 'cook':
        return <ChefHat size={28} color="#FFF" />;
      case 'zero_cook':
        return <Clock size={28} color="#FFF" />;
      case 'order':
        return <ShoppingBag size={28} color="#FFF" />;
    }
  };

  const getGradient = (type: DecisionType): [string, string] => {
    switch (type) {
      case 'cook':
        return ['#FF6B35', '#F7931E'];
      case 'zero_cook':
        return ['#11998e', '#38ef7d'];
      case 'order':
        return ['#4A00E0', '#8E2DE2'];
    }
  };

  const isOrderType = decision.type === 'order';

  return (
    <View style={styles.cardContainer}>
      <LinearGradient
        colors={getGradient(decision.type)}
        style={styles.cardHeader}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.cardHeaderContent}>
          <View style={styles.iconContainer}>
            {getIcon(decision.type)}
          </View>
          <View style={styles.titleContainer}>
            <Text style={styles.cardLabel}>Tonight:</Text>
            <Text style={styles.cardTitle}>{decision.title}</Text>
          </View>
        </View>
        <View style={styles.timeContainer}>
          <Clock size={16} color="rgba(255,255,255,0.8)" />
          <Text style={styles.timeText}>{decision.estMinutes} min</Text>
        </View>
      </LinearGradient>

      <View style={styles.cardBody}>
        {/* Cook/Zero Cook: Show steps */}
        {!isOrderType && decision.stepsShort && (
          <View style={styles.stepsContainer}>
            <Text style={styles.stepsLabel}>Do this now:</Text>
            {decision.stepsShort.map((step, index) => (
              <View key={index} style={styles.stepRow}>
                <Text style={styles.stepNumber}>{index + 1}</Text>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Order: Show vendor CTA */}
        {isOrderType && decision.vendor && (
          <View style={styles.orderContainer}>
            <Text style={styles.orderLabel}>Do this now:</Text>
            <View style={styles.vendorCta}>
              <ExternalLink size={20} color="#4A00E0" />
              <Text style={styles.vendorText}>Open {decision.vendor}</Text>
            </View>
          </View>
        )}
      </View>

      {/* Actions: Exactly three buttons */}
      <View style={styles.actionsContainer}>
        <TouchableOpacity
          style={[styles.actionButton, styles.rejectButton]}
          onPress={onReject}
          disabled={isProcessing}
          testID="reject-button"
        >
          <X size={20} color="#DC3545" />
          <Text style={[styles.actionText, styles.rejectText]}>Reject</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.drmButton]}
          onPress={onTriggerDrm}
          disabled={isProcessing}
          testID="drm-button"
        >
          <Zap size={20} color="#F7931E" />
          <Text style={[styles.actionText, styles.drmText]}>Handle It</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.approveButton]}
          onPress={onApprove}
          disabled={isProcessing}
          testID="approve-button"
        >
          <Check size={20} color="#FFF" />
          <Text style={[styles.actionText, styles.approveText]}>Approve</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

/**
 * Main Decision OS Screen
 * Enforces single-card invariant at state level
 */
export default function DecisionOsScreen() {
  // SINGLE card state - NOT an array
  const [currentCard, setCurrentCard] = useState<Decision | null>(null);
  const [currentEventId, setCurrentEventId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Track rejection to enforce single re-decision
  const hasRejectedOnceRef = useRef(false);
  const reDecisionCalledRef = useRef(false);

  const getNowIso = () => new Date().toISOString();

  /**
   * Fetch initial decision on mount
   */
  const fetchDecision = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_BASE}/api/decision-os/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          householdKey: 'default',
          nowIso: getNowIso(),
          signal: {}
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data: DecisionResponse = await response.json();
      
      if (data.decision) {
        // Set SINGLE card
        setCurrentCard(data.decision);
        setCurrentEventId(data.decisionEventId);
      } else if (data.drmRecommended) {
        // Auto-trigger DRM
        await triggerDrm('auto_drm');
      }
    } catch (err) {
      console.error('Failed to fetch decision:', err);
      setError('Failed to load decision. Tap to retry.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Trigger DRM and show rescue
   */
  const triggerDrm = async (reason: 'handle_it' | 'auto_drm' | 'rejection_cascade') => {
    setIsProcessing(true);
    
    try {
      const response = await fetch(`${API_BASE}/api/decision-os/drm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          householdKey: 'default',
          nowIso: getNowIso(),
          triggerReason: reason
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data: DrmResponse = await response.json();
      
      // Set SINGLE rescue card
      setCurrentCard(data.rescue);
      setCurrentEventId(data.decisionEventId);
    } catch (err) {
      console.error('DRM failed:', err);
      setError('Failed to get rescue option.');
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * Send feedback to API
   */
  const sendFeedback = async (action: 'approved' | 'rejected' | 'drm_triggered') => {
    if (!currentEventId) return;
    
    try {
      await fetch(`${API_BASE}/api/decision-os/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          householdKey: 'default',
          eventId: currentEventId,
          userAction: action,
          nowIso: getNowIso()
        })
      });
    } catch (err) {
      // Best-effort, don't block UI
      console.error('Feedback failed:', err);
    }
  };

  /**
   * Handle Approve action
   */
  const handleApprove = async () => {
    if (!currentCard) return;
    setIsProcessing(true);
    
    // For order type, try deep link first
    if (currentCard.type === 'order' && currentCard.deepLinkUrl) {
      try {
        const canOpen = await Linking.canOpenURL(currentCard.deepLinkUrl);
        if (canOpen) {
          await Linking.openURL(currentCard.deepLinkUrl);
        } else if (currentCard.fallbackUrl) {
          // Single fallback URL - no list
          await Linking.openURL(currentCard.fallbackUrl);
        } else {
          // Generic fallback
          await Linking.openURL('https://www.doordash.com');
        }
      } catch (err) {
        // Deep link failed - show single fallback
        console.error('Deep link failed:', err);
        if (currentCard.fallbackUrl) {
          try {
            await Linking.openURL(currentCard.fallbackUrl);
          } catch {
            // Last resort generic fallback
            await Linking.openURL('https://www.doordash.com');
          }
        }
      }
    }
    
    // Send feedback regardless
    await sendFeedback('approved');
    
    // Show success state
    setCurrentCard(null);
    setIsProcessing(false);
  };

  /**
   * Handle Reject action
   * Re-calls decision ONCE only
   */
  const handleReject = async () => {
    setIsProcessing(true);
    
    // Send rejection feedback
    await sendFeedback('rejected');
    
    // INVARIANT: Only re-call decision ONCE
    if (!reDecisionCalledRef.current) {
      reDecisionCalledRef.current = true;
      hasRejectedOnceRef.current = true;
      
      try {
        const response = await fetch(`${API_BASE}/api/decision-os/decision`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            householdKey: 'default',
            nowIso: getNowIso(),
            signal: {}
          })
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const data: DecisionResponse = await response.json();
        
        if (data.decision) {
          setCurrentCard(data.decision);
          setCurrentEventId(data.decisionEventId);
        } else if (data.drmRecommended) {
          // Auto-trigger DRM after rejection cascade
          await triggerDrm('rejection_cascade');
        }
      } catch (err) {
        console.error('Re-decision failed:', err);
        // On failure, trigger DRM as fallback
        await triggerDrm('rejection_cascade');
      }
    } else {
      // Already rejected once, go straight to DRM
      await triggerDrm('rejection_cascade');
    }
    
    setIsProcessing(false);
  };

  /**
   * Handle explicit DRM trigger
   */
  const handleTriggerDrm = async () => {
    await sendFeedback('drm_triggered');
    await triggerDrm('handle_it');
  };

  // Fetch decision on mount
  useEffect(() => {
    fetchDecision();
  }, [fetchDecision]);

  // Loading state
  if (isLoading) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={['#1a1a2e', '#16213e']}
          style={styles.background}
        >
          <ActivityIndicator size="large" color="#FFF" />
          <Text style={styles.loadingText}>Loading decision...</Text>
        </LinearGradient>
      </View>
    );
  }

  // Error state
  if (error) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={['#1a1a2e', '#16213e']}
          style={styles.background}
        >
          <TouchableOpacity onPress={fetchDecision} style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
            <Text style={styles.retryText}>Tap to retry</Text>
          </TouchableOpacity>
        </LinearGradient>
      </View>
    );
  }

  // Success state (after approval)
  if (!currentCard) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={['#1a1a2e', '#16213e']}
          style={styles.background}
        >
          <View style={styles.successContainer}>
            <View style={styles.successIcon}>
              <Check size={48} color="#28A745" />
            </View>
            <Text style={styles.successTitle}>Done.</Text>
            <Text style={styles.successSubtitle}>Decision executed.</Text>
            <TouchableOpacity
              style={styles.newDecisionButton}
              onPress={() => {
                // Reset state for new decision
                hasRejectedOnceRef.current = false;
                reDecisionCalledRef.current = false;
                fetchDecision();
              }}
            >
              <Text style={styles.newDecisionText}>Get next decision</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </View>
    );
  }

  // Main decision card view - SINGLE card only
  return (
    <View style={styles.container} testID="decision-os-screen">
      <LinearGradient
        colors={['#1a1a2e', '#16213e']}
        style={styles.background}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Decision OS</Text>
        </View>
        
        {/* SINGLE card - enforced by state being a single object, not array */}
        <View style={styles.cardWrapper} testID="single-card-container">
          <DecisionCard
            decision={currentCard}
            onApprove={handleApprove}
            onReject={handleReject}
            onTriggerDrm={handleTriggerDrm}
            isProcessing={isProcessing}
          />
        </View>
        
        {isProcessing && (
          <View style={styles.processingOverlay}>
            <ActivityIndicator size="small" color="#FFF" />
          </View>
        )}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  background: {
    flex: 1,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: 'Inter-Bold',
    color: '#FFF',
  },
  cardWrapper: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  cardContainer: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  cardHeader: {
    padding: 20,
  },
  cardHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  titleContainer: {
    flex: 1,
  },
  cardLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 22,
    fontFamily: 'Inter-Bold',
    color: '#FFF',
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 6,
  },
  timeText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: 'rgba(255,255,255,0.9)',
  },
  cardBody: {
    padding: 20,
  },
  stepsContainer: {
    gap: 12,
  },
  stepsLabel: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#666',
    marginBottom: 8,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F0F0F0',
    textAlign: 'center',
    lineHeight: 24,
    fontSize: 12,
    fontFamily: 'Inter-Bold',
    color: '#666',
    marginRight: 12,
  },
  stepText: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    color: '#333',
    lineHeight: 24,
  },
  orderContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  orderLabel: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#666',
    marginBottom: 16,
  },
  vendorCta: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F0FF',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 10,
  },
  vendorText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#4A00E0',
  },
  actionsContainer: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  rejectButton: {
    backgroundColor: '#FFF5F5',
    borderRightWidth: 1,
    borderRightColor: '#F0F0F0',
  },
  drmButton: {
    backgroundColor: '#FFF9F0',
    borderRightWidth: 1,
    borderRightColor: '#F0F0F0',
  },
  approveButton: {
    backgroundColor: '#28A745',
  },
  actionText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  rejectText: {
    color: '#DC3545',
  },
  drmText: {
    color: '#F7931E',
  },
  approveText: {
    color: '#FFF',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#FFF',
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorText: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#DC3545',
    textAlign: 'center',
    marginBottom: 12,
  },
  retryText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#FFF',
  },
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(40, 167, 69, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 28,
    fontFamily: 'Inter-Bold',
    color: '#FFF',
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 40,
  },
  newDecisionButton: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  newDecisionText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#FFF',
  },
  processingOverlay: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
  },
});
