import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  Platform,
  Animated,
} from 'react-native';
import { Mic, Volume2, Loader, Check, AlertCircle } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import VoiceService from '@/services/VoiceService';
import IntentParser from '@/services/IntentParser';

interface VoiceInputProps {
  onResult: (text: string, intent?: any) => void;
  onError?: (error: string) => void;
  placeholder?: string;
  autoStart?: boolean;
  showTranscript?: boolean;
}

const VoiceInput: React.FC<VoiceInputProps> = ({
  onResult,
  onError,
  placeholder = "Tap to speak",
  autoStart = false,
  showTranscript = true
}) => {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confidence, setConfidence] = useState(0);
  const [isSuccess, setIsSuccess] = useState(false);

  const voiceService = useRef(new VoiceService()).current;
  const intentParser = useRef(new IntentParser()).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const successAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Setup voice service callbacks
    voiceService.onStart(() => {
      setIsListening(true);
      setError(null);
      setTranscript('');
      setIsSuccess(false);
      startPulseAnimation();
    });

    voiceService.onResult((result) => {
      setTranscript(result.transcript);
      setConfidence(result.confidence);

      if (result.isFinal) {
        setIsProcessing(true);
        
        // Parse intent
        const intent = intentParser.parse(result.transcript);
        
        setTimeout(() => {
          setIsProcessing(false);
          setIsSuccess(true);
          
          // Success animation
          Animated.sequence([
            Animated.timing(successAnim, {
              toValue: 1,
              duration: 300,
              useNativeDriver: true,
            }),
            Animated.delay(1000),
            Animated.timing(successAnim, {
              toValue: 0,
              duration: 300,
              useNativeDriver: true,
            })
          ]).start();

          onResult(result.transcript, intent);
          
          // Clear transcript after success animation
          setTimeout(() => {
            setTranscript('');
            setIsSuccess(false);
          }, 2000);
        }, 800);
      }
    });

    voiceService.onError((errorMsg) => {
      setError(errorMsg);
      setIsListening(false);
      setIsProcessing(false);
      onError?.(errorMsg);
      stopPulseAnimation();
      
      // Clear error after 3 seconds
      setTimeout(() => setError(null), 3000);
    });

    voiceService.onEnd(() => {
      setIsListening(false);
      stopPulseAnimation();
    });

    // Auto-start if requested
    if (autoStart) {
      setTimeout(() => startListening(), 1000);
    }

    return () => {
      voiceService.stopListening();
    };
  }, []);

  const startPulseAnimation = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const stopPulseAnimation = () => {
    pulseAnim.stopAnimation();
    Animated.timing(pulseAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  };

  const startListening = async () => {
    try {
      await voiceService.startListening();
    } catch (err) {
      setError('Failed to start voice recognition');
      onError?.('Failed to start voice recognition');
    }
  };

  const stopListening = () => {
    voiceService.stopListening();
  };

  const handlePress = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const getButtonIcon = () => {
    if (isSuccess) return <Check size={30} color="#FFF" />;
    if (error) return <AlertCircle size={30} color="#FFF" />;
    if (isProcessing) return <Loader size={30} color="#FFF" />;
    if (isListening) return <Volume2 size={30} color="#FFF" />;
    return <Mic size={30} color="#FFF" />;
  };

  const getStatusText = () => {
    if (isSuccess) return '✅ Got it! Processing your request...';
    if (error) return `❌ ${error}`;
    if (isProcessing) return '🤖 Understanding your request...';
    if (isListening) return '👂 Listening... Tap to stop';
    return placeholder;
  };

  const getButtonColors = () => {
    if (isSuccess) return ['#28A745', '#218838'];
    if (error) return ['#DC3545', '#C82333'];
    if (isProcessing) return ['#6C757D', '#5A6268'];
    if (isListening) return ['#28A745', '#218838'];
    return ['#FF6B35', '#F7931E'];
  };

  return (
    <View style={styles.container}>
      {/* Main Voice Button */}
      <Animated.View
        style={[
          styles.buttonContainer,
          {
            transform: [{ scale: pulseAnim }],
          },
        ]}
      >
        <TouchableOpacity
          onPress={handlePress}
          disabled={isProcessing}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={getButtonColors()}
            style={styles.voiceButton}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            {getButtonIcon()}
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>

      {/* Status Text */}
      <Text style={[
        styles.statusText,
        error && styles.errorText,
        isListening && styles.listeningText,
        isSuccess && styles.successText
      ]}>
        {getStatusText()}
      </Text>

      {/* Live Transcript */}
      {showTranscript && transcript && (
        <Animated.View 
          style={[
            styles.transcriptContainer,
            { opacity: successAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.8] }) }
          ]}
        >
          <Text style={styles.transcriptText}>"{transcript}"</Text>
          {confidence > 0 && (
            <View style={styles.confidenceContainer}>
              <View style={styles.confidenceBar}>
                <Animated.View 
                  style={[
                    styles.confidenceFill, 
                    { 
                      width: `${confidence * 100}%`,
                      backgroundColor: confidence > 0.8 ? '#28A745' : confidence > 0.6 ? '#FFC107' : '#DC3545'
                    }
                  ]} 
                />
              </View>
              <Text style={styles.confidenceText}>
                {Math.round(confidence * 100)}% confident
              </Text>
            </View>
          )}
        </Animated.View>
      )}

      {/* Voice Tips */}
      {!isListening && !transcript && !error && (
        <View style={styles.tipsContainer}>
          <Text style={styles.tipsTitle}>💡 Try saying:</Text>
          <Text style={styles.tipText}>"Feed us Italian under $40"</Text>
          <Text style={styles.tipText}>"Quick meals for tonight"</Text>
          <Text style={styles.tipText}>"Show me healthy recipes"</Text>
        </View>
      )}

      {/* Success Overlay */}
      <Animated.View 
        style={[
          styles.successOverlay,
          {
            opacity: successAnim,
            transform: [
              {
                scale: successAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.8, 1],
                })
              }
            ]
          }
        ]}
        pointerEvents="none"
      >
        <Check size={40} color="#28A745" />
        <Text style={styles.successOverlayText}>Perfect!</Text>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 15,
    paddingVertical: 20,
    position: 'relative',
  },
  buttonContainer: {
    elevation: 8,
    shadowColor: '#FF6B35',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    zIndex: 1,
  },
  voiceButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#666',
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 20,
  },
  errorText: {
    color: '#DC3545',
    fontFamily: 'Inter-SemiBold',
  },
  listeningText: {
    color: '#28A745',
    fontFamily: 'Inter-SemiBold',
  },
  successText: {
    color: '#28A745',
    fontFamily: 'Inter-Bold',
  },
  transcriptContainer: {
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
    borderRadius: 15,
    padding: 15,
    maxWidth: 320,
    marginTop: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 53, 0.2)',
  },
  transcriptText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#333',
    textAlign: 'center',
    fontStyle: 'italic',
    marginBottom: 10,
  },
  confidenceContainer: {
    alignItems: 'center',
    gap: 5,
  },
  confidenceBar: {
    width: 120,
    height: 4,
    backgroundColor: '#E5E5E5',
    borderRadius: 2,
    overflow: 'hidden',
  },
  confidenceFill: {
    height: '100%',
    borderRadius: 2,
  },
  confidenceText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#666',
  },
  tipsContainer: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 15,
    maxWidth: 280,
    marginTop: 10,
  },
  tipsTitle: {
    fontSize: 14,
    fontFamily: 'Inter-Bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 8,
  },
  tipText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#666',
    textAlign: 'center',
    marginBottom: 4,
  },
  successOverlay: {
    position: 'absolute',
    top: '50%',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 20,
    elevation: 10,
    shadowColor: '#28A745',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  successOverlayText: {
    fontSize: 16,
    fontFamily: 'Inter-Bold',
    color: '#28A745',
    marginTop: 8,
  },
});

export default VoiceInput;