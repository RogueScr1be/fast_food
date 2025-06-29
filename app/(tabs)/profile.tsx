import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Settings, MessageCircle, Star, Clock, LogOut } from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

export default function ProfileScreen() {
  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#4A00E0', '#8E2DE2']}
        style={styles.header}
      >
        <View style={styles.profileHeader}>
          <Image
            source={{ uri: 'https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg?auto=compress&cs=tinysrgb&w=200&h=200&dpr=1' }}
            style={styles.profileImage}
          />
          <Text style={styles.profileName}>Alex Johnson</Text>
          <Text style={styles.profileBio}>AI enthusiast & creative thinker</Text>
          
          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>128</Text>
              <Text style={styles.statLabel}>Chats</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>45</Text>
              <Text style={styles.statLabel}>Saved</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>Pro</Text>
              <Text style={styles.statLabel}>Plan</Text>
            </View>
          </View>
        </View>
      </LinearGradient>
      
      <ScrollView style={styles.content}>
        <Animated.View entering={FadeInDown.delay(100).springify()}>
          <Text style={styles.sectionTitle}>Activity</Text>
          <View style={styles.card}>
            <View style={styles.activityItem}>
              <View style={styles.activityIconContainer}>
                <MessageCircle size={20} color="#8A2BE2" />
              </View>
              <View style={styles.activityContent}>
                <Text style={styles.activityTitle}>Recent Conversations</Text>
                <Text style={styles.activitySubtitle}>12 new chats this week</Text>
              </View>
              <TouchableOpacity style={styles.activityButton}>
                <Text style={styles.activityButtonText}>View</Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.divider} />
            
            <View style={styles.activityItem}>
              <View style={styles.activityIconContainer}>
                <Star size={20} color="#8A2BE2" />
              </View>
              <View style={styles.activityContent}>
                <Text style={styles.activityTitle}>Favorite Responses</Text>
                <Text style={styles.activitySubtitle}>8 responses saved</Text>
              </View>
              <TouchableOpacity style={styles.activityButton}>
                <Text style={styles.activityButtonText}>View</Text>
              </TouchableOpacity>
            </View>
            
            <View style={styles.divider} />
            
            <View style={styles.activityItem}>
              <View style={styles.activityIconContainer}>
                <Clock size={20} color="#8A2BE2" />
              </View>
              <View style={styles.activityContent}>
                <Text style={styles.activityTitle}>Usage History</Text>
                <Text style={styles.activitySubtitle}>3.5 hours this month</Text>
              </View>
              <TouchableOpacity style={styles.activityButton}>
                <Text style={styles.activityButtonText}>View</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
        
        <Animated.View entering={FadeInDown.delay(200).springify()}>
          <Text style={styles.sectionTitle}>Subscription</Text>
          <View style={styles.card}>
            <LinearGradient
              colors={['#4A00E0', '#8E2DE2']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.subscriptionCard}
            >
              <View style={styles.subscriptionContent}>
                <View>
                  <Text style={styles.subscriptionTitle}>Pro Plan</Text>
                  <Text style={styles.subscriptionSubtitle}>Unlimited access to all features</Text>
                </View>
                <View style={styles.subscriptionBadge}>
                  <Text style={styles.subscriptionBadgeText}>ACTIVE</Text>
                </View>
              </View>
              
              <View style={styles.subscriptionDetails}>
                <Text style={styles.subscriptionDetail}>• Unlimited conversations</Text>
                <Text style={styles.subscriptionDetail}>• Priority response time</Text>
                <Text style={styles.subscriptionDetail}>• Advanced AI capabilities</Text>
                <Text style={styles.subscriptionDetail}>• No ads</Text>
              </View>
              
              <TouchableOpacity style={styles.subscriptionButton}>
                <Text style={styles.subscriptionButtonText}>Manage Subscription</Text>
              </TouchableOpacity>
            </LinearGradient>
          </View>
        </Animated.View>
        
        <Animated.View entering={FadeInDown.delay(300).springify()}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.card}>
            <TouchableOpacity style={styles.accountOption}>
              <Settings size={20} color="#333" />
              <Text style={styles.accountOptionText}>Settings</Text>
            </TouchableOpacity>
            
            <View style={styles.divider} />
            
            <TouchableOpacity style={styles.accountOption}>
              <LogOut size={20} color="#333" />
              <Text style={styles.accountOptionText}>Log Out</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
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
    paddingBottom: 30,
  },
  profileHeader: {
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  profileImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: '#FFF',
    marginBottom: 16,
  },
  profileName: {
    fontSize: 24,
    fontFamily: 'Inter-Bold',
    color: '#FFF',
    marginBottom: 4,
  },
  profileBio: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 20,
    textAlign: 'center',
  },
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    width: '100%',
    justifyContent: 'space-between',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    color: '#FFF',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: 'rgba(255, 255, 255, 0.8)',
  },
  statDivider: {
    width: 1,
    height: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    color: '#333',
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  activityIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(138, 43, 226, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  activityContent: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#333',
    marginBottom: 2,
  },
  activitySubtitle: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#666',
  },
  activityButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(138, 43, 226, 0.1)',
  },
  activityButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#8A2BE2',
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E5E5',
    marginVertical: 8,
  },
  subscriptionCard: {
    borderRadius: 12,
    padding: 20,
  },
  subscriptionContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  subscriptionTitle: {
    fontSize: 20,
    fontFamily: 'Inter-Bold',
    color: '#FFF',
    marginBottom: 4,
  },
  subscriptionSubtitle: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: 'rgba(255, 255, 255, 0.8)',
  },
  subscriptionBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  subscriptionBadgeText: {
    fontSize: 12,
    fontFamily: 'Inter-Bold',
    color: '#FFF',
  },
  subscriptionDetails: {
    marginBottom: 20,
  },
  subscriptionDetail: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 6,
  },
  subscriptionButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: 12,
    borderRadius: 25,
    alignItems: 'center',
  },
  subscriptionButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#FFF',
  },
  accountOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
  },
  accountOptionText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#333',
    marginLeft: 12,
  },
});