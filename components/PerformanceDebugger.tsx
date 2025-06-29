import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { usePerformanceMonitor } from '@/hooks/usePerformanceMonitor';

const PerformanceDebugger: React.FC = () => {
  const { getMetrics } = usePerformanceMonitor();
  const [isVisible, setIsVisible] = useState(__DEV__);
  const [metrics, setMetrics] = useState<any>({});

  useEffect(() => {
    if (!__DEV__) return;

    const interval = setInterval(() => {
      setMetrics(getMetrics());
    }, 1000);

    return () => clearInterval(interval);
  }, [getMetrics]);

  if (!isVisible || !__DEV__) return null;

  const formatTime = (ms?: number) => {
    if (!ms) return 'N/A';
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
  };

  const getPerformanceColor = (time?: number) => {
    if (!time) return '#999';
    if (time <= 1000) return '#28A745'; // Green - Good
    if (time <= 3000) return '#FFC107'; // Yellow - Warning
    return '#DC3545'; // Red - Poor
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity 
        style={styles.header}
        onPress={() => setIsVisible(!isVisible)}
      >
        <Text style={styles.headerText}>⚡ Performance</Text>
      </TouchableOpacity>
      
      <View style={styles.content}>
        <View style={styles.metric}>
          <Text style={styles.label}>Time to Interactive:</Text>
          <Text style={[
            styles.value, 
            { color: getPerformanceColor(metrics.timeToInteractive) }
          ]}>
            {formatTime(metrics.timeToInteractive)}
          </Text>
        </View>

        <View style={styles.metric}>
          <Text style={styles.label}>Time to Magic Moment:</Text>
          <Text style={[
            styles.value, 
            { color: getPerformanceColor(metrics.timeToMagicMoment) }
          ]}>
            {formatTime(metrics.timeToMagicMoment)}
          </Text>
        </View>

        <View style={styles.metric}>
          <Text style={styles.label}>Last API Response:</Text>
          <Text style={[
            styles.value, 
            { color: getPerformanceColor(metrics.apiResponseTime) }
          ]}>
            {formatTime(metrics.apiResponseTime)}
          </Text>
        </View>

        {metrics.timeToMagicMoment > 180000 && (
          <View style={styles.warning}>
            <Text style={styles.warningText}>
              ⚠️ Magic moment exceeded 180s target!
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 100,
    right: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderRadius: 8,
    padding: 10,
    minWidth: 200,
    zIndex: 1000,
  },
  header: {
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    marginBottom: 8,
  },
  headerText: {
    color: '#FFF',
    fontSize: 14,
    fontFamily: 'Inter-Bold',
  },
  content: {
    gap: 4,
  },
  metric: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    color: '#CCC',
    fontSize: 12,
    fontFamily: 'Inter-Regular',
  },
  value: {
    color: '#FFF',
    fontSize: 12,
    fontFamily: 'Inter-Bold',
  },
  warning: {
    marginTop: 8,
    padding: 6,
    backgroundColor: 'rgba(220, 53, 69, 0.2)',
    borderRadius: 4,
  },
  warningText: {
    color: '#FF6B6B',
    fontSize: 11,
    fontFamily: 'Inter-SemiBold',
    textAlign: 'center',
  },
});

export default PerformanceDebugger;