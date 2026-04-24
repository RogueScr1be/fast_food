import { useContext } from 'react';
import { AudioContext, AudioContextType } from '../context/AudioContext';

export function useAudio(): AudioContextType {
  const context = useContext(AudioContext);

  if (!context) {
    throw new Error(
      'useAudio must be used within an AudioProvider. ' +
      'Make sure AudioProvider is mounted in app/_layout.tsx'
    );
  }

  return context;
}
