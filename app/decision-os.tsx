/**
 * Decision OS UI Component
 * 
 * Displays decision cards with support for:
 * - Normal decision flow (Approve/Reject buttons)
 * - Autopilot "Handled." state (single card with optional Undo)
 * 
 * Invariants:
 * - Only ONE card is shown at a time
 * - Autopilot state does NOT show Approve/Reject buttons
 * - Undo is only available within the 10-minute window
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import type { DecisionResponse } from '../types/decision-os';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const UNDO_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Props for the DecisionCard component
 */
interface DecisionCardProps {
  decision: DecisionResponse;
  decisionTimestamp: number; // When the decision was received
  onApprove?: () => void;
  onReject?: () => void;
  onUndo?: () => void;
  onDinnerChanged?: () => void;
}

/**
 * Props for the HandledCard component (autopilot state)
 */
interface HandledCardProps {
  decisionTimestamp: number;
  onUndo?: () => void;
  onDinnerChanged?: () => void;
}

/**
 * Calculates remaining time in the undo window.
 * 
 * @param decisionTimestamp - When the decision was made
 * @returns Remaining milliseconds, or 0 if outside window
 */
function getRemainingUndoTime(decisionTimestamp: number): number {
  const elapsed = Date.now() - decisionTimestamp;
  const remaining = UNDO_WINDOW_MS - elapsed;
  return Math.max(0, remaining);
}

/**
 * Formats remaining time as "X:XX" (minutes:seconds)
 */
function formatRemainingTime(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * HandledCard - Shown when autopilot:true
 * 
 * Displays:
 * - "Handled." title
 * - "Dinner is in motion." subtitle
 * - Undo button (only if within undo window)
 * - Optional "Dinner changed" secondary action
 */
export function HandledCard({ 
  decisionTimestamp, 
  onUndo, 
  onDinnerChanged 
}: HandledCardProps): React.ReactElement {
  const [remainingTime, setRemainingTime] = useState(() => 
    getRemainingUndoTime(decisionTimestamp)
  );
  
  // Update remaining time every second
  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = getRemainingUndoTime(decisionTimestamp);
      setRemainingTime(remaining);
      
      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [decisionTimestamp]);
  
  const canUndo = remainingTime > 0;
  
  return (
    <View style={styles.card} testID="handled-card">
      <View style={styles.cardContent}>
        <Text style={styles.handledTitle} testID="handled-title">Handled.</Text>
        <Text style={styles.handledSubtitle} testID="handled-subtitle">
          Dinner is in motion.
        </Text>
        
        {/* Primary action: Undo (only if within window) */}
        {canUndo && (
          <TouchableOpacity
            style={styles.undoButton}
            onPress={onUndo}
            testID="undo-button"
            accessibilityLabel="Undo autopilot decision"
          >
            <Text style={styles.undoButtonText}>
              Undo ({formatRemainingTime(remainingTime)})
            </Text>
          </TouchableOpacity>
        )}
        
        {/* Secondary action: Dinner changed */}
        {onDinnerChanged && (
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={onDinnerChanged}
            testID="dinner-changed-button"
            accessibilityLabel="Dinner plans changed"
          >
            <Text style={styles.secondaryButtonText}>
              Dinner changed
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

/**
 * NormalDecisionCard - Shown when autopilot:false or undefined
 * 
 * Displays:
 * - Decision details
 * - Approve button
 * - Reject button
 */
export function NormalDecisionCard({
  decision,
  onApprove,
  onReject,
}: {
  decision: DecisionResponse;
  onApprove?: () => void;
  onReject?: () => void;
}): React.ReactElement {
  return (
    <View style={styles.card} testID="normal-decision-card">
      <View style={styles.cardContent}>
        <Text style={styles.title}>Decision Ready</Text>
        
        {decision.message && (
          <Text style={styles.message}>{decision.message}</Text>
        )}
        
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.button, styles.rejectButton]}
            onPress={onReject}
            testID="reject-button"
            accessibilityLabel="Reject decision"
          >
            <Text style={styles.rejectButtonText}>Reject</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.button, styles.approveButton]}
            onPress={onApprove}
            testID="approve-button"
            accessibilityLabel="Approve decision"
          >
            <Text style={styles.approveButtonText}>Approve</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

/**
 * DecisionCard - Main component that switches between states
 * 
 * Invariant: Only ONE card is shown at a time
 * - If autopilot:true → HandledCard (no Approve/Reject)
 * - Otherwise → NormalDecisionCard (with Approve/Reject)
 */
export function DecisionCard({
  decision,
  decisionTimestamp,
  onApprove,
  onReject,
  onUndo,
  onDinnerChanged,
}: DecisionCardProps): React.ReactElement {
  // Autopilot state: Show "Handled." card
  if (decision.autopilot === true) {
    return (
      <HandledCard
        decisionTimestamp={decisionTimestamp}
        onUndo={onUndo}
        onDinnerChanged={onDinnerChanged}
      />
    );
  }
  
  // Normal state: Show decision with Approve/Reject
  return (
    <NormalDecisionCard
      decision={decision}
      onApprove={onApprove}
      onReject={onReject}
    />
  );
}

/**
 * Main Decision OS Screen Component
 */
export default function DecisionOSScreen(): React.ReactElement {
  const [decision, setDecision] = useState<DecisionResponse | null>(null);
  const [decisionTimestamp, setDecisionTimestamp] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  
  /**
   * Fetches the current decision from the API
   */
  const fetchDecision = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/decision-os/decision');
      const data = await response.json() as DecisionResponse;
      setDecision(data);
      setDecisionTimestamp(Date.now());
    } catch (error) {
      console.error('Failed to fetch decision:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  /**
   * Sends feedback to the API
   */
  const sendFeedback = useCallback(async (
    userAction: 'approved' | 'rejected' | 'undo',
    reason?: string
  ) => {
    if (!decision?.decisionEventId) return;
    
    try {
      await fetch('/api/decision-os/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: decision.decisionEventId,
          userAction,
          ...(reason && { modifiedPayload: { reason } }),
        }),
      });
      
      // After feedback, refetch to get next decision
      await fetchDecision();
    } catch (error) {
      console.error('Failed to send feedback:', error);
    }
  }, [decision, fetchDecision]);
  
  /**
   * Handles approve action
   */
  const handleApprove = useCallback(() => {
    sendFeedback('approved');
  }, [sendFeedback]);
  
  /**
   * Handles reject action
   */
  const handleReject = useCallback(() => {
    sendFeedback('rejected');
  }, [sendFeedback]);
  
  /**
   * Handles undo action (only for autopilot)
   */
  const handleUndo = useCallback(() => {
    sendFeedback('undo');
  }, [sendFeedback]);
  
  /**
   * Handles "Dinner changed" action
   * Triggers DRM endpoint with reason "handle_it"
   */
  const handleDinnerChanged = useCallback(async () => {
    try {
      await fetch('/api/decision-os/drm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'handle_it' }),
      });
      
      // After DRM trigger, refetch decision
      await fetchDecision();
    } catch (error) {
      console.error('Failed to trigger DRM:', error);
    }
  }, [fetchDecision]);
  
  // Fetch decision on mount
  useEffect(() => {
    fetchDecision();
  }, [fetchDecision]);
  
  // Loading state
  if (isLoading && !decision) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }
  
  // No decision available
  if (!decision || decision.decision === null) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>No decisions pending</Text>
      </View>
    );
  }
  
  // Render single decision card (one card only invariant)
  return (
    <View style={styles.container}>
      <DecisionCard
        decision={decision}
        decisionTimestamp={decisionTimestamp}
        onApprove={handleApprove}
        onReject={handleReject}
        onUndo={handleUndo}
        onDinnerChanged={handleDinnerChanged}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  card: {
    width: SCREEN_WIDTH - 40,
    maxWidth: 400,
    backgroundColor: '#fff',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  cardContent: {
    padding: 24,
    alignItems: 'center',
  },
  handledTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  handledSubtitle: {
    fontSize: 18,
    color: '#666',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  message: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  approveButton: {
    backgroundColor: '#22c55e',
  },
  approveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  rejectButton: {
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  rejectButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  undoButton: {
    backgroundColor: '#ef4444',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginBottom: 12,
  },
  undoButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  secondaryButtonText: {
    color: '#666',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
});
