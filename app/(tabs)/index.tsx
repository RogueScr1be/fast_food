import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MessageCircle, Sparkles, Zap, Brain, Lightbulb } from 'lucide-react-native';
import { router } from 'expo-router';

export default function HomeScreen() {
  const recentChats = [
    {
      id: '1',
      name: 'Creative Assistant',
      avatar: 'https://images.pexels.com/photos/1629236/pexels-photo-1629236.jpeg?auto=compress&cs=tinysrgb&w=100&h=100&dpr=1',
      lastMessage: 'I can help you brainstorm creative ideas for your project',
      time: '2m ago',
    },
    {
      id: '2',
      name: 'Productivity Coach',
      avatar: 'https://images.pexels.com/photos/614810/pexels-photo-614810.jpeg?auto=compress&cs=tinysrgb&w=100&h=100&dpr=1',
      lastMessage: 'Let\'s review your goals for this week',
      time: '1h ago',
    },
    {
      id: '3',
      name: 'Wellness Guide',
      avatar: 'https://images.pexels.com/photos/415829/pexels-photo-415829.jpeg?auto=compress&cs=tinysrgb&w=100&h=100&dpr=1',
      lastMessage: 'Remember to take breaks and stay hydrated!',
      time: '3h ago',
    },
  ];

  const handleChatPress = () => {
    router.push('/(tabs)/chat');
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#4A00E0', '#8E2DE2']}
        style={styles.header}
      >
        <Text style={styles.headerTitle}>Magical Chat</Text>
        <Text style={styles.headerSubtitle}>Your AI companion</Text>
      </LinearGradient>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <TouchableOpacity 
            style={styles.newChatButton}
            onPress={handleChatPress}
          >
            <LinearGradient
              colors={['#4A00E0', '#8E2DE2']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.newChatGradient}
            >
              <MessageCircle size={24} color="#FFF" />
              <Text style={styles.newChatText}>Start New Chat</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Recent Chats</Text>
        
        {recentChats.map((chat) => (
          <View key={chat.id} style={styles.card}>
            <TouchableOpacity 
              style={styles.chatItem}
              onPress={handleChatPress}
            >
              <Image source={{ uri: chat.avatar }} style={styles.avatar} />
              <View style={styles.chatInfo}>
                <View style={styles.chatHeader}>
                  <Text style={styles.chatName}>{chat.name}</Text>
                  <Text style={styles.chatTime}>{chat.time}</Text>
                </View>
                <Text style={styles.chatMessage} numberOfLines={1}>
                  {chat.lastMessage}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        ))}

        <Text style={styles.sectionTitle}>Discover</Text>
        
        <View style={styles.featuresGrid}>
          <View style={styles.featureCard}>
            <LinearGradient
              colors={['#FF416C', '#FF4B2B']}
              style={styles.featureIconContainer}
            >
              <Sparkles size={24} color="#FFF" />
            </LinearGradient>
            <Text style={styles.featureTitle}>Creative Writing</Text>
            <Text style={styles.featureDescription}>
              Generate stories, poems, and creative content
            </Text>
          </View>
          
          <View style={styles.featureCard}>
            <LinearGradient
              colors={['#11998e', '#38ef7d']}
              style={styles.featureIconContainer}
            >
              <Zap size={24} color="#FFF" />
            </LinearGradient>
            <Text style={styles.featureTitle}>Quick Answers</Text>
            <Text style={styles.featureDescription}>
              Get instant responses to your questions
            </Text>
          </View>
          
          <View style={styles.featureCard}>
            <LinearGradient
              colors={['#4A00E0', '#8E2DE2']}
              style={styles.featureIconContainer}
            >
              <Brain size={24} color="#FFF" />
            </LinearGradient>
            <Text style={styles.featureTitle}>Knowledge Base</Text>
            <Text style={styles.featureDescription}>
              Access a vast database of information
            </Text>
          </View>
          
          <View style={styles.featureCard}>
            <LinearGradient
              colors={['#F857A6', '#FF5858']}
              style={styles.featureIconContainer}
            >
              <Lightbulb size={24} color="#FFF" />
            </LinearGradient>
            <Text style={styles.featureTitle}>Smart Suggestions</Text>
            <Text style={styles.featureDescription}>
              Get personalized recommendations
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: 'Inter-Bold',
    color: '#FFF',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: 'rgba(255, 255, 255, 0.8)',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    marginBottom: 16,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  newChatButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  newChatGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 10,
  },
  newChatText: {
    color: '#FFF',
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    color: '#333',
    marginTop: 8,
    marginBottom: 16,
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  chatInfo: {
    flex: 1,
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  chatName: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#333',
  },
  chatTime: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#999',
  },
  chatMessage: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#666',
  },
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  featureCard: {
    width: '48%',
    backgroundColor: '#FFF',
    borderRadius: 16,
    marginBottom: 16,
    padding: 16,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  featureIconContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  featureTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  featureDescription: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#666',
    textAlign: 'center',
  },
});