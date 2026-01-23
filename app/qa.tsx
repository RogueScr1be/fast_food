/**
 * QA Panel — Hidden Device Testing Screen
 * 
 * Access via long-press on app title in Tonight screen (2 seconds)
 * 
 * Features:
 * - Show current environment (API URL, build profile, household_key)
 * - One-tap "Force DRM" → calls DRM endpoint with explicit_done
 * - One-tap "Reset session" → clears local sessionId only
 * - View last 10 API events (endpoint + status + timestamp)
 * 
 * Privacy:
 * - No PII displayed
 * - No payload dumps
 * - Minimal debug info
 * 
 * UX:
 * - Full modal screen (not overlay)
 * - Does not violate MVP UI laws for normal users
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { X, Zap, RefreshCw, Trash2, Clock } from 'lucide-react-native';
import {
  getEnvironment,
  getEvents,
  clearEvents,
  resetSession,
  forceDrm,
  type QaEvent,
  type QaEnvironment,
} from '../lib/qa/QaService';

export default function QaPanel() {
  const [env, setEnv] = useState<QaEnvironment | null>(null);
  const [events, setEvents] = useState<QaEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Load environment and events on mount
  useEffect(() => {
    setEnv(getEnvironment());
    loadEvents();
  }, []);
  
  const loadEvents = useCallback(async () => {
    const loaded = await getEvents();
    setEvents(loaded);
  }, []);
  
  // Handle Force DRM
  const handleForceDrm = useCallback(async () => {
    if (!env?.apiBaseUrl || env.apiBaseUrl === 'not-set') {
      Alert.alert('Error', 'API base URL not configured');
      return;
    }
    
    setIsLoading(true);
    try {
      const result = await forceDrm(env.apiBaseUrl);
      
      if (result.success) {
        Alert.alert('DRM Triggered', 'Navigating to rescue screen...', [
          {
            text: 'OK',
            onPress: () => {
              router.replace({
                pathname: '/rescue',
                params: { reason: 'explicit_done' },
              });
            },
          },
        ]);
      } else {
        Alert.alert('DRM Failed', result.error || 'Unknown error');
      }
      
      await loadEvents();
    } finally {
      setIsLoading(false);
    }
  }, [env, loadEvents]);
  
  // Handle Reset Session
  const handleResetSession = useCallback(async () => {
    await resetSession();
    Alert.alert('Session Reset', 'Local session ID cleared');
    await loadEvents();
  }, [loadEvents]);
  
  // Handle Clear Events
  const handleClearEvents = useCallback(async () => {
    await clearEvents();
    setEvents([]);
  }, []);
  
  // Handle Close
  const handleClose = useCallback(() => {
    router.back();
  }, []);
  
  // Format timestamp for display
  const formatTime = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };
  
  // Get status color
  const getStatusColor = (status: number): string => {
    if (status >= 200 && status < 300) return '#4CAF50';
    if (status >= 400 && status < 500) return '#FF9800';
    return '#F44336';
  };
  
  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>QA Panel</Text>
        <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
          <X size={24} color="#333" />
        </TouchableOpacity>
      </View>
      
      <ScrollView style={styles.content}>
        {/* Environment Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Environment</Text>
          <View style={styles.infoCard}>
            <InfoRow label="Variant" value={env?.appVariant || '...'} />
            <InfoRow label="API URL" value={env?.apiBaseUrl || '...'} mono />
            <InfoRow label="MVP Enabled" value={env?.ffMvpEnabled ? 'YES' : 'NO'} />
            <InfoRow label="Version" value={env?.version || '...'} />
          </View>
        </View>
        
        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actions}>
            <ActionButton
              icon={<Zap size={20} color="#FFF" />}
              label="Force DRM"
              onPress={handleForceDrm}
              color="#FF6B35"
              disabled={isLoading}
            />
            <ActionButton
              icon={<RefreshCw size={20} color="#FFF" />}
              label="Reset Session"
              onPress={handleResetSession}
              color="#2196F3"
              disabled={isLoading}
            />
          </View>
        </View>
        
        {/* Event Log */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Last {MAX_EVENTS} Events</Text>
            <TouchableOpacity onPress={handleClearEvents}>
              <Trash2 size={18} color="#999" />
            </TouchableOpacity>
          </View>
          
          {events.length === 0 ? (
            <Text style={styles.emptyText}>No events recorded</Text>
          ) : (
            <View style={styles.eventList}>
              {events.map((event) => (
                <View key={event.id} style={styles.eventItem}>
                  <View style={styles.eventLeft}>
                    <Clock size={14} color="#999" />
                    <Text style={styles.eventTime}>{formatTime(event.timestamp)}</Text>
                  </View>
                  <Text style={styles.eventMethod}>{event.method}</Text>
                  <Text style={styles.eventEndpoint} numberOfLines={1}>
                    {event.endpoint}
                  </Text>
                  <View style={[styles.eventStatus, { backgroundColor: getStatusColor(event.status) }]}>
                    <Text style={styles.eventStatusText}>{event.status}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
        
        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            For internal testing only. No PII logged.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// =============================================================================
// SUBCOMPONENTS
// =============================================================================

const MAX_EVENTS = 10;

interface InfoRowProps {
  label: string;
  value: string;
  mono?: boolean;
}

function InfoRow({ label, value, mono }: InfoRowProps) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, mono && styles.infoMono]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

interface ActionButtonProps {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  color: string;
  disabled?: boolean;
}

function ActionButton({ icon, label, onPress, color, disabled }: ActionButtonProps) {
  return (
    <TouchableOpacity
      style={[styles.actionButton, { backgroundColor: color }, disabled && styles.actionDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      {icon}
      <Text style={styles.actionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

// =============================================================================
// STYLES
// =============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
  },
  closeButton: {
    padding: 8,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  infoCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    maxWidth: '60%',
  },
  infoMono: {
    fontFamily: 'monospace',
    fontSize: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
  },
  actionDisabled: {
    opacity: 0.5,
  },
  eventList: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    overflow: 'hidden',
  },
  eventItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    gap: 8,
  },
  eventLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  eventTime: {
    fontSize: 12,
    color: '#999',
    fontFamily: 'monospace',
  },
  eventMethod: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
    backgroundColor: '#F0F0F0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  eventEndpoint: {
    flex: 1,
    fontSize: 12,
    color: '#333',
    fontFamily: 'monospace',
  },
  eventStatus: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  eventStatusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFF',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    paddingVertical: 24,
  },
  footer: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#999',
  },
});
