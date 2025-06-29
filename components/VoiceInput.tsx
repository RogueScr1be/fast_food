import React, { useState, useEffect } from 'react';
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

interface VoiceInputProps {
  onResult: (text: string) => void;
  onError?: (error: string) => void;
  placeholder?: string;
  autoStart?: boolean;
}

const VoiceInput: React.FC<VoiceInputProps> = ({
  onResult,
  onError,
  placeholder = "Tap to speak",
  autoStart = false,
}) => {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const pulseAnim = useState(new Animated.Value(1))[0];
  const successAnim = useState(new Animated.Value(0))[0];

  useEffect(() => {
    // Auto-start if requested
    if (autoStart) {
      setTimeout(() => startListening(), 1000);
    }
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
      setIsListening(true);
      setError(null);
      setTranscript('');
      setIsSuccess(false);
      startPulseAnimation();
      
      // Simulate voice recognition
      setTimeout(() => {
        const mockTranscripts = [
          "Yes, let's get started!",
          "Two adults and one kid",
          "We love tacos, pasta, and stir fry",
          "No allergies, we eat everything",
          "Thirty minutes max, eight dollars per serving",
          "Skip cooking on Fridays",
          "Feed us something quick and healthy tonight",
          "Show me Italian recipes",
          "What can I make with chicken?",
          "I need vegetarian options"
        ];
        
        const randomTranscript = mockTranscripts[Math.floor(Math.random() * mockTranscripts.length)];
        setTranscript(randomTranscript);
        
        // Simulate processing
        setIsProcessing(true);
        stopPulseAnimation();
        
        setTimeout(() => {
          setIsProcessing(false);
          setIsListening(false);
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
          
          onResult(randomTranscript);
          
          // Clear transcript after success animation
          setTimeout(() => {
            setTranscript('');
            setIsSuccess(false);
          }, 2000);
        }, 800);
      }, 2000);
    } catch (err) {
      setError('Failed to start voice recognition');
      setIsListening(false);
      stopPulseAnimation();
      onError?.('Failed to start voice recognition');
    }
  };

  const stopListening = () => {
    setIsListening(false);
    stopPulseAnimation();
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
    return ['#4A00E0', '#8E2DE2'];
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
      {transcript && (
        <Animated.View 
          style={[
            styles.transcriptContainer,
            { opacity: successAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.8] }) }
          ]}
        >
          <Text style={styles.transcriptText}>"{transcript}"</Text>
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
    shadowColor: '#4A00E0',
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
    color: '#FFF',
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
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 15,
    padding: 15,
    maxWidth: 320,
    marginTop: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  transcriptText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#FFF',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  tipsContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
    padding: 15,
    maxWidth: 280,
    marginTop: 10,
  },
  tipsTitle: {
    fontSize: 14,
    fontFamily: 'Inter-Bold',
    color: '#FFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  tipText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#FFF',
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