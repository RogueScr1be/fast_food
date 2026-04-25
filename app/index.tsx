import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAudio } from '../lib/hooks/useAudio';
import { useSession } from '../lib/hooks/useSession';
import { useDeterministicRecommendation } from '../lib/hooks/useDeterministicRecommendation';
import { usePackRecommendation } from '../lib/hooks/usePackRecommendation';
import { RecipeCard } from './_components/RecipeCard';
import { PackCard } from './_components/PackCard';
import { GlassCard } from './_components/GlassCard';
import type { Recipe } from '../lib/seeds/recipes';
import { packs, isPackLocked } from '../lib/seeds/packs';
import { audioTracks } from '../lib/seeds/audio';

export default function TonightHub() {
  const router = useRouter();
  const audio = useAudio();
  const session = useSession();
  const [activeTab, setActiveTab] = useState<'mood' | 'packs'>('mood');

  // Get deterministic recommendation based on mood
  const recommendation = useDeterministicRecommendation(
    session.state.userId,
    session.state.selectedMood,
    [] // TODO: Load from acceptance_log (7-day window)
  );

  const handleMoodSelect = (mood: 'tired' | 'celebrating' | 'default') => {
    session.setSelectedMood(mood);
  };

  const handleRecipeSelect = (recipe: Recipe) => {
    session.setSelectedRecipe(recipe.id);
    session.markRecipeAccepted();
    router.push('/deal');
  };

  const handleStartWithoutMood = () => {
    if (recommendation) {
      session.setSelectedRecipe(recommendation.recipeId);
      session.markRecipeAccepted();
      router.push('/deal');
    }
  };

  // Pack selection handler
  const packRecommendation = usePackRecommendation(
    session.state.selectedPackId || '',
    session.state.userId
  );

  const handlePackSelect = async (pack: typeof packs[0]) => {
    session.setSelectedPack(pack.id);

    // Wire pack audio to audio context
    const primaryTrackId = pack.audioTrackIds[0];
    const audioTrack = audioTracks.find(t => t.id === primaryTrackId);
    if (audioTrack) {
      await audio.setTrack(audioTrack, 'pack');
    }
  };

  const handleStartWithPack = () => {
    if (packRecommendation) {
      session.setSelectedRecipe(packRecommendation.recipeId);
      session.markRecipeAccepted();
      router.push('/deal');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header with User Profile & Audio Indicator */}
        <View style={styles.header}>
          <View style={styles.userSection}>
            <Text style={styles.greeting}>Let's get this off your</Text>
            <Text style={styles.greeting}>back, and onto your plate.</Text>
          </View>

          {/* Audio Indicator */}
          <GlassCard style={styles.audioIndicator}>
            <Text style={styles.audioText}>
              ♪ {audio.currentTrack?.name || 'No track'} — {audio.currentTheme}
            </Text>
            <Text style={styles.audioSmall}>
              {audio.isPlaying ? '▶ Playing' : audio.isMuted ? '🔇 Muted' : '⏸ Paused'}
            </Text>
          </GlassCard>
        </View>

        {/* Tab Navigation */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'mood' && styles.activeTab]}
            onPress={() => setActiveTab('mood')}
          >
            <Text style={[styles.tabText, activeTab === 'mood' && styles.activeTabText]}>
              🎭 Mood
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'packs' && styles.activeTab]}
            onPress={() => setActiveTab('packs')}
          >
            <Text style={[styles.tabText, activeTab === 'packs' && styles.activeTabText]}>
              📦 Packs
            </Text>
          </TouchableOpacity>
        </View>

        {/* Mood Tab Content */}
        {activeTab === 'mood' && (
          <View style={styles.content}>
            <Text style={styles.sectionTitle}>Tonight</Text>
            <Text style={styles.sectionSubtitle}>
              Pick a vibe. Get a dinner. Cook what feels right.
            </Text>

            {/* Mood Buttons */}
            <View style={styles.moodButtons}>
              <TouchableOpacity
                style={[
                  styles.moodButton,
                  session.state.selectedMood === 'tired' && styles.moodButtonActive,
                ]}
                onPress={() => handleMoodSelect('tired')}
              >
                <Text style={styles.moodButtonText}>Tired</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.moodButton,
                  session.state.selectedMood === 'celebrating' && styles.moodButtonActive,
                ]}
                onPress={() => handleMoodSelect('celebrating')}
              >
                <Text style={styles.moodButtonText}>Celebrating</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.moodButton,
                  session.state.selectedMood === 'default' && styles.moodButtonActive,
                ]}
                onPress={() => handleMoodSelect('default')}
              >
                <Text style={styles.moodButtonText}>Just Cook</Text>
              </TouchableOpacity>
            </View>

            {/* Recommendation Display */}
            {recommendation && (
              <View style={styles.recommendation}>
                <Text style={styles.recommendedLabel}>RECOMMENDED</Text>
                <Text style={styles.recommendedTitle}>{recommendation.recipeName}</Text>
                <Text style={styles.recommendedWhy}>"{recommendation.why}"</Text>

                <TouchableOpacity
                  style={styles.startButton}
                  onPress={handleStartWithoutMood}
                >
                  <Text style={styles.startButtonText}>Start Cooking</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Packs Tab Content */}
        {activeTab === 'packs' && (
          <View style={styles.content}>
            <Text style={styles.sectionTitle}>Fast Packs</Text>
            <Text style={styles.sectionSubtitle}>
              Curated recipes + audio for your evening.
            </Text>

            {/* Pack List */}
            <View style={styles.packsList}>
              {packs.map(pack => (
                <PackCard
                  key={pack.id}
                  pack={pack}
                  onPress={handlePackSelect}
                  selected={session.state.selectedPackId === pack.id}
                  locked={isPackLocked(pack)}
                />
              ))}
            </View>

            {/* Pack Recommendation Display */}
            {session.state.selectedPackId && packRecommendation && (
              <View style={styles.packRecommendation}>
                <Text style={styles.packRecLabel}>FROM THIS PACK</Text>
                <Text style={styles.packRecTitle}>{packRecommendation.recipeName}</Text>
                <Text style={styles.packRecDesc}>
                  One of {packs.find(p => p.id === session.state.selectedPackId)?.recipeIds.length} recipes in{' '}
                  {packRecommendation.packName}
                </Text>

                <TouchableOpacity
                  style={styles.startPackButton}
                  onPress={handleStartWithPack}
                >
                  <Text style={styles.startPackButtonText}>Start Cooking</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f1e8',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20,
  },
  userSection: {
    marginBottom: 16,
  },
  greeting: {
    fontSize: 24,
    fontWeight: '700',
    color: '#131b2e',
    lineHeight: 32,
  },
  audioIndicator: {
    marginTop: 12,
  },
  audioText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#131b2e',
  },
  audioSmall: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0dbd5',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginRight: 8,
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#131b2e',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#999',
    textAlign: 'center',
  },
  activeTabText: {
    color: '#131b2e',
    fontWeight: '600',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: '#131b2e',
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
    lineHeight: 22,
  },
  moodButtons: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  moodButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  moodButtonActive: {
    backgroundColor: '#131b2e',
    borderColor: '#131b2e',
  },
  moodButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    textAlign: 'center',
  },
  recommendation: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  recommendedLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#999',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  recommendedTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#131b2e',
    marginBottom: 8,
  },
  recommendedWhy: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
    marginBottom: 16,
  },
  startButton: {
    backgroundColor: '#131b2e',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  startButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  comingSoon: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginTop: 32,
  },
  packsList: {
    marginBottom: 24,
  },
  packRecommendation: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#131b2e',
  },
  packRecLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#999',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  packRecTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#131b2e',
    marginBottom: 6,
  },
  packRecDesc: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
    marginBottom: 14,
  },
  startPackButton: {
    backgroundColor: '#131b2e',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  startPackButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
