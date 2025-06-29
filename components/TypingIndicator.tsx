import React from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  withDelay,
  withRepeat,
  FadeIn,
} from 'react-native-reanimated';

interface TypingIndicatorProps {
  color?: string;
  size?: number;
  gap?: number;
}

const TypingIndicator: React.FC<TypingIndicatorProps> = ({
  color = '#8A2BE2',
  size = 8,
  gap = 4,
}) => {
  const dot1 = useSharedValue(0);
  const dot2 = useSharedValue(0);
  const dot3 = useSharedValue(0);
  
  React.useEffect(() => {
    dot1.value = withRepeat(
      withSequence(
        withTiming(-5, { duration: 300 }),
        withTiming(0, { duration: 300 })
      ),
      -1,
      true
    );
    
    dot2.value = withRepeat(
      withSequence(
        withDelay(150, withTiming(-5, { duration: 300 })),
        withTiming(0, { duration: 300 })
      ),
      -1,
      true
    );
    
    dot3.value = withRepeat(
      withSequence(
        withDelay(300, withTiming(-5, { duration: 300 })),
        withTiming(0, { duration: 300 })
      ),
      -1,
      true
    );
  }, []);
  
  const dot1Style = useAnimatedStyle(() => ({
    transform: [{ translateY: dot1.value }],
  }));
  
  const dot2Style = useAnimatedStyle(() => ({
    transform: [{ translateY: dot2.value }],
  }));
  
  const dot3Style = useAnimatedStyle(() => ({
    transform: [{ translateY: dot3.value }],
  }));
  
  return (
    <Animated.View 
      entering={FadeIn.duration(300)}
      style={styles.container}
    >
      <Animated.View 
        style={[
          styles.dot, 
          { 
            width: size, 
            height: size, 
            borderRadius: size / 2,
            backgroundColor: color,
            marginRight: gap
          },
          dot1Style
        ]} 
      />
      <Animated.View 
        style={[
          styles.dot, 
          { 
            width: size, 
            height: size, 
            borderRadius: size / 2,
            backgroundColor: color,
            marginRight: gap
          },
          dot2Style
        ]} 
      />
      <Animated.View 
        style={[
          styles.dot, 
          { 
            width: size, 
            height: size, 
            borderRadius: size / 2,
            backgroundColor: color
          },
          dot3Style
        ]} 
      />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    opacity: 0.7,
  },
});

export default TypingIndicator;