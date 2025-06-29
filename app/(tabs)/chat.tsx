import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Send, Heart, Plus, Sparkles } from 'lucide-react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  withDelay,
  Easing,
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';

const { width, height } = Dimensions.get('window');

// Animated message bubble component
const MessageBubble = ({ message, isUser, onLike, showLikeButton = true }) => {
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
                    animationDelay: `${Math.random() * 2}s`,
                    animationDuration: `${0.5 + Math.random()}s`
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
            <TouchableOpacity style={styles.likeButton} onPress={onLike}>
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
        isUser ? styles.userMessageBubble : styles.aiMessageBubble,
        animatedStyle
      ]}
    >
      <Text style={[styles.messageText, isUser ? styles.userMessageText : styles.aiMessageText]}>
        {message.text}
      </Text>
      {!isUser && showLikeButton && (
        <View style={styles.messageActions}>
          <TouchableOpacity style={styles.likeButton} onPress={onLike}>
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

// Magical particles effect component
const MagicalParticles = ({ active }) => {
  const particles = Array(20).fill(0).map((_, i) => ({
    id: i,
    size: Math.random() * 4 + 2,
    x: Math.random() * width,
    y: Math.random() * height,
    duration: 1000 + Math.random() * 2000,
    delay: Math.random() * 1000,
  }));
  
  if (!active) return null;
  
  return (
    <View style={styles.particlesContainer}>
      {particles.map(particle => (
        <Animated.View
          key={particle.id}
          entering={FadeIn.delay(particle.delay).duration(particle.duration)}
          exiting={FadeOut.duration(particle.duration)}
          style={[
            styles.particle,
            {
              width: particle.size,
              height: particle.size,
              left: particle.x,
              top: particle.y,
            }
          ]}
        />
      ))}
    </View>
  );
};

export default function ChatScreen() {
  const [messages, setMessages] = useState([
    { id: 1, text: "I'm feeling burned out. Any suggestions for recharging?", isUser: true },
    { id: 2, text: "How about a rejuvenating walk outside? It's a great way to refresh your mind and uplift your spirits.", isUser: false },
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showParticles, setShowParticles] = useState(false);
  const scrollViewRef = useRef(null);
  
  // Simulate AI typing
  const simulateTyping = (text) => {
    setIsTyping(true);
    
    // Show magical particles during typing
    setShowParticles(true);
    
    setTimeout(() => {
      setIsTyping(false);
      setShowParticles(false);
      
      // Add AI response
      const newMessage = {
        id: messages.length + 2,
        text: text,
        isUser: false,
      };
      setMessages(prev => [...prev, newMessage]);
      
      // Scroll to bottom
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }, 1500);
  };
  
  // Handle sending a message
  const handleSend = () => {
    if (!inputText.trim()) return;
    
    // Add user message
    const newMessage = {
      id: messages.length + 1,
      text: inputText,
      isUser: true,
    };
    setMessages(prev => [...prev, newMessage]);
    setInputText('');
    
    // Scroll to bottom
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
    
    // Process user message
    if (inputText.toLowerCase().includes('weather')) {
      setTimeout(() => {
        setIsTyping(true);
        setShowParticles(true);
        
        setTimeout(() => {
          setIsTyping(false);
          setShowParticles(false);
          
          // Add weather response
          const weatherMessage = {
            id: messages.length + 2,
            type: 'weather',
            temp: 22,
            condition: 'Rain Showers',
            location: 'San Francisco',
            text: 'It will rain in 1 hour, I recommend taking an umbrella',
            isUser: false,
          };
          setMessages(prev => [...prev, weatherMessage]);
          
          // Scroll to bottom
          setTimeout(() => {
            scrollViewRef.current?.scrollToEnd({ animated: true });
          }, 100);
        }, 1500);
      }, 500);
    } else {
      // Generate a response based on the input
      let response = "I'm here to help! What else would you like to know?";
      
      if (inputText.toLowerCase().includes('tired') || inputText.toLowerCase().includes('sleep')) {
        response = "Getting quality sleep is essential. Try to maintain a consistent sleep schedule and create a relaxing bedtime routine.";
      } else if (inputText.toLowerCase().includes('stress') || inputText.toLowerCase().includes('anxious')) {
        response = "Deep breathing exercises can help reduce stress. Try inhaling for 4 counts, holding for 4, and exhaling for 6.";
      } else if (inputText.toLowerCase().includes('food') || inputText.toLowerCase().includes('eat')) {
        response = "Nourishing your body with healthy foods can boost your energy. Try incorporating more fruits, vegetables, and whole grains into your diet.";
      }
      
      setTimeout(() => {
        simulateTyping(response);
      }, 500);
    }
  };
  
  // Handle liking a message
  const handleLike = (messageId) => {
    // In a real app, this would send the like to a server
    console.log('Liked message:', messageId);
  };
  
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <LinearGradient
        colors={['#4A00E0', '#8E2DE2']}
        style={styles.header}
      >
        <View style={styles.profileContainer}>
          <View style={styles.profileImageContainer}>
            <Image
              source={{ uri: 'https://images.pexels.com/photos/1629236/pexels-photo-1629236.jpeg?auto=compress&cs=tinysrgb&w=100&h=100&dpr=1' }}
              style={styles.profileImage}
            />
            <View style={styles.statusIndicator} />
          </View>
          <View>
            <Text style={styles.profileName}>Friend</Text>
            <Text style={styles.profileStatus}>Online</Text>
          </View>
        </View>
      </LinearGradient>
      
      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.map(message => (
          <View 
            key={message.id} 
            style={[
              styles.messageRow,
              message.isUser ? styles.userMessageRow : styles.aiMessageRow
            ]}
          >
            <MessageBubble 
              message={message} 
              isUser={message.isUser} 
              onLike={() => handleLike(message.id)}
            />
          </View>
        ))}
        
        {isTyping && (
          <View style={styles.messageRow}>
            <Animated.View 
              entering={FadeIn.duration(300)}
              style={[styles.messageBubble, styles.aiMessageBubble, styles.typingBubble]}
            >
              <View style={styles.typingIndicator}>
                <View style={styles.typingDot} />
                <View style={[styles.typingDot, { animationDelay: '0.2s' }]} />
                <View style={[styles.typingDot, { animationDelay: '0.4s' }]} />
              </View>
            </Animated.View>
          </View>
        )}
      </ScrollView>
      
      <MagicalParticles active={showParticles} />
      
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Message"
          placeholderTextColor="#999"
          value={inputText}
          onChangeText={setInputText}
          multiline
        />
        <TouchableOpacity 
          style={styles.sendButton} 
          onPress={handleSend}
          disabled={!inputText.trim()}
        >
          <LinearGradient
            colors={['#4A00E0', '#8E2DE2']}
            style={styles.sendButtonGradient}
          >
            <Send size={20} color="#FFF" />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 15,
    paddingHorizontal: 20,
  },
  profileContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileImageContainer: {
    position: 'relative',
    marginRight: 12,
  },
  profileImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  statusIndicator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4CD964',
    borderWidth: 2,
    borderColor: '#4A00E0',
  },
  profileName: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    color: '#FFF',
  },
  profileStatus: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: 'rgba(255, 255, 255, 0.7)',
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    paddingBottom: 20,
  },
  messageRow: {
    marginBottom: 16,
    flexDirection: 'row',
  },
  userMessageRow: {
    justifyContent: 'flex-end',
  },
  aiMessageRow: {
    justifyContent: 'flex-start',
  },
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
    backgroundColor: '#8A2BE2',
    borderBottomRightRadius: 4,
  },
  aiMessageBubble: {
    backgroundColor: '#F0F0F0',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  userMessageText: {
    color: '#FFF',
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
  },
  typingBubble: {
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#8A2BE2',
    opacity: 0.7,
    animationName: 'bounce',
    animationDuration: '0.6s',
    animationIterationCount: 'infinite',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
  },
  input: {
    flex: 1,
    backgroundColor: '#F0F0F0',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxHeight: 100,
    fontSize: 16,
    fontFamily: 'Inter-Regular',
  },
  sendButton: {
    marginLeft: 12,
  },
  sendButtonGradient: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
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
    height: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
    borderRadius: 1,
    animationName: 'rain',
    animationDuration: '1s',
    animationIterationCount: 'infinite',
    animationTimingFunction: 'linear',
  },
  particlesContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
  },
  particle: {
    position: 'absolute',
    backgroundColor: '#8A2BE2',
    borderRadius: 50,
    opacity: 0.6,
  },
});