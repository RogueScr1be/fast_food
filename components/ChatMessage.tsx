import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Heart, Plus } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

const { width } = Dimensions.get('window');

interface ChatMessageProps {
  message: {
    id: number;
    text: string;
    isUser: boolean;
    type?: string;
    temp?: number;
    condition?: string;
    location?: string;
  };
  onLike: (id: number) => void;
  showLikeButton?: boolean;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ 
  message, 
  onLike, 
  showLikeButton = true 
}) => {
  const scale = useSharedValue(0.8);
  const opacity = useSharedValue(0);
  
  useEffect(() => {
    scale.value = withSpring(1, { damping: 12 });
    opacity.value = withTiming(1, { duration: 300 });
  }, []);
  
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));
  
  // Special rendering for weather info
  if (message.type === 'weather') {
    return (
      <Animated.View 
        style={[
          styles.messageBubble, 
          styles.aiMessageBubble,
          { padding: 0, overflow: 'hidden' },
          animatedStyle
        ]}
      >
        <LinearGradient
          colors={['#4A00E0', '#8E2DE2']}
          style={styles.weatherContainer}
        >
          <View style={styles.weatherContent}>
            <Text style={styles.weatherTemp}>{message.temp}°</Text>
            <View style={styles.weatherDetails}>
              <Text style={styles.weatherCondition}>{message.condition}</Text>
              <Text style={styles.weatherLocation}>{message.location}</Text>
            </View>
          </View>
          <View style={styles.weatherRainAnimation}>
            {Array(20).fill(0).map((_, i) => (
              <View 
                key={i} 
                style={[
                  styles.raindrop,
                  {
                    left: Math.random() * width * 0.7,
                    top: Math.random() * 60,
                    height: 5 + Math.random() * 10
                  }
                ]} 
              />
            ))}
          </View>
        </LinearGradient>
        <Text style={[styles.messageText, styles.aiMessageText, { padding: 15 }]}>
          {message.text}
        </Text>
        {showLikeButton && (
          <View style={styles.messageActions}>
            <TouchableOpacity style={styles.likeButton} onPress={() => onLike(message.id)}>
              <Heart size={16} color="#8A2BE2" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.likeButton}>
              <Plus size={16} color="#8A2BE2" />
            </TouchableOpacity>
          </View>
        )}
      </Animated.View>
    );
  }
  
  return (
    <Animated.View 
      style={[
        styles.messageBubble, 
        message.isUser ? styles.userMessageBubble : styles.aiMessageBubble,
        animatedStyle
      ]}
    >
      <Text style={[styles.messageText, message.isUser ? styles.userMessageText : styles.aiMessageText]}>
        {message.text}
      </Text>
      {!message.isUser && showLikeButton && (
        <View style={styles.messageActions}>
          <TouchableOpacity style={styles.likeButton} onPress={() => onLike(message.id)}>
            <Heart size={16} color="#8A2BE2" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.likeButton}>
            <Plus size={16} color="#8A2BE2" />
          </TouchableOpacity>
        </View>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  messageBubble: {
    maxWidth: '80%',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  userMessageBubble: {
    backgroundColor: '#FFFFFF',
    borderBottomRightRadius: 4,
  },
  aiMessageBubble: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  userMessageText: {
    color: '#333',
    fontFamily: 'Inter-Regular',
  },
  aiMessageText: {
    color: '#333',
    fontFamily: 'Inter-Regular',
  },
  messageActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
    gap: 8,
  },
  likeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  weatherContainer: {
    padding: 15,
    width: '100%',
  },
  weatherContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  weatherTemp: {
    fontSize: 48,
    fontFamily: 'Inter-Bold',
    color: '#FFF',
    marginRight: 15,
  },
  weatherDetails: {
    flex: 1,
  },
  weatherCondition: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: '#FFF',
  },
  weatherLocation: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: 'rgba(255, 255, 255, 0.8)',
  },
  weatherRainAnimation: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  raindrop: {
    position: 'absolute',
    width: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    borderRadius: 1,
  },
});

export default ChatMessage;