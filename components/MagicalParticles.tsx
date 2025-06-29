import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

const { width, height } = Dimensions.get('window');

interface MagicalParticlesProps {
  active: boolean;
  count?: number;
  color?: string;
}

const MagicalParticles: React.FC<MagicalParticlesProps> = ({ 
  active, 
  count = 20,
  color = '#FFFFFF'
}) => {
  if (!active) return null;
  
  const particles = Array(count).fill(0).map((_, i) => ({
    id: i,
    size: Math.random() * 4 + 2,
    x: Math.random() * width,
    y: Math.random() * height,
    opacity: Math.random() * 0.5 + 0.2
  }));
  
  return (
    <View style={styles.container} pointerEvents="none">
      {particles.map(particle => (
        <Animated.View
          key={particle.id}
          entering={FadeIn.duration(300)}
          exiting={FadeOut.duration(300)}
          style={[
            styles.particle,
            {
              width: particle.size,
              height: particle.size,
              left: particle.x,
              top: particle.y,
              opacity: particle.opacity,
              backgroundColor: color
            }
          ]}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
  },
  particle: {
    position: 'absolute',
    borderRadius: 50,
  },
});

export default MagicalParticles;