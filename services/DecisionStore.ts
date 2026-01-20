/**
 * Decision Store - Append-only event storage
 * 
 * This is a prototype in-memory implementation.
 * Production would use PostgreSQL with append-only semantics.
 */

import type { DecisionEvent, Decision, UserAction } from '../types/decision-os';

// Append-only event log
const decisionEvents: DecisionEvent[] = [];

// Sample decisions for prototype
const sampleDecisions: Decision[] = [
  {
    id: 'cook-1',
    type: 'cook',
    title: 'Garlic Butter Pasta',
    estMinutes: 25,
    stepsShort: [
      'Boil pasta (8 min)',
      'Sauté garlic in butter (3 min)',
      'Toss pasta with sauce',
      'Top with parmesan'
    ]
  },
  {
    id: 'zero-cook-1',
    type: 'zero_cook',
    title: 'Greek Salad Bowl',
    estMinutes: 10,
    stepsShort: [
      'Chop cucumber, tomatoes, onion',
      'Add feta and olives',
      'Drizzle olive oil and lemon',
      'Season with oregano'
    ]
  },
  {
    id: 'order-1',
    type: 'order',
    title: 'Chipotle Bowl',
    estMinutes: 30,
    vendor: 'Chipotle',
    deepLinkUrl: 'chipotle://order',
    fallbackUrl: 'https://www.chipotle.com/order'
  }
];

// DRM rescue options (fast fallbacks)
const rescueDecisions: Decision[] = [
  {
    id: 'rescue-order-1',
    type: 'order',
    title: 'DoorDash Delivery',
    estMinutes: 35,
    vendor: 'DoorDash',
    deepLinkUrl: 'doordash://store',
    fallbackUrl: 'https://www.doordash.com'
  },
  {
    id: 'rescue-zero-cook-1',
    type: 'zero_cook',
    title: 'Instant Ramen Upgrade',
    estMinutes: 8,
    stepsShort: [
      'Boil water, cook ramen (3 min)',
      'Add soft-boiled egg',
      'Top with green onions',
      'Drizzle sesame oil'
    ]
  }
];

function generateId(): string {
  return `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function hashContext(nowIso: string, signal?: object): string {
  const data = JSON.stringify({ nowIso: nowIso.slice(0, 10), signal });
  // Simple hash for prototype
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

export const DecisionStore = {
  /**
   * Get a decision based on current context
   * Returns null + drmRecommended if no good option
   */
  getDecision(householdKey: string, nowIso: string, signal?: object): {
    decision: Decision | null;
    drmRecommended: boolean;
    decisionEventId: string;
  } {
    const contextHash = hashContext(nowIso, signal);
    
    // Check recent events to avoid repetition
    const recentEvents = decisionEvents
      .filter(e => e.householdKey === householdKey)
      .slice(-5);
    
    const recentRejections = recentEvents.filter(e => e.userAction === 'rejected');
    
    // If multiple recent rejections, recommend DRM
    if (recentRejections.length >= 2) {
      const eventId = generateId();
      const event: DecisionEvent = {
        id: eventId,
        householdKey,
        decisionPayload: null,
        contextHash,
        userAction: null,
        actionedAt: null,
        createdAt: nowIso,
        drmTriggered: false
      };
      decisionEvents.push(event);
      
      return {
        decision: null,
        drmRecommended: true,
        decisionEventId: eventId
      };
    }
    
    // Pick a decision based on signal
    let decision: Decision;
    if (signal && (signal as any).tired) {
      decision = sampleDecisions.find(d => d.type === 'zero_cook') || sampleDecisions[0];
    } else if (signal && (signal as any).busy) {
      decision = sampleDecisions.find(d => d.type === 'order') || sampleDecisions[0];
    } else {
      // Rotate through options, avoiding recently rejected
      const recentRejectedIds = recentRejections.map(e => e.decisionPayload?.id);
      const available = sampleDecisions.filter(d => !recentRejectedIds.includes(d.id));
      decision = available[Math.floor(Math.random() * available.length)] || sampleDecisions[0];
    }
    
    const eventId = generateId();
    const event: DecisionEvent = {
      id: eventId,
      householdKey,
      decisionPayload: decision,
      contextHash,
      userAction: null,
      actionedAt: null,
      createdAt: nowIso,
      drmTriggered: false
    };
    decisionEvents.push(event);
    
    return {
      decision,
      drmRecommended: false,
      decisionEventId: eventId
    };
  },

  /**
   * Get a rescue decision via DRM
   * Always returns a fast fallback
   */
  getDrmRescue(householdKey: string, nowIso: string, triggerReason: string): {
    rescue: Decision;
    decisionEventId: string;
  } {
    const rescue = rescueDecisions[Math.floor(Math.random() * rescueDecisions.length)];
    
    const eventId = generateId();
    const event: DecisionEvent = {
      id: eventId,
      householdKey,
      decisionPayload: rescue,
      contextHash: hashContext(nowIso),
      userAction: null,
      actionedAt: null,
      createdAt: nowIso,
      drmTriggered: true,
      triggerReason
    };
    decisionEvents.push(event);
    
    return {
      rescue,
      decisionEventId: eventId
    };
  },

  /**
   * Record feedback - APPEND ONLY
   * Creates a new event row instead of updating existing
   */
  recordFeedback(
    householdKey: string,
    eventId: string,
    userAction: UserAction,
    nowIso: string
  ): { recorded: boolean; newEventId: string } {
    // Find original event
    const originalEvent = decisionEvents.find(e => e.id === eventId);
    
    if (!originalEvent) {
      // Still record the feedback as a new event
      const newEventId = generateId();
      const feedbackEvent: DecisionEvent = {
        id: newEventId,
        householdKey,
        decisionPayload: null,
        contextHash: '',
        userAction,
        actionedAt: nowIso,
        createdAt: nowIso,
        drmTriggered: false
      };
      decisionEvents.push(feedbackEvent);
      
      return { recorded: true, newEventId };
    }
    
    // APPEND-ONLY: Create new event with feedback, don't update original
    const newEventId = generateId();
    const feedbackEvent: DecisionEvent = {
      id: newEventId,
      householdKey,
      decisionPayload: originalEvent.decisionPayload,
      contextHash: originalEvent.contextHash,
      userAction,
      actionedAt: nowIso,
      createdAt: nowIso,
      drmTriggered: originalEvent.drmTriggered,
      triggerReason: originalEvent.triggerReason
    };
    decisionEvents.push(feedbackEvent);
    
    return { recorded: true, newEventId };
  },

  /**
   * Get all events (for testing)
   */
  getAllEvents(): DecisionEvent[] {
    return [...decisionEvents];
  },

  /**
   * Clear all events (for testing)
   */
  clearAll(): void {
    decisionEvents.length = 0;
  },

  /**
   * Get event count (for testing append-only behavior)
   */
  getEventCount(): number {
    return decisionEvents.length;
  }
};
