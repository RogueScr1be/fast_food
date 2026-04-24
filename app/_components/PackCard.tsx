import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
} from 'react-native';
import type { FastPack } from '../lib/seeds/packs';
import { GlassCard } from './GlassCard';

interface PackCardProps {
  pack: FastPack;
  onPress: (pack: FastPack) => void;
  selected?: boolean;
  locked?: boolean;
}

export function PackCard({ pack, onPress, selected = false, locked = false }: PackCardProps) {
  const handlePress = () => {
    if (!locked) {
      onPress(pack);
    }
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      style={[styles.cardContainer, selected && styles.selectedCard]}
      disabled={locked}
    >
      {/* Featured badge if applicable */}
      {pack.featured && (
        <View style={styles.featureBadge}>
          <Text style={styles.featureBadgeText}>FEATURED</Text>
        </View>
      )}

      {/* Locked badge if applicable */}
      {locked && (
        <View style={styles.lockedOverlay}>
          <Text style={styles.lockedIcon}>🔒</Text>
          <Text style={styles.lockedPrice}>
            ${pack.price?.toFixed(2)}
          </Text>
          <Text style={styles.unlockedText}>Unlock to use</Text>
        </View>
      )}

      {/* Content */}
      <GlassCard style={[styles.card, locked && styles.lockedCard]}>
        <Text style={styles.packName}>{pack.name}</Text>
        <Text style={styles.packDescription}>{pack.description}</Text>

        {/* Recipe count */}
        <View style={styles.metaRow}>
          <Text style={styles.metaText}>
            {pack.recipeIds.length} Recipes
          </Text>
          {pack.price !== null && (
            <Text style={styles.priceTag}>${pack.price.toFixed(2)}</Text>
          )}
        </View>

        {/* CTA button */}
        {!locked && (
          <TouchableOpacity
            style={[styles.selectButton, selected && styles.selectButtonActive]}
            onPress={handlePress}
          >
            <Text style={styles.selectButtonText}>
              {selected ? '✓ Selected' : 'Select Pack'}
            </Text>
          </TouchableOpacity>
        )}
      </GlassCard>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    marginBottom: 12,
  },
  selectedCard: {
    opacity: 1,
  },
  featureBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: '#131b2e',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    zIndex: 10,
  },
  featureBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
  },
  lockedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    zIndex: 5,
  },
  lockedIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  lockedPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  unlockedText: {
    fontSize: 12,
    color: '#fff',
    fontStyle: 'italic',
  },
  card: {
    padding: 16,
    borderRadius: 8,
  },
  lockedCard: {
    opacity: 0.6,
  },
  packName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#131b2e',
    marginBottom: 8,
  },
  packDescription: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  metaText: {
    fontSize: 12,
    color: '#999',
    fontWeight: '500',
  },
  priceTag: {
    fontSize: 14,
    fontWeight: '700',
    color: '#131b2e',
  },
  selectButton: {
    backgroundColor: '#131b2e',
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  selectButtonActive: {
    backgroundColor: '#2a3b54',
    borderWidth: 2,
    borderColor: '#131b2e',
  },
  selectButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
});
