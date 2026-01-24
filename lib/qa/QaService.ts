/**
 * QA Service — Device Testing Utilities
 * 
 * Provides:
 * - Environment info
 * - API interaction logging (last 10 events)
 * - Session reset
 * - Force DRM trigger
 * 
 * Privacy rules:
 * - No PII logged
 * - No payload dumps
 * - Only endpoint + status + timestamp
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// Storage keys
const QA_EVENTS_KEY = '@qa_events';
const QA_SESSION_KEY = '@qa_session_id';
const MAX_EVENTS = 10;

/**
 * QA Event (minimal, no PII)
 */
export interface QaEvent {
  id: string;
  endpoint: string;
  method: 'GET' | 'POST';
  status: number;
  timestamp: string;
  durationMs?: number;
}

/**
 * Environment info for QA panel
 */
export interface QaEnvironment {
  appVariant: string;
  apiBaseUrl: string;
  ffMvpEnabled: boolean;
  buildTime: string;
  version: string;
}

/**
 * Get current environment info
 */
export function getEnvironment(): QaEnvironment {
  return {
    appVariant: process.env.EXPO_PUBLIC_APP_VARIANT || 'unknown',
    apiBaseUrl: process.env.EXPO_PUBLIC_DECISION_OS_BASE_URL || 'not-set',
    ffMvpEnabled: process.env.EXPO_PUBLIC_FF_MVP_ENABLED === 'true',
    buildTime: new Date().toISOString().slice(0, 10),
    version: '1.0.0', // Would come from app.json in real app
  };
}

/**
 * Generate event ID
 */
function generateEventId(): string {
  return `qa-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Log an API event (no PII, minimal data)
 */
export async function logEvent(
  endpoint: string,
  method: 'GET' | 'POST',
  status: number,
  durationMs?: number
): Promise<void> {
  try {
    const events = await getEvents();
    
    const newEvent: QaEvent = {
      id: generateEventId(),
      endpoint: endpoint.replace(/\?.*$/, ''), // Strip query params
      method,
      status,
      timestamp: new Date().toISOString(),
      durationMs,
    };
    
    // Keep only last MAX_EVENTS
    const updated = [newEvent, ...events].slice(0, MAX_EVENTS);
    
    await AsyncStorage.setItem(QA_EVENTS_KEY, JSON.stringify(updated));
  } catch {
    // Fail silently - QA logging should never break the app
  }
}

/**
 * Get logged events
 */
export async function getEvents(): Promise<QaEvent[]> {
  try {
    const stored = await AsyncStorage.getItem(QA_EVENTS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

/**
 * Clear all logged events
 */
export async function clearEvents(): Promise<void> {
  try {
    await AsyncStorage.removeItem(QA_EVENTS_KEY);
  } catch {
    // Fail silently
  }
}

/**
 * Get current session ID (locally stored)
 */
export async function getSessionId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(QA_SESSION_KEY);
  } catch {
    return null;
  }
}

/**
 * Set session ID
 */
export async function setSessionId(sessionId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(QA_SESSION_KEY, sessionId);
  } catch {
    // Fail silently
  }
}

/**
 * Reset session (clears local sessionId only, no DB deletes)
 */
export async function resetSession(): Promise<void> {
  try {
    await AsyncStorage.removeItem(QA_SESSION_KEY);
  } catch {
    // Fail silently
  }
}

/**
 * Force DRM trigger (calls DRM endpoint with explicit_done)
 */
export async function forceDrm(baseUrl: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${baseUrl}/api/decision-os/drm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trigger: 'explicit_done',
      }),
    });
    
    const data = await response.json();
    
    // Log the event
    await logEvent('/api/decision-os/drm', 'POST', response.status);
    
    if (response.status === 200 && data.drmActivated) {
      return { success: true };
    }
    
    return { success: false, error: `status=${response.status}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

/**
 * Check if MVP is enabled (client-side kill switch)
 */
export function isMvpEnabled(): boolean {
  return process.env.EXPO_PUBLIC_FF_MVP_ENABLED === 'true';
}
